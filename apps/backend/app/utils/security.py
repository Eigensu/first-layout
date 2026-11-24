import logging
from datetime import timedelta
from secrets import token_hex
from typing import Optional

import jwt
from jwt import PyJWTError
from passlib.context import CryptContext

from app.common.datetime_utils import utc_now
from config.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()

    if expires_delta:
        expire = utc_now() + expires_delta
    else:
        expire = utc_now() + timedelta(minutes=settings.jwt_expire_minutes)

    to_encode.update(
        {
            "exp": expire,
            "type": "access",
            "iat": utc_now(),
            "jti": token_hex(16),
        }
    )

    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def create_refresh_token(data: dict, expires_days: int = 7) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = utc_now() + timedelta(days=expires_days)

    # jti makes every token distinct. Without it, two sign-ins by one account
    # in the same second minted byte-identical tokens -- Dcpl held 35 such
    # pairs -- and revoking one stored copy left the other working.
    to_encode.update(
        {
            "exp": expire,
            "type": "refresh",
            "iat": utc_now(),
            "jti": token_hex(16),
        }
    )

    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except PyJWTError as e:
        # Routine (an expired session), so INFO: a log line, not an error.
        logger.info("JWT rejected: %s", e)
        return None
