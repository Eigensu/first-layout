from typing import Optional

from beanie import PydanticObjectId
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.models.user import User
from app.utils.security import decode_token


async def resolve_token_subject(subject: str) -> Optional[User]:
    """Resolve a JWT `sub`, which is a user id now and was a username before.

    The subject changed because usernames stop being unique when five user
    collections become one: resolving by name would then pick an arbitrary
    account, which is to say somebody else's.

    Tokens minted before this shipped are still valid and still carry a
    username, so both forms are accepted until every one of them has expired --
    access tokens last a day and refresh tokens a week, so this branch can go
    about eight days after deploy. Removing it sooner signs out everyone
    holding a live session.
    """
    if ObjectId.is_valid(subject):
        user = await User.get(PydanticObjectId(subject))
        if user:
            return user
        # Falls through on purpose: a username that happens to be 24 hex
        # characters is absurd but not impossible, and checking costs one
        # query on a path that has already missed.

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

    user = await resolve_token_subject(subject)
    if user is None:
        raise credentials_exception

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


async def get_admin_user(current_user: User = Depends(get_current_active_user)) -> User:
    """Ensure user is admin."""
    if not getattr(current_user, "is_admin", False):
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
