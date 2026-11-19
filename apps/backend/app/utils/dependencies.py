from typing import Optional

from beanie import PydanticObjectId
from bson import ObjectId
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.models.tournament_membership import ROLE_ADMIN, TournamentMembership
from app.models.user import User
from app.utils.security import decode_token
from app.utils.tenant import TenantId, get_tenant
from config.observability import identify_user
from config.settings import settings

# Marks a token whose `sub` is a user id. Tokens minted before ids became the
# subject carry a username there and no such claim, and the two must never be
# told apart by the string's shape: registration accepts any username,
# including one spelling another account's 24-character id.
SUBJECT_KIND_CLAIM = "sub_kind"
SUBJECT_KIND_USER_ID = "user_id"


def subject_claims(user: User) -> dict:
    """The claims every newly minted access or refresh token carries."""
    return {"sub": str(user.id), SUBJECT_KIND_CLAIM: SUBJECT_KIND_USER_ID}


async def resolve_token_subject(
    subject: str, kind: Optional[str] = None
) -> Optional[User]:
    """Resolve a JWT `sub`, which is a user id now and was a username before.

    The subject changed because usernames stop being unique when five user
    collections become one: resolving by name would then pick an arbitrary
    account, which is to say somebody else's.

    `kind` is the token's SUBJECT_KIND_CLAIM. With it, the subject is an id and
    nothing else is consulted. Without it the token predates the claim, and its
    subject is read as the username it was minted for -- until every such token
    has expired: access tokens last a day and refresh tokens a week, so this
    branch can go about eight days after deploy. Removing it sooner signs out
    everyone holding a live session.
    """
    if kind == SUBJECT_KIND_USER_ID:
        if not ObjectId.is_valid(subject):
            return None
        return await User.get(PydanticObjectId(subject))

    if ObjectId.is_valid(subject):
        # A claimless 24-hex subject is either a username that looks like an id
        # or an id minted by the interim build that predates the claim, and
        # there is no telling which. Guessing is how a token for one account
        # opens another, so it is refused. That costs its holder one refresh:
        # the refresh route resolves from its stored record, not from `sub`.
        return None

    matches = await User.find(User.username == subject).limit(2).to_list()
    if len(matches) > 1:
        # Two accounts answer to this name, so there is no safe answer. This is
        # the case that must never be guessed at.
        return None
    return matches[0] if matches else None


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode token
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    subject: str = payload.get("sub")
    if subject is None:
        raise credentials_exception

    # Check token type
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type"
        )

    user = await resolve_token_subject(subject, payload.get(SUBJECT_KIND_CLAIM))
    if user is None:
        raise credentials_exception

    identify_user(str(user.id))
    return user


async def get_optional_current_user(
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """The signed-in user if a valid access token came with the request.

    For public endpoints that show their owner a little more -- a leaderboard's
    "your rank" row, a team before its contest starts. Resolves the subject
    exactly as get_current_user does; these used to read `sub` as a username
    themselves, and stopped recognising anyone once tokens carried ids.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_token(authorization[len("Bearer ") :])
    if payload is None or payload.get("type") != "access":
        return None
    subject = payload.get("sub")
    if not subject or not isinstance(subject, str):
        return None
    user = await resolve_token_subject(subject, payload.get(SUBJECT_KIND_CLAIM))
    if user is not None:
        identify_user(str(user.id))
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure user is active"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user"
        )
    return current_user


def is_platform_admin(user: User) -> bool:
    """Whether this user runs the whole platform, which is the tournament registry.

    A single-tournament service is its own platform, and its admins have always
    run its registry. Under shared tenancy it is the allowlisted flag the
    migration sets (spec §4.7). The legacy is_admin, which the migration clears,
    says nothing about anyone else's tournament.
    """
    if not settings.shared_tenancy:
        return user.is_admin
    return user.is_platform_admin


async def is_tournament_admin(user: User, tournament_id: TenantId) -> bool:
    """Whether this user administers the tournament a request is for.

    Under shared tenancy that means a platform admin, or a member whose role in
    this tournament is admin. Being admin in one tournament is nothing in
    another. The global is_admin is not consulted at all: every legacy admin
    held it, and honouring it would hand each of them every tournament.
    """
    if is_platform_admin(user):
        return True
    if not settings.shared_tenancy or tournament_id is None:
        return False
    membership = await TournamentMembership.find_one(
        TournamentMembership.user_id == user.id,
        TournamentMembership.tournament_id == tournament_id,
        TournamentMembership.role == ROLE_ADMIN,
    )
    return membership is not None


async def get_platform_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure the user runs the platform: the routes that manage the registry."""
    if not is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


async def get_tournament_admin(
    current_user: User = Depends(get_current_active_user),
    tournament_id: TenantId = Depends(get_tenant),
) -> User:
    """Ensure the user administers the tournament this request is for.

    Admin pages are served on each tournament's own subdomain, and the frontend
    takes X-Tournament-Slug from that host, so the page being edited and the
    tournament being checked are the same one. The user is resolved first so
    that being signed out answers 401 before a missing tournament answers 400.
    """
    if not await is_tournament_admin(current_user, tournament_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_current_verified_user(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Ensure user is verified"""
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified"
        )
    return current_user
