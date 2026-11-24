import asyncio

from fastapi import APIRouter, Depends, File, UploadFile

from app import audio, db, llm
from app.auth import current_user

router = APIRouter(prefix="/v1")

# Spoken questions from easy to hard, so beginners can still answer the first one.
QUESTIONS = [
    "Tell me about yourself: your name, where you live and what you do every day.",
    "Describe a place you visited recently. What did you see and do there?",
    "Some people say online learning is better than learning in a classroom. Do you agree? Explain why.",
]
MAX_SECONDS = 45


def placement_level(scores: list[float]) -> str:
    average = sum(scores) / len(scores)
    return "advanced" if average >= 80 else "intermediate" if average >= 60 else "beginner"


@router.get("/placement")
def placement_content():
    return {"questions": QUESTIONS, "max_seconds": MAX_SECONDS}


@router.post("/placement")
async def placement(answer_0: UploadFile = File(...), answer_1: UploadFile = File(...),
                    answer_2: UploadFile = File(...), user: dict = Depends(current_user)):
    wavs = [(await audio.receive(f, user, max_seconds=MAX_SECONDS))[0] for f in (answer_0, answer_1, answer_2)]
    transcripts = await asyncio.gather(*(llm.transcribe(wav) for wav in wavs))

    answers = "\n\n".join(f"Question {i + 1}: {q}\nAnswer: {llm.bare_words(t)}"
                          for i, (q, t) in enumerate(zip(QUESTIONS, transcripts)))
    grade = await llm.chat_json(
        "You assess an English learner's spoken answers for a placement test. The answers come from speech-to-text, "
        "so they have no punctuation: judge only grammar, vocabulary and fluency of speech. Reply in JSON: "
        '{"grammar": 0-100, "vocabulary": 0-100, "fluency": 0-100, "feedback": 1-2 encouraging sentences with one tip}. '
        f"Write feedback in {llm.explain_language(user)}.",
        answers,
    )
    scores = {k: llm.score_of(grade.get(k)) for k in ("grammar", "vocabulary", "fluency")}
    level = placement_level(list(scores.values()))
    overall = round(sum(scores.values()) / len(scores))

    with db.connect() as con:
        con.execute("update users set level = ? where id = ?", (level, user["id"]))
        db.award(con, user["id"], "placement", overall, 50)
    return {"level": level, "score": overall, "scores": scores, "transcripts": list(transcripts),
            "feedback": str(grade.get("feedback", "")), "xp": 50}
