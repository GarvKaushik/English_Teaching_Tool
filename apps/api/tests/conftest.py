import io
import math
import time
import zlib
import wave
from array import array

import jwt
import pytest
from fastapi.testclient import TestClient

from app import auth, azure_speech, daily_word, db, llm
from app.main import app


def make_wav(seconds=1.0, rate=16000, channels=1, pattern=None) -> bytes:
    """A 440 Hz tone standing in for speech. `pattern` is [(seconds, is_speech), ...] to mix in silence."""
    samples = array("h")
    for length, speech in pattern or [(seconds, True)]:
        samples.extend(int(8000 * math.sin(2 * math.pi * 440 * i / rate)) if speech else 0 for i in range(int(rate * length)))
    if channels > 1:
        samples = array("h", (s for s in samples for _ in range(channels)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.tobytes())
    return buf.getvalue()


def make_pdf(text: str) -> bytes:
    """Smallest valid one-page PDF showing `text` in Helvetica."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


SUPABASE_URL = "https://test-project.supabase.co"
JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"


def make_token(sub="user-asha", email="asha@example.com", secret=JWT_SECRET, **claims) -> str:
    """A Supabase-style access token (legacy HS256 secret, as some projects still use)."""
    payload = {"sub": sub, "email": email, "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1",
               "exp": int(time.time()) + 3600, **claims}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    db.init()
    auth._hits.clear()


@pytest.fixture
def fakes(monkeypatch):
    """Replace every external provider with canned responses."""
    state = {"flagged": False, "transcript": "I would like a coffee please", "json": {}}

    async def chat(system, messages):
        return "Welcome! What would you like?"

    async def chat_json(system, user):
        return state["json"]

    async def is_flagged(text):
        return state["flagged"]

    async def speak(text):
        return "bXAz"

    async def dictionary(word):
        return (word != "zzzzz"), {"meanings": [{"partOfSpeech": "noun", "definitions": [{"definition": "a thing"}]}]}

    monkeypatch.setattr(llm, "chat", chat)
    monkeypatch.setattr(llm, "chat_json", chat_json)
    monkeypatch.setattr(llm, "is_flagged", is_flagged)
    async def openai_transcribe(wav):
        return state["transcript"]
    monkeypatch.setattr(llm, "transcribe", openai_transcribe)
    monkeypatch.setattr(azure_speech, "speak", speak)
    monkeypatch.setattr(daily_word, "dictionary", dictionary)
    return state


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def login(client, fakes):
    """Sign in as `name` (a fresh Supabase user per name) and fill in the profile on first use."""
    def do(name="Asha", birth_year=2000, **extra):
        headers = {"Authorization": f"Bearer {make_token(sub=f'user-{name.lower()}', email=f'{name.lower()}@example.com')}"}
        if client.get("/v1/me", headers=headers).status_code == 428:
            phone = f"+9198{zlib.crc32(name.lower().encode()) % 10**8:08d}"
            r = client.post("/v1/auth/profile", headers=headers,
                            json={"name": name, "phone": phone, "birth_year": birth_year, **extra})
            assert r.status_code == 200, r.text
        return headers
    return do
