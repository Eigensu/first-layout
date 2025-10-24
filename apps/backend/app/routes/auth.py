from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from datetime import datetime, timedelta

from app.models.user import User, RefreshToken
from app.schemas.auth import UserRegister, UserLogin, Token
from app.schemas.user import UserResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from config.settings import get_settings
from pydantic import EmailStr, ValidationError
from typing import Optional
from app.utils.gridfs import upload_avatar_to_gridfs

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    username: str = Form(...),
    email: EmailStr = Form(...),
    password: str = Form(...),
    full_name: Optional[str] = Form(None),
    mobile: Optional[str] = Form(None),
    avatar: Optional[UploadFile] = File(None),
):
    """Register a new user"""

    # Validate fields with existing schema
    try:
        user_data = UserRegister(
            username=username,
            email=email,
            password=password,
            full_name=full_name,
            mobile=mobile,
        )
    except ValidationError as e:
        # Match FastAPI validation error format
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors())

    # Check if username exists
    existing_user = await User.find_one(User.username == user_data.username.lower())
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email exists
    existing_email = await User.find_one(User.email == user_data.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user document
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username.lower(),
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        mobile=user_data.mobile,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    # Save to MongoDB
    await new_user.insert()

    # If avatar uploaded, save to GridFS and update user
    if avatar is not None:
        file_id = await upload_avatar_to_gridfs(avatar, filename_prefix=f"user_{new_user.id}")
        new_user.avatar_file_id = file_id
        # Provide a stable API URL for the avatar
        new_user.avatar_url = f"/api/users/{new_user.id}/avatar"
        await new_user.save()

    # Generate tokens
    access_token = create_access_token(data={"sub": new_user.username})
    refresh_token = create_refresh_token(data={"sub": new_user.username})

    # Store refresh token in database
    refresh_token_doc = RefreshToken(
        user_id=new_user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login with username and password"""

    # Find user by username
    user = await User.find_one(User.username == user_data.username.lower())

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    await user.save()

    # Generate tokens
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = create_refresh_token(data={"sub": user.username})

    # Store refresh token
    refresh_token_doc = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    """Refresh access token using refresh token"""

    # Decode and validate refresh token
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    # Check if token exists in database and is not revoked
    token_doc = await RefreshToken.find_one(
        RefreshToken.token == refresh_token,
        RefreshToken.revoked == False
    )

    if not token_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found or has been revoked"
        )

    # Check if token is expired
    if token_doc.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired"
        )

    # Get user
    username = payload.get("sub")
    user = await User.find_one(User.username == username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Revoke old refresh token
    token_doc.revoked = True
    await token_doc.save()

    # Generate new tokens
    new_access_token = create_access_token(data={"sub": user.username})
    new_refresh_token = create_refresh_token(data={"sub": user.username})

    # Store new refresh token
    new_token_doc = RefreshToken(
        user_id=user.id,
        token=new_refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    await new_token_doc.insert()

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/logout")
async def logout(refresh_token: str):
    """Logout and revoke refresh token"""

    # Find and revoke refresh token
    token_doc = await RefreshToken.find_one(RefreshToken.token == refresh_token)

    if token_doc:
        token_doc.revoked = True
        await token_doc.save()

    return {"message": "Successfully logged out"}
