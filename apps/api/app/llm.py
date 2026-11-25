import json
import os
import re

from openai import AsyncOpenAI, OpenAIError

from app.errors import NoSpeechDetected, ProviderFailed, ProviderUnavailable

_client: AsyncOpenAI | None = None


def _get() -> AsyncOpenAI:
    global _client
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ProviderUnavailable("AI is not configured (set OPENAI_API_KEY).")
    if _client is None:
        _client = AsyncOpenAI(api_key=key, timeout=30)
    return _client


def _model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")


async def chat(system: str, messages: list[dict]) -> str:
    try:
        r = await _get().chat.completions.create(model=_model(), messages=[{"role": "system", "content": system}, *messages])
    except OpenAIError as e:
        raise ProviderFailed(f"AI request failed: {e}") from e
    return (r.choices[0].message.content or "").strip()


async def chat_json(system: str, user: str) -> dict:
    try:
        r = await _get().chat.completions.create(
            model=_model(),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
        )
        result = json.loads(r.choices[0].message.content or "{}")
    except (OpenAIError, json.JSONDecodeError) as e:
        raise ProviderFailed(f"AI request failed: {e}") from e
    return result if isinstance(result, dict) else {}


async def transcribe(wav: bytes) -> str:
    """Speech-to-text for every feature (about a quarter of Azure's real-time price)."""
    try:
        r = await _get().audio.transcriptions.create(
            model=os.environ.get("OPENAI_STT_MODEL", "gpt-transcribe"),
            file=("speech.wav", wav, "audio/wav"),
            languages=["en"],
            # Learners' mistakes must survive transcription, or the feedback can't catch them.
            prompt="An Indian English learner speaking. Write exactly what they say, keeping any grammar mistakes "
                   "and filler words like um, uh and like.",
        )
    except OpenAIError as e:
        raise ProviderFailed(f"Transcription failed: {e}") from e
    text = (r.text or "").strip()
    if not text:
        raise NoSpeechDetected()
    return text


async def is_flagged(text: str) -> bool:
    try:
        r = await _get().moderations.create(model="omni-moderation-latest", input=text)
    except OpenAIError as e:
        raise ProviderFailed(f"Moderation failed: {e}") from e
    return any(result.flagged for result in r.results)


SPOKEN_STYLE = (
    "Your reply is read aloud by a voice, so write plain spoken sentences only: no markdown, asterisks, bullet points, "
    "numbered lists, headings, emojis, links or stage directions like (smiles), and don't start with your name. "
    "Write ranges and symbols as words (\"two to three years\", \"and\", \"per cent\")."
)
_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def plain_speech(text: str) -> str:
    """Safety net for SPOKEN_STYLE: strip markdown and emojis so the voice doesn't read out symbols."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # [label](url) -> label
    text = re.sub(r"^\s*(#+|[-*•]|\d+[.)])\s+", "", text, flags=re.M)  # headings, bullets, list numbers
    text = re.sub(r"[*_`~#]+", "", _EMOJI.sub("", text))
    text = re.sub(r"(\d)\s*[-–]\s*(\d)", r"\1 to \2", text)  # "2-3 years" -> "2 to 3 years", not "2 minus 3"
    text = text.replace(" & ", " and ")
    # End each line with punctuation so list items get a pause instead of running together.
    lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
    return " ".join(line if line[-1] in ".!?:;," else line + "." for line in lines)


def bare_words(text: str) -> str:
    """Lowercase words without punctuation (apostrophes kept): what the learner actually said, minus STT's guesses."""
    return " ".join(re.sub(r"[^\w\s']", " ", text.lower()).split())


def score_of(value) -> int:
    """Clamp an AI-provided score to an int 0-100."""
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return 0


HINGLISH = "Hinglish (simple Hindi written in Roman letters, mixed with easy English)"


def explain_language(user: dict) -> str:
    # Mother-tongue support: Hinglish for beginners/intermediates who chose it, English only once advanced.
    if user["explain_lang"] == "hinglish" and user["level"] != "advanced":
        return HINGLISH
    return "simple English"


MISTAKES_SPEC = (
    '"mistakes": a list (max 8) of {"type": "grammar" | "vocabulary" | "phrasing", '
    '"original": the learner\'s exact words, "correction": the corrected version, '
    '"explanation": one short sentence}'
)
