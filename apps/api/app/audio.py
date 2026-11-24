import io
import math
import wave
from array import array

from fastapi import HTTPException, UploadFile

from app import db
from app.errors import NoSpeechDetected

RATE = 16000
BYTES_PER_SECOND = RATE * 2  # mono 16-bit
WINDOW = RATE // 20  # 50 ms of samples
MIN_LEVEL = 300  # RMS below this is silence even in a quiet room
EDGE_PAD = 4  # keep 200 ms around speech so first and last sounds aren't clipped


def _wav(frames: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    return buf.getvalue()


def _frames(wav: bytes) -> bytes:
    with wave.open(io.BytesIO(wav)) as w:
        return w.readframes(w.getnframes())


def speech_windows(frames: bytes) -> list[bool]:
    """One flag per 50 ms window: True where someone is speaking."""
    samples = array("h", frames[: len(frames) // 2 * 2])
    levels = [math.sqrt(sum(s * s for s in samples[i:i + WINDOW]) / WINDOW)
              for i in range(0, len(samples) - WINDOW + 1, WINDOW)]
    if not levels:
        return []
    loud = sorted(levels)[int(len(levels) * 0.95)]
    threshold = max(MIN_LEVEL, loud * 0.1)  # relative to the speaker's own volume
    return [level > threshold for level in levels]


def trim_silence(frames: bytes) -> bytes:
    """Cut silence before and after speech, so we neither pay to transcribe it nor charge it to the learner."""
    flags = speech_windows(frames)
    if not any(flags):
        raise NoSpeechDetected()
    first = max(0, flags.index(True) - EDGE_PAD)
    last = min(len(flags), len(flags) - flags[::-1].index(True) + EDGE_PAD)
    return frames[first * WINDOW * 2:last * WINDOW * 2]


def long_pauses(wav: bytes, seconds: float = 1.5) -> int:
    """Silences longer than `seconds` between bits of speech (JAM fluency)."""
    count = run = 0
    for speaking in speech_windows(_frames(wav)):
        if speaking:
            count += run * 0.05 > seconds
            run = 0
        else:
            run += 1
    return count  # trailing silence never counts: it's followed by no speech


async def receive(upload: UploadFile, user: dict, max_seconds: int) -> tuple[bytes, float]:
    """Validate an uploaded recording, trim silence and charge the speech to the user's daily limit.

    Returns (clean 16 kHz mono WAV, seconds of speech). Audio is never stored.
    """
    data = await upload.read(max_seconds * BYTES_PER_SECOND + 1024)
    if len(data) > max_seconds * BYTES_PER_SECOND + 1000:
        raise HTTPException(413, f"Recording is too long (max {max_seconds} seconds).")
    # Check the bytes, not the client-supplied content type.
    try:
        with wave.open(io.BytesIO(data)) as w:
            ok = w.getnchannels() == 1 and w.getframerate() == RATE and w.getsampwidth() == 2
            frames = w.readframes(w.getnframes())
    except (wave.Error, EOFError):
        ok = False
    if not ok:
        raise HTTPException(415, "Audio must be 16 kHz mono 16-bit WAV.")
    if len(frames) / BYTES_PER_SECOND < 0.5:
        raise HTTPException(422, "Recording is too short. Please try again.")
    frames = trim_silence(frames)
    duration = len(frames) / BYTES_PER_SECOND
    db.charge_speaking(user, duration)
    return _wav(frames), duration
