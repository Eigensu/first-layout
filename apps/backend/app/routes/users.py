from fastapi import APIRouter, Depends, HTTPException, status, Response
from datetime import datetime

from app.models.user import User, RefreshToken
from app.schemas.user import UserResponse, DeleteAccountRequest
from app.utils.dependencies import get_current_active_user
from app.utils.gridfs import open_avatar_stream
from app.utils.security import verify_password

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user information"""
    # Ensure avatar_url is populated to the streaming endpoint if stored in GridFS
    avatar_url = current_user.avatar_url
    if current_user.avatar_file_id and not avatar_url:
        avatar_url = f"/api/users/{current_user.id}/avatar"

    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        mobile=current_user.mobile,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        avatar_url=avatar_url
    )


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    full_name: str = None,
    mobile: str = None,
    avatar_url: str = None,
    current_user: User = Depends(get_current_active_user)
):
    """Update current user information"""

    if full_name:
        current_user.full_name = full_name

    if mobile:
        current_user.mobile = mobile

    if avatar_url:
        current_user.avatar_url = avatar_url

    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        mobile=current_user.mobile,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        avatar_url=current_user.avatar_url
    )


@router.delete("/me")
async def delete_current_user(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Soft delete current user account with password verification"""

    # Verify password
    try:
        is_valid = verify_password(request.password, current_user.hashed_password)
    except Exception:
        # If verification fails (e.g. invalid hash format), treat as auth failure
        is_valid = False

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )

    # Soft delete by deactivating and recording timestamp
    current_user.is_active = False
    current_user.deleted_at = datetime.utcnow()
    current_user.deletion_reason = request.reason
    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    # Revoke all refresh tokens for this user
    await RefreshToken.find(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == False
    ).update({"$set": {"revoked": True}})

    return {"message": "Account successfully deleted"}


@router.get("/{user_id}/avatar")
async def get_user_avatar(user_id: str):
    """Stream the user's avatar from GridFS"""
    user = await User.get(user_id)
    if not user or not user.avatar_file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")

    stream, content_type = await open_avatar_stream(user.avatar_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
