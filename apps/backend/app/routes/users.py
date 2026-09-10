from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.models.user import RefreshToken, User
from app.schemas.user import DeleteAccountRequest, UserResponse, UserUpdateRequest
from app.services.auth.google import GoogleTokenError, verify_google_id_token
from app.utils.dependencies import get_current_active_user
from app.utils.gridfs import open_avatar_stream
from app.utils.security import verify_password

router = APIRouter(prefix="/api/users", tags=["Users"])


def _user_response(user: User) -> UserResponse:
    """Build the public view of a user, pointing avatar_url at the streaming
    endpoint when the avatar lives in GridFS rather than at an external URL."""
    avatar_url = user.avatar_url
    if user.avatar_file_id and not avatar_url:
        avatar_url = f"/api/users/{user.id}/avatar"

    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        mobile=user.mobile,
        is_active=user.is_active,
        is_verified=user.is_verified,
        is_admin=user.is_admin,
        created_at=user.created_at,
        avatar_url=avatar_url,
        auth_provider=user.auth_provider,
    )


async def _mobile_taken_by_other(mobile: str, current_user: User) -> bool:
    """True if another account already holds this number.

    Compared digits-only rather than by exact string, because POST
    /api/auth/login accepts a mobile as the identifier and takes the FIRST
    digit match it finds -- two accounts sharing a number make that login
    ambiguous. Soft-deleted accounts are included on purpose: they keep their
    mobile, and login matches them before rejecting them as disabled.
    """
    target = "".join(ch for ch in mobile if ch.isdigit())
    if not target:
        return False

    async for other in User.find(User.mobile != None):  # noqa: E711
        if str(other.id) == str(current_user.id):
            continue
        if "".join(ch for ch in (other.mobile or "") if ch.isdigit()) == target:
            return True
    return False


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current user information"""
    return _user_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    full_name: str = None,
    mobile: str = None,
    avatar_url: str = None,
    current_user: User = Depends(get_current_active_user),
):
    """Update current user information"""

    if full_name:
        current_user.full_name = full_name

    if mobile:
        normalized_mobile = "".join(ch for ch in mobile.strip() if ch.isdigit())
        if len(normalized_mobile) != 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile must be exactly 10 digits",
            )

        existing_mobile_owner = await User.find_one(User.mobile == normalized_mobile)
        if existing_mobile_owner and str(existing_mobile_owner.id) != str(
            current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile already registered",
            )

        current_user.mobile = normalized_mobile

    if avatar_url:
        current_user.avatar_url = avatar_url

    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    return _user_response(current_user)


@router.patch("/me", response_model=UserResponse)
async def patch_current_user(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Partially update the current user's own profile.

    JSON-bodied counterpart to PUT /me (which takes query params and is kept
    as-is for backwards compatibility). Exists so a client can collect a
    mobile number after the fact -- a Google ID token never carries one, so
    Google accounts are created with mobile unset.
    """

    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None

    if payload.mobile is not None:
        if await _mobile_taken_by_other(payload.mobile, current_user):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This mobile number is already linked to another account",
            )
        current_user.mobile = payload.mobile

    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    return _user_response(current_user)


@router.delete("/me")
async def delete_current_user(
    request: DeleteAccountRequest, current_user: User = Depends(get_current_active_user)
):
    """Soft delete current user account, reauthenticating by whatever
    credential the account actually has (password, or a fresh Google
    sign-in for passwordless accounts)."""

    if current_user.hashed_password:
        try:
            is_valid = verify_password(
                request.password or "", current_user.hashed_password
            )
        except Exception:
            # If verification fails (e.g. invalid hash format), treat as auth failure
            is_valid = False

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
            )
    else:
        # Google-only account: a bearer token alone must not be enough to
        # delete it, or a stolen/unattended session could lock the user out
        # with no password to fall back on. Require a fresh Google ID token
        # for the same Google account instead.
        if not request.google_id_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Re-authenticate with Google to delete this account",
            )
        try:
            token_payload = verify_google_id_token(request.google_id_token)
        except GoogleTokenError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

        if token_payload.get("sub") != current_user.google_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google account does not match this user",
            )

    # Soft delete by deactivating and recording timestamp
    current_user.is_active = False
    current_user.deleted_at = datetime.utcnow()
    current_user.deletion_reason = request.reason
    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    # Revoke all refresh tokens for this user
    await RefreshToken.find(
        RefreshToken.user_id == current_user.id, RefreshToken.revoked == False
    ).update({"$set": {"revoked": True}})

    return {"message": "Account successfully deleted"}


@router.get("/{user_id}/avatar")
async def get_user_avatar(user_id: str):
    """Stream the user's avatar from GridFS"""
    user = await User.get(user_id)
    if not user or not user.avatar_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found"
        )

    stream, content_type = await open_avatar_stream(user.avatar_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
