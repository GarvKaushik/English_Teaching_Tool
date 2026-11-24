"""Sign-in is handled by Supabase Auth (Google, email + password). The API only checks the access token it issues."""

import os
import time
from collections import defaultdict, deque

import jwt
from fastapi import Depends, Header, HTTPException

from app import db

REQUESTS_PER_MINUTE = 60
CLOCK_SKEW_SECONDS = 30
# shortcut: in-memory, single API process only; move to Redis when running more than one instance.
_hits: dict[int, deque] = defaultdict(deque)
_jwks: dict[str, jwt.PyJWKClient] = {}


def rate_limit(user_id: int) -> None:
    now = time.monotonic()
    hits = _hits[user_id]
    while hits and now - hits[0] > 60:
        hits.popleft()
    if len(hits) >= REQUESTS_PER_MINUTE:
        raise HTTPException(429, "Too many requests. Please slow down.")
    hits.append(now)


def supabase_url() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise HTTPException(503, "Sign-in is not configured (set SUPABASE_URL).")
    return url


def _signing_key(url: str, token: str):
    # Supabase's public keys; PyJWKClient caches them and refetches when a new key id appears.
    if url not in _jwks:
        _jwks[url] = jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600)
    return _jwks[url].get_signing_key_from_jwt(token).key


def auth_claims(authorization: str = Header("")) -> dict:
    """The verified Supabase access token: sub (auth user id), email, user_metadata, ..."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Please sign in.")
    url = supabase_url()
    try:
        if jwt.get_unverified_header(token).get("alg") == "HS256":
            # Projects still on Supabase's legacy shared JWT secret.
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise HTTPException(401, "Please sign in again.")
            key, algorithms = secret, ["HS256"]
        else:
            key, algorithms = _signing_key(url, token), ["ES256", "RS256"]
        # Leeway: Supabase's clock can be a few seconds ahead of this server's, making fresh tokens look "not yet valid".
        return jwt.decode(token, key, algorithms=algorithms, audience="authenticated", issuer=f"{url}/auth/v1",
                          leeway=CLOCK_SKEW_SECONDS)
    except jwt.PyJWKClientError:
        raise HTTPException(503, "Couldn't reach the sign-in service. Please try again.")
    except jwt.PyJWTError:
        raise HTTPException(401, "Your sign-in has expired. Please sign in again.")


def current_user(claims: dict = Depends(auth_claims)) -> dict:
    with db.connect() as con:
        row = con.execute("select * from users where auth_id = ?", (claims["sub"],)).fetchone()
        user = db.load_plan(con, dict(row)) if row else None
    if not user:
        # 428: signed in with Supabase but hasn't filled in name, phone and birth year yet.
        raise HTTPException(428, "Please complete your profile.")
    rate_limit(user["id"])
    return user
