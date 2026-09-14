import time
from datetime import datetime
from typing import Optional

import httpx
from jose import JWTError, jwt

from app.models.user import User
from app.services.auth.google import _generate_unique_username
from config.settings import get_settings

settings = get_settings()

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
_JWKS_TTL_SECONDS = 24 * 60 * 60

# Apple rotates signing keys infrequently, so an in-memory TTL cache (no
# Redis) matches this codebase's simplicity level elsewhere.
_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


class AppleTokenError(Exception):
    """Raised when an Apple identity token fails verification."""


async def _fetch_jwks() -> list:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(APPLE_KEYS_URL)
        resp.raise_for_status()
        return resp.json().get("keys", [])


async def _get_jwks(force_refresh: bool = False) -> list:
    stale = (time.time() - _jwks_cache["fetched_at"]) > _JWKS_TTL_SECONDS
    if force_refresh or stale or not _jwks_cache["keys"]:
        _jwks_cache["keys"] = await _fetch_jwks()
        _jwks_cache["fetched_at"] = time.time()
    return _jwks_cache["keys"]


async def verify_apple_identity_token(token: str) -> dict:
    """Verify an Apple identity token (from native Sign in with Apple) and
    return its payload.

    Raises AppleTokenError if the token is invalid, expired, or was not
    issued for this app's bundle id.
    """
    if not settings.apple_bundle_id:
        raise AppleTokenError("Apple sign-in is not configured")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise AppleTokenError(str(e))

    kid = unverified_header.get("kid")
    keys = await _get_jwks()
    matching_key = next((k for k in keys if k.get("kid") == kid), None)
    if matching_key is None:
        # Apple rotated keys since the cache was last filled.
        keys = await _get_jwks(force_refresh=True)
        matching_key = next((k for k in keys if k.get("kid") == kid), None)
    if matching_key is None:
        raise AppleTokenError("Apple signing key not found")

    try:
        payload = jwt.decode(
            token,
            matching_key,
            algorithms=["RS256"],
            audience=settings.apple_bundle_id,
            issuer=APPLE_ISSUER,
        )
    except JWTError as e:
        raise AppleTokenError(str(e))

    return payload


async def _find_existing(apple_id: str, email: Optional[str]) -> Optional[User]:
    """Locate an account for this Apple identity, old shape or new.

    Mirrors app.services.auth.google._find_existing: the identity arrays are
    empty until the backfill runs, so the scalar fields are consulted too.
    """
    queries = [User.apple_ids == apple_id, User.apple_id == apple_id]
    if email:
        queries += [User.emails == email.lower(), User.email == email]
    for query in queries:
        user = await User.find_one(query)
        if user:
            return user
    return None


async def find_or_create_apple_user(
    payload: dict, full_name: Optional[str] = None
) -> User:
    """Find an existing user by Apple sub/email, linking or creating as needed."""
    apple_id = payload["sub"]
    email = payload.get("email")

    user = await _find_existing(apple_id, email)
    if user:
        # An existing account, reached by Apple id or by a matching email.
        # Link the identity rather than duplicating it, and append rather
        # than overwrite: a merged account can legitimately hold more than
        # one Apple identity.
        if apple_id not in user.apple_ids:
            user.apple_ids.append(apple_id)
        if not user.apple_id:
            user.apple_id = user.apple_ids[0]
        if email and email.lower() not in user.emails:
            user.emails.append(email.lower())
        user.is_verified = True
        await user.save()
        return user

    # Defensive fallback only: the native iOS flow with the .fullName/.email
    # scopes always includes an email, but nothing stops Apple from omitting
    # it, and the unique email index would otherwise reject the insert.
    account_email = email or f"{apple_id}@apple.private"

    username = await _generate_unique_username(account_email)
    new_user = User(
        username=username,
        email=account_email,
        emails=[account_email.lower()],
        apple_ids=[apple_id],
        hashed_password=None,
        auth_provider="apple",
        apple_id=apple_id,
        full_name=full_name,
        is_verified=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await new_user.insert()
    return new_user
