import re
import secrets
from datetime import datetime
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.models.user import User
from config.settings import get_settings

settings = get_settings()


class GoogleTokenError(Exception):
    """Raised when a Google ID token fails verification."""


def verify_google_id_token(token: str) -> dict:
    """Verify a Google Identity Services ID token and return its payload.

    Raises GoogleTokenError if the token is invalid, expired, or was not
    issued for this app's Google OAuth client.
    """
    if not settings.google_client_id:
        raise GoogleTokenError("Google sign-in is not configured")

    try:
        payload = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as e:
        raise GoogleTokenError(str(e))

    if not payload.get("email_verified"):
        raise GoogleTokenError("Google account email is not verified")

    return payload


def _slugify_username_base(email: str) -> str:
    base = email.split("@")[0].lower()
    base = re.sub(r"[^a-z0-9_-]", "", base)
    base = base or "user"
    return base[:40]


async def _generate_unique_username(email: str) -> str:
    base = _slugify_username_base(email)
    candidate = base
    while await User.find_one(User.username == candidate):
        candidate = f"{base}-{secrets.token_hex(3)}"
    return candidate


async def find_or_create_google_user(payload: dict) -> User:
    """Find an existing user by Google sub/email, linking or creating as needed."""
    google_id = payload["sub"]
    email = payload["email"]
    full_name = payload.get("name")
    avatar_url = payload.get("picture")

    user = await User.find_one(User.google_id == google_id)
    if user:
        return user

    user = await User.find_one(User.email == email)
    if user:
        # Existing password account signing in with a matching, Google-verified
        # email — link the Google identity rather than creating a duplicate.
        user.google_id = google_id
        user.is_verified = True
        await user.save()
        return user

    username = await _generate_unique_username(email)
    new_user = User(
        username=username,
        email=email,
        hashed_password=None,
        auth_provider="google",
        google_id=google_id,
        full_name=full_name,
        avatar_url=avatar_url,
        is_verified=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await new_user.insert()
    return new_user
