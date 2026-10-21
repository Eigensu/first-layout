import re
import secrets
from datetime import datetime
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.models.user import User
from app.services.auth.identity import link_provider_identity
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
    """Still deduplicated, though it no longer has to be.

    Usernames become display names and lose their unique index, so a collision
    here will eventually be harmless. Until that lands the index is still live
    and an insert would fail, so the loop stays.
    """
    base = _slugify_username_base(email)
    candidate = base
    while await User.find_one(User.username == candidate):
        candidate = f"{base}-{secrets.token_hex(3)}"
    return candidate


async def _find_existing(google_id: str, email: str) -> Optional[User]:
    """Locate an account for this Google identity, old shape or new.

    The identity arrays are empty on every account until the backfill runs, so
    consulting only those would find nobody -- and this function creating a
    fresh account for someone who already has one is how a returning Google
    user ends up with a duplicate and an empty history. Both shapes are
    therefore checked, arrays first.
    """
    for query in (
        User.google_ids == google_id,
        User.google_id == google_id,
        User.emails == email.lower(),
        User.email == email,
    ):
        user = await User.find_one(query)
        if user:
            return user
    return None


async def _email_held_by_other(email: str, user: User) -> bool:
    for query in (User.emails == email.lower(), User.email == email):
        holder = await User.find_one(query)
        if holder is not None and holder.id != user.id:
            return True
    return False


async def find_or_create_google_user(payload: dict) -> User:
    """Find an existing user by Google sub/email, linking or creating as needed."""
    google_id = payload["sub"]
    email = payload["email"]
    full_name = payload.get("name")
    avatar_url = payload.get("picture")

    user = await _find_existing(google_id, email)
    if user:
        # An existing account, reached by Google id or by a matching,
        # Google-verified email. Link the identity rather than duplicating it,
        # and append rather than overwrite: a merged account can legitimately
        # hold more than one Google identity.
        address = email.lower()
        add_address = (
            address not in user.emails
            # An address its owner changed away from stays removed.
            and address not in user.removed_emails
            # Skipped when another account holds the address: a Google account
            # can change its email to one already registered here, and
            # uniq_emails would then fail the write -- refusing a returning
            # user's sign-in by the Google id that identifies them exactly.
            and not await _email_held_by_other(email, user)
        )
        await link_provider_identity(
            user, "google_ids", "google_id", google_id, address if add_address else None
        )
        return user

    username = await _generate_unique_username(email)
    new_user = User(
        username=username,
        email=email,
        # Written in the target shape from the start, so these accounts need
        # nothing from the backfill.
        emails=[email.lower()],
        google_ids=[google_id],
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
