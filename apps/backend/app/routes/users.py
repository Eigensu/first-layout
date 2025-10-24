from fastapi import APIRouter, Depends, HTTPException, status, Response
from datetime import datetime

from app.models.user import User
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.utils.gridfs import open_avatar_stream

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
        created_at=current_user.created_at,
        avatar_url=current_user.avatar_url
    )


@router.delete("/me")
async def delete_current_user(
    current_user: User = Depends(get_current_active_user)
):
    """Delete current user account"""

    # Soft delete by deactivating
    current_user.is_active = False
    await current_user.save()

    return {"message": "Account successfully deactivated"}


@router.get("/{user_id}/avatar")
async def get_user_avatar(user_id: str):
    """Stream the user's avatar from GridFS"""
    user = await User.get(user_id)
    if not user or not user.avatar_file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")

    stream, content_type = await open_avatar_stream(user.avatar_file_id)
    data = await stream.read()
    return Response(content=data, media_type=content_type)
