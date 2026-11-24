import re
from collections import Counter

from fastapi import APIRouter, Depends, File, UploadFile

from app import audio, db, llm
from app.auth import current_user

router = APIRouter(prefix="/v1")

THINK_SECONDS, SPEAK_SECONDS = 10, 60
FILLERS = {"um", "umm", "uh", "uhh", "er", "erm", "ah", "hmm", "like", "basically", "actually", "literally"}
TOPICS = [
    "Your favourite festival", "A place you would love to visit", "The best advice you have received",
    "Should students wear uniforms?", "Your favourite food and how to make it", "A person who inspires you",
    "Mobile phones: good or bad for children?", "Your dream job", "The importance of learning English",
    "A memorable trip", "Cricket or football?", "Life in a city versus a village", "Your favourite film",
    "How to stay healthy", "Online shopping", "A skill you want to learn", "Your morning routine",
    "Should homework be banned?", "The best day of your life", "Social media", "Your hometown",
    "Books or movies?", "Saving money", "Pets", "Working from home", "Your favourite season",
    "Public transport", "A hobby you enjoy", "Technology in schools", "What makes a good friend",
]


def topic_of_day() -> str:
    # One shared topic per day so friends can compare scores.
    return TOPICS[db.today().toordinal() % len(TOPICS)]


def speech_metrics(text: str, duration: float, long_pauses: int) -> dict:
    words = re.findall(r"[a-z']+", text.lower())
    fillers = Counter(w for w in words if w in FILLERS)
    return {
        "word_count": len(words),
        "words_per_minute": round(len(words) / duration * 60) if duration else 0,
        "fillers": dict(fillers),
        "filler_count": sum(fillers.values()),
        "repetitions": sum(1 for a, b in zip(words, words[1:]) if a == b),
        "long_pauses": long_pauses,
    }


@router.get("/jam/topic")
def topic():
    return {"topic": topic_of_day(), "think_seconds": THINK_SECONDS, "speak_seconds": SPEAK_SECONDS}


@router.post("/jam")
async def jam(audio_file: UploadFile = File(..., alias="audio"), user: dict = Depends(current_user)):
    wav, duration = await audio.receive(audio_file, user, max_seconds=SPEAK_SECONDS + 10)
    text = await llm.transcribe(wav)
    metrics = speech_metrics(text, duration, audio.long_pauses(wav))
    topic_text = topic_of_day()

    review = await llm.chat_json(
        "You are a kind English speaking coach judging a 'Just a Minute' round, where the learner speaks for 60 seconds "
        "on a topic. The transcript comes from speech-to-text, so ignore punctuation. Reply in JSON: "
        '{"fluency": 0-100, "vocabulary": 0-100, "grammar": 0-100, "relevance": 0-100, '
        f'"feedback": 2-3 sentences with one clear tip, {llm.MISTAKES_SPEC}}}. '
        f"Write feedback and explanations in {llm.explain_language(user)}.",
        f"Topic: {topic_text}\nSpoke for {duration:.0f} s. Measured: {metrics}\nTranscript: {text}",
    )
    parts = {k: llm.score_of(review.get(k)) for k in ("fluency", "vocabulary", "grammar", "relevance")}
    penalty = min(20, 2 * metrics["filler_count"]) + min(10, 2 * metrics["long_pauses"])
    score = max(0, round(sum(parts.values()) / len(parts)) - penalty)
    xp = max(5, score // 5)

    with db.connect() as con:
        mistakes = db.save_mistakes(con, user["id"], "jam", review.get("mistakes"))
        db.award(con, user["id"], "jam", score, xp, {"topic": topic_text})
    return {"topic": topic_text, "transcript": text, "metrics": metrics, "scores": parts, "penalty": penalty,
            "score": score, "feedback": str(review.get("feedback", "")), "mistakes": mistakes, "xp": xp}
