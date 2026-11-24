import json
import re
from collections import Counter

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app import audio, azure_speech, db, llm
from app.auth import current_user

router = APIRouter(prefix="/v1")

MAX_GUESSES = 6
BONUS_XP = 20
ANSWERS = [
    "about", "admit", "adult", "after", "again", "agree", "alarm", "alive", "allow", "alone", "apple", "award",
    "beach", "begin", "bread", "brick", "brush", "cabin", "chair", "cheap", "chest", "child", "clean", "clear",
    "cloud", "coach", "count", "dance", "dream", "drink", "early", "earth", "enjoy", "equal", "event", "faith",
    "field", "fresh", "fruit", "glass", "grape", "green", "happy", "heart", "honey", "house", "laugh", "learn",
    "light", "lucky", "magic", "money", "music", "ocean", "paint", "peace", "plant", "quiet", "river", "shine",
    "smile", "sound", "speak", "storm", "sweet", "table", "teach", "thank", "tiger", "train", "voice", "water",
    "world", "young",
]


class Guess(BaseModel):
    word: str


def answer_for_today() -> str:
    # Same word for everyone each day.
    return ANSWERS[db.today().toordinal() % len(ANSWERS)]


def evaluate(guess: str, answer: str) -> list[str]:
    """Wordle-style colouring that handles repeated letters correctly."""
    result = ["absent"] * len(guess)
    unmatched = Counter()
    for i, (g, a) in enumerate(zip(guess, answer)):
        if g == a:
            result[i] = "correct"
        else:
            unmatched[a] += 1
    for i, g in enumerate(guess):
        if result[i] != "correct" and unmatched[g]:
            result[i] = "present"
            unmatched[g] -= 1
    return result


async def dictionary(word: str) -> tuple[bool | None, dict | None]:
    """Look up a word in the Free Dictionary API. Returns (exists, entry); exists is None if the service is down."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}")
    except httpx.HTTPError:
        return None, None
    if r.status_code == 404:
        return False, None
    if r.status_code != 200:
        return None, None
    data = r.json()
    return True, data[0] if isinstance(data, list) and data else None


async def _reveal(answer: str, user: dict) -> dict:
    _, entry = await dictionary(answer)
    meaning = example = phonetic = ""
    if entry:
        phonetic = entry.get("phonetic") or next((p.get("text") for p in entry.get("phonetics", []) if p.get("text")), "")
        for m in entry.get("meanings", []):
            for d in m.get("definitions", []):
                meaning = meaning or f"({m.get('partOfSpeech', '')}) {d.get('definition', '')}"
                example = example or d.get("example", "")
    return {"word": answer, "meaning": meaning, "example": example, "phonetic": phonetic,
            "audio": await azure_speech.speak_for(user, answer, shared=True)}


async def _state(row, answer: str, user: dict) -> dict:
    finished = bool(row and row["finished"])
    return {
        "guesses": json.loads(row["guesses"]) if row else [],
        "max_guesses": MAX_GUESSES,
        "finished": finished,
        "solved": bool(row and row["solved"]),
        "bonus_done": bool(row and row["bonus_done"]),
        "reveal": await _reveal(answer, user) if finished else None,
    }


def _game(con, user_id: int):
    return con.execute("select * from daily_word_games where user_id = ? and day = ?",
                       (user_id, db.today().isoformat())).fetchone()


@router.get("/daily-word")
async def state(user: dict = Depends(current_user)):
    with db.connect() as con:
        row = _game(con, user["id"])
    return await _state(row, answer_for_today(), user)


@router.post("/daily-word/guess")
async def guess(body: Guess, user: dict = Depends(current_user)):
    word = body.word.strip().lower()
    if not re.fullmatch(r"[a-z]{5}", word):
        raise HTTPException(422, "Enter a 5-letter word.")
    answer = answer_for_today()
    with db.connect() as con:
        row = _game(con, user["id"])
    if row and row["finished"]:
        raise HTTPException(409, "You've finished today's word. Come back tomorrow!")
    if word != answer:
        exists, _ = await dictionary(word)
        # shortcut: if the dictionary service is down, any 5 letters are accepted.
        if exists is False:
            raise HTTPException(422, "That word isn't in the dictionary.")

    guesses = (json.loads(row["guesses"]) if row else []) + [{"word": word, "result": evaluate(word, answer)}]
    solved = word == answer
    finished = solved or len(guesses) >= MAX_GUESSES
    with db.connect() as con:
        con.execute(
            "insert into daily_word_games (user_id, day, guesses, finished, solved) values (?, ?, ?, ?, ?) "
            "on conflict (user_id, day) do update set guesses = excluded.guesses, finished = excluded.finished, "
            "solved = excluded.solved",
            (user["id"], db.today().isoformat(), json.dumps(guesses), int(finished), int(solved)),
        )
        if finished:
            n = len(guesses)
            db.award(con, user["id"], "daily_word", 100 - (n - 1) * 15 if solved else 0, (7 - n) * 10 if solved else 5)
        row = _game(con, user["id"])
    return await _state(row, answer, user)


@router.post("/daily-word/sentence")
async def sentence(audio_file: UploadFile = File(..., alias="audio"), user: dict = Depends(current_user)):
    answer = answer_for_today()
    with db.connect() as con:
        row = _game(con, user["id"])
    if not row or not row["finished"]:
        raise HTTPException(409, "Finish today's word first.")
    if row["bonus_done"]:
        raise HTTPException(409, "You've already earned today's bonus.")

    wav, _ = await audio.receive(audio_file, user, max_seconds=15)
    said = await llm.transcribe(wav)
    if answer not in re.findall(r"[a-z]+", said.lower()):
        return {"transcript": said, "correct": False, "feedback": f'We didn\'t hear the word "{answer}". Try again!', "xp": 0}

    check = await llm.chat_json(
        "You check whether an English learner used a given word correctly in a spoken sentence (speech-to-text, so "
        'ignore punctuation). Reply in JSON: {"correct": true or false, "feedback": one short encouraging sentence}. '
        f"Write feedback in {llm.explain_language(user)}.",
        f'Word: "{answer}"\nSentence: {said}',
    )
    correct = check.get("correct") is True
    if correct:
        with db.connect() as con:
            con.execute("update daily_word_games set bonus_done = 1 where user_id = ? and day = ?",
                        (user["id"], db.today().isoformat()))
            db.award(con, user["id"], "daily_word_bonus", None, BONUS_XP)
    return {"transcript": said, "correct": correct, "feedback": str(check.get("feedback", "")),
            "xp": BONUS_XP if correct else 0}
