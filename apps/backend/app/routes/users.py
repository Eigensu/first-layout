from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime

from app.models.user import User
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at,
        avatar_url=current_user.avatar_url
    )


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    full_name: str = None,
    avatar_url: str = None,
    current_user: User = Depends(get_current_active_user)
):
    """Update current user information"""

    if full_name:
        current_user.full_name = full_name

    if avatar_url:
        current_user.avatar_url = avatar_url

    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
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
