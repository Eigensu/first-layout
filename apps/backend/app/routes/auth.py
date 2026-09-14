import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import EmailStr, ValidationError
from pymongo.errors import DuplicateKeyError

from app.models.user import RefreshToken, User
from app.schemas.auth import (
    ASCII_DIGITS,
    AppleAuth,
    ChangePassword,
    ForgotPasswordRequest,
    ForgotPasswordReset,
    ForgotPasswordVerify,
    GoogleAuth,
    ResetPasswordByMobile,
    Token,
    UserLogin,
    UserRegister,
)
from app.schemas.user import UserResponse
from app.services.auth.apple import (
    AppleTokenError,
    find_or_create_apple_user,
    verify_apple_identity_token,
)
from app.services.auth.google import (
    GoogleTokenError,
    find_or_create_google_user,
    verify_google_id_token,
)
from app.services.auth.identity import (
    AmbiguousIdentifier,
    promote_legacy_password,
    resolve_login_identity,
    verify_user_password,
)
from app.services.auth.password_reset import reset_password as pr_reset_password
from app.services.auth.password_reset import start_session as pr_start_session
from app.services.auth.password_reset import (
    verify_otp_and_issue_token as pr_verify_and_issue,
)
from app.utils.dependencies import get_current_active_user, resolve_token_subject
from app.utils.gridfs import upload_avatar_to_gridfs
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from config.settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
settings = get_settings()
logger = logging.getLogger("app.auth")


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    username: str = Form(...),
    email: EmailStr = Form(...),
    password: str = Form(...),
    full_name: Optional[str] = Form(None),
    mobile: str = Form(...),
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors()
        )

    # Check if username exists
    existing_user = await User.find_one(User.username == user_data.username.lower())
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    # Check if email exists
    existing_email = await User.find_one(User.email == user_data.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Check if mobile exists
    existing_mobile = await User.find_one(User.mobile == user_data.mobile)
    if existing_mobile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile already registered"
        )

    # Create new user document
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username.lower(),
        email=user_data.email,
        # Populated from the start so new accounts are already in the shape the
        # backfill is working towards, and are covered by the unique identity
        # indexes immediately rather than only once the migration reaches them.
        emails=[str(user_data.email).lower()],
        mobiles=[user_data.mobile] if user_data.mobile else [],
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        mobile=user_data.mobile,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Save to MongoDB
    try:
        await new_user.insert()
    except DuplicateKeyError:
        # The checks above are read-then-write, so a concurrent registration
        # can take the username, email or mobile in between. The unique
        # indexes reject the loser; surface that as the same 400 those checks
        # return rather than a 500.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username, email or mobile already registered",
        )

    # If avatar uploaded, save to GridFS and update user
    if avatar is not None:
        file_id = await upload_avatar_to_gridfs(
            avatar, filename_prefix=f"user_{new_user.id}"
        )
        new_user.avatar_file_id = file_id
        # Provide a stable API URL for the avatar
        new_user.avatar_url = f"/api/users/{new_user.id}/avatar"
        await new_user.save()

    # Generate tokens
    access_token = create_access_token(data={"sub": str(new_user.id)})
    refresh_token = create_refresh_token(data={"sub": str(new_user.id)})

    # Store refresh token in database
    refresh_token_doc = RefreshToken(
        user_id=new_user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login with username (or mobile) and password"""

    identifier = (user_data.username or "").strip()

    try:
        user = await resolve_login_identity(identifier)
    except AmbiguousIdentifier:
        # Structured on purpose: extractErrorMessage renders `message`, so the
        # user is told what to do instead of being shown a generic failure for
        # credentials that were actually correct.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ambiguous_identifier",
                "message": (
                    "That username belongs to more than one account. "
                    "Please sign in with your mobile number or email instead."
                ),
            },
        )

    password_ok, used_legacy = (
        verify_user_password(user, user_data.password) if user else (False, False)
    )
    if not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
        )

    if used_legacy:
        # They signed in with a password carried over from one of the accounts
        # this one was merged from. Promote it now so the merged account ends
        # up with exactly one valid password rather than several.
        await promote_legacy_password(user, user_data.password)

    # Update last login
    user.last_login = datetime.utcnow()
    await user.save()

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    # Store refresh token
    refresh_token_doc = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/google", response_model=Token)
async def google_auth(payload: GoogleAuth):
    """Sign up or log in using a Google Identity Services ID token."""
    try:
        token_payload = verify_google_id_token(payload.id_token)
    except GoogleTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    user = await find_or_create_google_user(token_payload)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
        )

    user.last_login = datetime.utcnow()
    await user.save()

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    refresh_token_doc = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/apple", response_model=Token)
async def apple_auth(payload: AppleAuth):
    """Sign up or log in using an Apple identity token from expo-apple-authentication."""
    try:
        token_payload = await verify_apple_identity_token(payload.identity_token)
    except AppleTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    user = await find_or_create_apple_user(token_payload, payload.full_name)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
        )

    user.last_login = datetime.utcnow()
    await user.save()

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    refresh_token_doc = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    await refresh_token_doc.insert()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    """Refresh access token using refresh token"""

    # Decode and validate refresh token
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    # Check if token exists in database and is not revoked
    token_doc = await RefreshToken.find_one(
        RefreshToken.token == refresh_token, RefreshToken.revoked == False
    )

    if not token_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found or has been revoked",
        )

    # Check if token is expired
    if token_doc.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired"
        )

    user = await resolve_token_subject(payload.get("sub") or "")

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    # Revoke old refresh token
    token_doc.revoked = True
    await token_doc.save()

    # Generate new tokens
    new_access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})

    # Store new refresh token
    new_token_doc = RefreshToken(
        user_id=user.id,
        token=new_refresh_token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    await new_token_doc.insert()

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
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


@router.post("/reset-password-mobile")
async def reset_password_by_mobile(payload: ResetPasswordByMobile):
    """Reset password by verifying the provided mobile number matches a stored user."""
    # Normalize input by digits to compare fairly
    input_digits = "".join(ch for ch in payload.mobile if ch in ASCII_DIGITS)

    matched_user = None
    # Since mobile may be stored with symbols/spaces, scan users with a mobile set
    async for u in User.find(User.mobile != None):
        digits = "".join(ch for ch in (u.mobile or "") if ch in ASCII_DIGITS)
        if digits and digits == input_digits:
            matched_user = u
            break

    if not matched_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with provided mobile not found",
        )

    matched_user.hashed_password = get_password_hash(payload.new_password)
    matched_user.updated_at = datetime.utcnow()
    await matched_user.save()

    return {"message": "Password updated successfully"}


@router.post("/forgot-password/request")
async def forgot_password_request(payload: ForgotPasswordRequest):
    """Start forgot password flow by sending OTP to the provided phone.
    Always return generic response to avoid user enumeration."""
    logger.info("POST /api/auth/forgot-password/request body={'phone':'[redacted]'}")
    try:
        await pr_start_session(payload.phone)
        logger.info(
            "Response 200 /api/auth/forgot-password/request body={'message':'If the phone exists, an OTP has been sent.'}"
        )
    except Exception as e:
        # Intentionally return generic message regardless of internal failures
        logger.exception(
            "Internal error during forgot-password request; responding with generic message"
        )
    return {"message": "If the phone exists, an OTP has been sent."}


@router.post("/forgot-password/verify")
async def forgot_password_verify(payload: ForgotPasswordVerify):
    """Verify OTP and issue short-lived reset token."""
    logger.info(
        "POST /api/auth/forgot-password/verify body={'phone':'[redacted]','otp':'[redacted]'}"
    )
    try:
        reset_token, ttl = await pr_verify_and_issue(payload.phone, payload.otp)
        logger.info(
            "Response 200 /api/auth/forgot-password/verify body={'reset_token':'[redacted]','expires_in_sec':%s}",
            ttl,
        )
        return {"reset_token": reset_token, "expires_in_sec": ttl}
    except Exception:
        logger.warning(
            "Response 400 /api/auth/forgot-password/verify body={'detail':'Invalid or expired OTP'}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP"
        )


@router.post("/forgot-password/reset")
async def forgot_password_reset(payload: ForgotPasswordReset):
    """Reset password using a valid reset token."""
    logger.info(
        "POST /api/auth/forgot-password/reset body={'reset_token':'[redacted]','new_password':'[redacted]'}"
    )
    try:
        await pr_reset_password(payload.reset_token, payload.new_password)
        logger.info(
            "Response 200 /api/auth/forgot-password/reset body={'message':'Password updated.'}"
        )
        return {"message": "Password updated."}
    except Exception:
        logger.warning(
            "Response 400 /api/auth/forgot-password/reset body={'detail':'Invalid or expired reset token'}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )


@router.post("/change-password")
async def change_password(
    payload: ChangePassword, current_user: User = Depends(get_current_active_user)
):
    """Change password for authenticated user with current password verification"""
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account signed up with Google and has no password yet. Use 'forgot password' to set one.",
        )

    # Verify current password
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Check that new password is different from current
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    # Update password
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.updated_at = datetime.utcnow()
    await current_user.save()

    return {"message": "Password changed successfully"}
