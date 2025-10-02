# Authentication System - Technical Specification (MongoDB)

**Project:** Walle Fantasy  
**Version:** 1.0 - MongoDB Edition  
**Date:** October 2, 2025  
**Status:** Implementation Ready  
**Database:** MongoDB

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [MongoDB Database Design](#mongodb-database-design)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Security Considerations](#security-considerations)
8. [API Endpoints](#api-endpoints)
9. [Implementation Timeline](#implementation-timeline)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Checklist](#deployment-checklist)

---

## 1. Overview

### 1.1 Purpose

Implement a secure, JWT-based authentication system for the Walle Fantasy application using MongoDB as the database, enabling user registration, login, session management, and protected route access.

### 1.2 Goals

- Secure user authentication with JWT tokens
- Password encryption using industry-standard algorithms
- MongoDB document-based data storage with Beanie ODM
- Protected API endpoints
- Frontend route protection
- Session persistence with token refresh
- User profile management

### 1.3 Scope

- User registration with email verification
- User login with credentials
- JWT token generation and validation
- Password hashing with bcrypt
- Protected backend endpoints
- Protected frontend routes
- Token refresh mechanism
- Logout functionality

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Auth Context │  │ Auth Pages   │  │ Protected Routes│   │
│  │  Provider    │  │ (Login/Reg)  │  │   (Dashboard)   │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
│         │                  │                    │            │
│         └──────────────────┴────────────────────┘            │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │  API Client    │                        │
│                    │  (Axios/Fetch) │                        │
│                    └───────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │ HTTPS
                             │ Authorization: Bearer <token>
┌────────────────────────────▼──────────────────────────────────┐
│                      Backend (FastAPI)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Auth Routes  │  │ JWT Middleware│  │ Password Utils  │    │
│  │ (Login/Reg)  │  │   Validator   │  │    (Bcrypt)     │    │
│  └──────────────┘  └──────────────┘  └─────────────────┘    │
│         │                  │                    │             │
│         └──────────────────┴────────────────────┘             │
│                            │                                  │
│                    ┌───────▼────────┐                         │
│                    │  Beanie ODM    │                         │
│                    │  (Motor Client)│                         │
│                    └───────┬────────┘                         │
└────────────────────────────┼───────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │    MongoDB      │
                    │  (Local/Atlas)  │
                    └─────────────────┘
```

### 2.2 Authentication Flow

#### Registration Flow

```
User → Frontend → POST /api/auth/register → Backend
                                            ├─ Validate input
                                            ├─ Check if user exists (MongoDB query)
                                            ├─ Hash password
                                            ├─ Insert user document
                                            ├─ Generate JWT token
                                            └─ Return token + user info
```

#### Login Flow

```
User → Frontend → POST /api/auth/login → Backend
                                         ├─ Validate credentials
                                         ├─ Find user in MongoDB
                                         ├─ Verify password hash
                                         ├─ Generate JWT token
                                         └─ Return token + user info
```

#### Protected Request Flow

```
User → Frontend → GET /api/protected → Backend
       (with JWT)                      ├─ Validate JWT
                                       ├─ Extract user info
                                       ├─ Query MongoDB for user
                                       ├─ Check permissions
                                       └─ Return protected data
```

---

## 3. Technology Stack

### 3.1 Backend Dependencies

```python
# Core
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6

# Database - MongoDB
motor==3.3.2                      # Async MongoDB driver for FastAPI
pymongo==4.6.0                    # MongoDB Python driver
beanie==1.23.6                    # ODM (Object Document Mapper) for MongoDB

# Authentication
python-jose[cryptography]==3.3.0  # JWT handling
passlib[bcrypt]==1.7.4            # Password hashing
python-dotenv==1.0.0              # Environment variables

# Validation
pydantic==2.5.0
pydantic-settings==2.1.0
email-validator==2.1.0

# Utilities
python-dateutil==2.8.2
```

### 3.2 Frontend Dependencies

```json
{
  "dependencies": {
    "next": "14.0.0",
    "react": "18.2.0",
    "axios": "^1.6.0",
    "jwt-decode": "^4.0.0",
    "react-hook-form": "^7.48.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0"
  }
}
```

### 3.3 Environment Variables

#### Backend (.env)

```bash
# Environment
NODE_ENV=development
DEBUG=true

# Security
SECRET_KEY=your-super-secret-key-min-32-chars-long
JWT_SECRET_KEY=your-jwt-secret-key-min-32-chars-long
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS=7

# MongoDB Database
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=walle_fantasy
# For MongoDB Atlas (Cloud):
# MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority

# CORS
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
```

#### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=Walle Fantasy
```

---

## 4. MongoDB Database Design

### 4.1 Collections Overview

MongoDB uses collections (similar to tables) to store documents (similar to rows). Our authentication system will use:

| Collection       | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `users`          | Store user accounts and authentication data          |
| `user_profiles`  | Store additional user profile information (optional) |
| `refresh_tokens` | Store refresh tokens for session management          |

### 4.2 User Document Schema

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439011')",
  "username": "johndoe",
  "email": "john@example.com",
  "hashed_password": "$2b$12$KIXw3zqFPxFCMvJhFN6WZe...",
  "full_name": "John Doe",
  "is_active": true,
  "is_verified": false,
  "created_at": "2025-10-02T10:30:00Z",
  "updated_at": "2025-10-02T10:30:00Z",
  "last_login": "2025-10-02T11:45:00Z",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

**Indexes:**

```javascript
// In MongoDB shell or Compass
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ created_at: -1 });
```

### 4.3 User Profile Document Schema (Optional)

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439022')",
  "user_id": "ObjectId('507f1f77bcf86cd799439011')",
  "bio": "Cricket enthusiast and fantasy sports player",
  "location": "Mumbai, India",
  "website": "https://johndoe.com",
  "social_links": {
    "twitter": "@johndoe",
    "github": "johndoe",
    "linkedin": "johndoe"
  },
  "preferences": {
    "theme": "dark",
    "notifications": true,
    "language": "en"
  }
}
```

**Indexes:**

```javascript
db.user_profiles.createIndex({ user_id: 1 }, { unique: true });
```

### 4.4 Refresh Token Document Schema

```json
{
  "_id": "ObjectId('507f1f77bcf86cd799439033')",
  "user_id": "ObjectId('507f1f77bcf86cd799439011')",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-10-09T10:30:00Z",
  "created_at": "2025-10-02T10:30:00Z",
  "revoked": false
}
```

**Indexes:**

```javascript
db.refresh_tokens.createIndex({ token: 1 }, { unique: true });
db.refresh_tokens.createIndex({ user_id: 1 });
// TTL index to automatically delete expired tokens
db.refresh_tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
```

### 4.5 Beanie Document Models

**File: `apps/backend/app/models/__init__.py`**

```python
from .user import User, RefreshToken

__all__ = ["User", "RefreshToken"]
```

**File: `apps/backend/app/models/user.py`**

```python
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from datetime import datetime
from typing import Optional
from bson import ObjectId

class User(Document):
    """User document model for MongoDB using Beanie ODM"""

    username: Indexed(str, unique=True)  # type: ignore
    email: Indexed(EmailStr, unique=True)  # type: ignore
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    avatar_url: Optional[str] = None

    class Settings:
        name = "users"  # MongoDB collection name
        use_state_management = True
        indexes = [
            "username",
            "email",
            [("created_at", -1)],
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "username": "johndoe",
                "email": "john@example.com",
                "hashed_password": "$2b$12$...",
                "full_name": "John Doe",
                "is_active": True,
                "is_verified": False
            }
        }

    def __repr__(self):
        return f"<User {self.username}>"

    def __str__(self):
        return self.username


class RefreshToken(Document):
    """Refresh token document model for MongoDB"""

    user_id: ObjectId
    token: Indexed(str, unique=True)  # type: ignore
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked: bool = False

    class Settings:
        name = "refresh_tokens"
        indexes = [
            "token",
            "user_id",
            [("expires_at", 1)],  # TTL index for auto-deletion
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "expires_at": "2025-10-09T10:30:00Z",
                "revoked": False
            }
        }


class UserProfile(Document):
    """Optional: User profile document for additional user data"""

    user_id: Indexed(ObjectId, unique=True)  # type: ignore
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[dict] = None
    preferences: Optional[dict] = None

    class Settings:
        name = "user_profiles"
        indexes = ["user_id"]
```

---

## 5. Backend Implementation

### 5.1 File Structure

```
apps/backend/
├── main.py
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── user.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── auth.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   └── user_service.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── security.py
│   │   └── dependencies.py
│   └── routes/
│       ├── __init__.py
│       ├── auth.py
│       └── users.py
└── config/
    ├── __init__.py
    ├── settings.py
    └── database.py
```

### 5.2 Core Components

#### Settings Configuration (`config/settings.py`)

```python
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    """Application settings with environment variable validation."""

    # Environment
    node_env: str = Field(default="development", alias="NODE_ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    # Security
    secret_key: str = Field(..., min_length=32, alias="SECRET_KEY")
    jwt_secret_key: str = Field(..., min_length=32, alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=1440, alias="JWT_EXPIRE_MINUTES")

    # MongoDB Database
    mongodb_url: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URL")
    mongodb_db_name: str = Field(default="walle_fantasy", alias="MONGODB_DB_NAME")

    # API Configuration
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")

    # CORS
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="CORS_ORIGINS"
    )

    # Optional external services
    redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
    cricket_api_key: Optional[str] = Field(default=None, alias="CRICKET_API_KEY")

    @property
    def cors_origins_list(self) -> list[str]:
        """Convert CORS origins string to list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.node_env.lower() == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.node_env.lower() == "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )


def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
```

#### Database Configuration (`config/database.py`)

```python
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from config.settings import get_settings
from app.models.user import User, RefreshToken, UserProfile

settings = get_settings()

# MongoDB client
client: AsyncIOMotorClient = None

async def connect_to_mongo():
    """Connect to MongoDB and initialize Beanie ODM"""
    global client

    try:
        # Create MongoDB client
        client = AsyncIOMotorClient(settings.mongodb_url)

        # Test connection
        await client.admin.command('ping')
        print(f"✓ Connected to MongoDB at {settings.mongodb_url}")

        # Initialize Beanie with document models
        await init_beanie(
            database=client[settings.mongodb_db_name],
            document_models=[User, RefreshToken, UserProfile]
        )
        print(f"✓ Initialized Beanie ODM with database: {settings.mongodb_db_name}")

    except Exception as e:
        print(f"✗ Failed to connect to MongoDB: {e}")
        raise

async def close_mongo_connection():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        print("✓ Closed MongoDB connection")

def get_database():
    """Get MongoDB database instance"""
    if client is None:
        raise Exception("Database not initialized. Call connect_to_mongo() first.")
    return client[settings.mongodb_db_name]
```

#### Security Utilities (`app/utils/security.py`)

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from config.settings import get_settings

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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)

    to_encode.update({
        "exp": expire,
        "type": "access",
        "iat": datetime.utcnow()
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt

def create_refresh_token(data: dict, expires_days: int = 7) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=expires_days)

    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "iat": datetime.utcnow()
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt

def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        print(f"JWT Error: {e}")
        return None
```

#### Authentication Schemas (`app/schemas/auth.py`)

```python
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    """Schema for user registration"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None

    @validator('username')
    def username_alphanumeric(cls, v):
        if not v.isalnum():
            raise ValueError('Username must be alphanumeric')
        return v.lower()

    @validator('password')
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(char.isdigit() for char in v):
            raise ValueError('Password must contain at least one digit')
        if not any(char.isupper() for char in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(char.islower() for char in v):
            raise ValueError('Password must contain at least one lowercase letter')
        return v

class UserLogin(BaseModel):
    """Schema for user login"""
    username: str
    password: str

class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """Schema for decoded token data"""
    username: Optional[str] = None
    exp: Optional[datetime] = None

class UserResponse(BaseModel):
    """Schema for user response (excludes password)"""
    id: str
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime
    avatar_url: Optional[str]

    class Config:
        from_attributes = True
```

#### Authentication Dependencies (`app/utils/dependencies.py`)

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from typing import Optional
from bson import ObjectId

from app.models.user import User
from app.utils.security import decode_token

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

    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception

    # Check token type
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )

    # Find user in MongoDB
    user = await User.find_one(User.username == username)
    if user is None:
        raise credentials_exception

    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Ensure user is active"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user

async def get_current_verified_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Ensure user is verified"""
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified"
        )
    return current_user
```

#### Authentication Routes (`app/routes/auth.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timedelta

from app.models.user import User, RefreshToken
from app.schemas.auth import UserRegister, UserLogin, Token, UserResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from config.settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
settings = get_settings()

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister):
    """Register a new user"""

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
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    # Save to MongoDB
    await new_user.insert()

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
```

#### User Routes (`app/routes/users.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime

from app.models.user import User
from app.schemas.auth import UserResponse
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
```

#### Main Application (`main.py`)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config.settings import get_settings
from config.database import connect_to_mongo, close_mongo_connection
from app.routes import auth, users

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup: Connect to MongoDB
    await connect_to_mongo()
    yield
    # Shutdown: Close MongoDB connection
    await close_mongo_connection()

# Create FastAPI application
app = FastAPI(
    title="Walle Fantasy API",
    description="Fantasy Cricket Platform API with MongoDB",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(users.router)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Walle Fantasy API is running!",
        "database": "MongoDB",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "MongoDB connected"
    }

# For running with uvicorn directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.is_development
    )
```

---

## 6. Frontend Implementation

The frontend implementation remains the same as in the original spec. You can refer to the previous sections for:

- Type Definitions (`types/auth.ts`)
- API Client (`lib/api/client.ts`)
- Auth API (`lib/api/auth.ts`)
- Auth Context (`contexts/AuthContext.tsx`)
- Login Form (`components/auth/LoginForm.tsx`)
- Register Form (`components/auth/RegisterForm.tsx`)
- Protected Route Component (`components/auth/ProtectedRoute.tsx`)

The API endpoints and data structures remain compatible since we're using the same REST API interface.

---

## 7. Security Considerations

### 7.1 MongoDB-Specific Security

#### Database Security

- **Authentication:** Enable MongoDB authentication

  ```bash
  # Start MongoDB with auth
  mongod --auth --dbpath /data/db
  ```

- **Create Admin User:**

  ```javascript
  use admin
  db.createUser({
    user: "admin",
    pwd: "strongpassword",
    roles: ["userAdminAnyDatabase", "dbAdminAnyDatabase", "readWriteAnyDatabase"]
  })
  ```

- **Create App User:**

  ```javascript
  use walle_fantasy
  db.createUser({
    user: "walle_app",
    pwd: "apppassword",
    roles: [{ role: "readWrite", db: "walle_fantasy" }]
  })
  ```

- **Connection String with Auth:**
  ```bash
  MONGODB_URL=mongodb://walle_app:apppassword@localhost:27017/walle_fantasy?authSource=walle_fantasy
  ```

#### Network Security

- **Bind IP:** Restrict MongoDB to localhost or specific IPs

  ```yaml
  # mongod.conf
  net:
    bindIp: 127.0.0.1
  ```

- **Use TLS/SSL:** Enable encryption in transit
  ```bash
  mongod --tlsMode requireTLS --tlsCertificateKeyFile /path/to/cert.pem
  ```

#### MongoDB Atlas Security (Cloud)

- Use IP whitelist
- Enable VPC peering
- Use strong passwords
- Enable 2FA for Atlas account
- Regular backup automation

### 7.2 Application Security

All the security measures from the original spec apply:

- Password hashing with bcrypt
- JWT token security
- Rate limiting
- CORS configuration
- Input validation
- HTTPS in production

### 7.3 MongoDB Best Practices

#### Indexing

```python
# Create indexes on application startup
await User.find_one()  # Triggers index creation with Beanie
```

#### Query Optimization

```python
# Use projections to limit returned fields
user = await User.find_one(
    User.username == "johndoe",
    projection_model=UserResponse
)

# Use limit() for large result sets
users = await User.find().limit(100).to_list()
```

#### Data Validation

```python
# Beanie uses Pydantic for validation
class User(Document):
    email: EmailStr  # Validates email format
    username: str = Field(..., min_length=3, max_length=50)
```

---

## 8. API Endpoints

Same as original spec - all endpoints remain unchanged:

- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/refresh`
- POST `/api/auth/logout`
- GET `/api/users/me`
- PUT `/api/users/me`
- DELETE `/api/users/me`

---

## 9. Implementation Timeline

### Phase 1: MongoDB Setup & Backend Foundation (Week 1)

**Tasks:**

- [ ] Install MongoDB locally or set up MongoDB Atlas
- [ ] Create MongoDB database and collections
- [ ] Set up indexes
- [ ] Install Python dependencies (motor, beanie, etc.)
- [ ] Create Beanie document models
- [ ] Implement database connection
- [ ] Write security utilities (password hashing, JWT)
- [ ] Configure environment variables
- [ ] Write unit tests for models and security

**Deliverables:**

- MongoDB running and accessible
- Database models created
- Security utilities tested

---

### Phase 2: Authentication API (Week 1-2)

**Tasks:**

- [ ] Implement registration endpoint with MongoDB
- [ ] Implement login endpoint with MongoDB
- [ ] Implement token refresh endpoint
- [ ] Create authentication dependencies
- [ ] Add user endpoints (GET, PUT /users/me)
- [ ] Implement logout functionality
- [ ] Write integration tests for auth flow
- [ ] Test MongoDB queries and performance
- [ ] Update existing endpoints to require authentication

**Deliverables:**

- Complete auth API with MongoDB
- Protected endpoints
- API documentation

---

### Phase 3: Frontend Infrastructure (Week 2)

Same as original spec - no changes needed

---

### Phase 4: UI Components (Week 2-3)

Same as original spec - no changes needed

---

### Phase 5: Integration & Testing (Week 3)

**Tasks:**

- [ ] End-to-end testing with MongoDB
- [ ] Security audit
- [ ] Performance testing (MongoDB queries)
- [ ] Load testing
- [ ] Bug fixes
- [ ] Documentation updates
- [ ] MongoDB backup strategy

**Deliverables:**

- Fully tested system
- Performance benchmarks
- Security audit report
- Updated documentation

---

### Phase 6: Enhanced Security (Week 4)

Same as original spec plus:

- [ ] MongoDB audit logging
- [ ] Database monitoring
- [ ] Backup automation

---

## 10. Testing Strategy

### 10.1 Backend Testing with MongoDB

#### Unit Tests

```python
# tests/test_models.py
import pytest
from app.models.user import User
from datetime import datetime

@pytest.mark.asyncio
async def test_user_creation():
    """Test user document creation"""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="hashed_password_here"
    )
    await user.insert()

    # Verify user was created
    found_user = await User.find_one(User.username == "testuser")
    assert found_user is not None
    assert found_user.email == "test@example.com"

    # Cleanup
    await found_user.delete()

# tests/test_auth.py
@pytest.mark.asyncio
async def test_register_user(client):
    """Test user registration with MongoDB"""
    response = await client.post("/api/auth/register", json={
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "TestPass123"
    })

    assert response.status_code == 201
    assert "access_token" in response.json()

    # Verify user in database
    user = await User.find_one(User.username == "newuser")
    assert user is not None

    # Cleanup
    await user.delete()
```

#### Integration Tests

```python
@pytest.mark.asyncio
async def test_login_flow(client):
    """Test complete login flow with MongoDB"""
    # Create test user
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("TestPass123")
    )
    await user.insert()

    # Test login
    response = await client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "TestPass123"
    })

    assert response.status_code == 200
    assert "access_token" in response.json()

    # Cleanup
    await user.delete()
```

### 10.2 MongoDB-Specific Tests

```python
@pytest.mark.asyncio
async def test_unique_username_constraint():
    """Test MongoDB unique index on username"""
    user1 = User(username="duplicate", email="user1@example.com", hashed_password="hash")
    await user1.insert()

    user2 = User(username="duplicate", email="user2@example.com", hashed_password="hash")

    with pytest.raises(Exception):  # DuplicateKeyError
        await user2.insert()

    await user1.delete()

@pytest.mark.asyncio
async def test_ttl_index_on_refresh_tokens():
    """Test that expired refresh tokens are auto-deleted"""
    from datetime import timedelta

    token = RefreshToken(
        user_id=ObjectId(),
        token="test_token",
        expires_at=datetime.utcnow() - timedelta(days=1)  # Expired
    )
    await token.insert()

    # Wait for TTL index to delete (can take up to 60 seconds in MongoDB)
    # In production, expired tokens will be cleaned up automatically
```

---

## 11. Deployment Checklist

### 11.1 MongoDB Deployment

#### Local/Self-Hosted MongoDB

- [ ] Install MongoDB 6.0+
- [ ] Enable authentication
- [ ] Create database and users
- [ ] Set up backup strategy (mongodump)
- [ ] Configure monitoring
- [ ] Set up log rotation
- [ ] Secure firewall rules

#### MongoDB Atlas (Recommended for Production)

- [ ] Create MongoDB Atlas account
- [ ] Create cluster (M10+ for production)
- [ ] Configure IP whitelist
- [ ] Create database user
- [ ] Enable backup (automatic with Atlas)
- [ ] Set up monitoring and alerts
- [ ] Configure VPC peering (if needed)
- [ ] Copy connection string
- [ ] Update MONGODB_URL environment variable

### 11.2 Backend Deployment

- [ ] Generate strong SECRET_KEY (min 32 chars)
- [ ] Generate strong JWT_SECRET_KEY (min 32 chars)
- [ ] Update MONGODB_URL with production credentials
- [ ] Set NODE_ENV=production
- [ ] Configure CORS for production domains
- [ ] Set JWT_EXPIRE_MINUTES appropriately
- [ ] Enable production logging
- [ ] Set up monitoring (Sentry, etc.)
- [ ] Configure rate limiting (Redis recommended)
- [ ] Set up health check monitoring
- [ ] Configure auto-scaling (if using cloud)

### 11.3 MongoDB Connection Strings

#### Development

```bash
MONGODB_URL=mongodb://localhost:27017
```

#### Production (Self-Hosted)

```bash
MONGODB_URL=mongodb://username:password@mongodb-server:27017/walle_fantasy?authSource=admin
```

#### Production (MongoDB Atlas)

```bash
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/walle_fantasy?retryWrites=true&w=majority
```

### 11.4 Backup Strategy

#### Manual Backup

```bash
# Backup entire database
mongodump --uri="mongodb://username:password@localhost:27017/walle_fantasy" --out=/backups/$(date +%Y%m%d)

# Restore from backup
mongorestore --uri="mongodb://username:password@localhost:27017/walle_fantasy" /backups/20251002/walle_fantasy
```

#### Automated Backup (cron job)

```bash
# Add to crontab for daily backups at 2 AM
0 2 * * * /usr/bin/mongodump --uri="mongodb://..." --out=/backups/$(date +\%Y\%m\%d) 2>&1 | logger -t mongodump
```

#### MongoDB Atlas Backups

- Automatic continuous backups
- Point-in-time recovery
- Scheduled snapshots
- Cross-region backups

---

## 12. Useful Commands

### MongoDB Commands

```bash
# Start MongoDB
mongod --dbpath /data/db

# Start MongoDB with auth
mongod --auth --dbpath /data/db

# Connect to MongoDB shell
mongosh

# Connect with credentials
mongosh "mongodb://username:password@localhost:27017/walle_fantasy"

# Connect to MongoDB Atlas
mongosh "mongodb+srv://cluster.mongodb.net/walle_fantasy" --username your_user
```

### MongoDB Shell Commands

```javascript
// Show databases
show dbs

// Use database
use walle_fantasy

// Show collections
show collections

// Find all users
db.users.find()

// Find specific user
db.users.findOne({ username: "johndoe" })

// Count documents
db.users.countDocuments()

// Create index
db.users.createIndex({ username: 1 }, { unique: true })

// Show indexes
db.users.getIndexes()

// Drop collection
db.users.drop()

// Database stats
db.stats()
```

### Backend Commands

```bash
# Install dependencies
cd apps/backend
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run with environment file
uvicorn main:app --reload --env-file .env

# Run tests
pytest tests/ -v

# Run tests with coverage
pytest tests/ --cov=app --cov-report=html

# Generate SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Frontend Commands

```bash
# Install dependencies
cd apps/frontend
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

---

## 13. Troubleshooting

### Common MongoDB Issues

#### Connection Errors

```bash
# Error: MongoServerError: Authentication failed
# Solution: Check username, password, and authSource in connection string
MONGODB_URL=mongodb://user:pass@localhost:27017/dbname?authSource=admin
```

#### Index Creation Errors

```python
# Error: DuplicateKeyError
# Solution: Clear existing data before creating unique indexes
await User.find().delete()
await User.get_motor_collection().drop_indexes()
```

#### Performance Issues

```python
# Use explain() to analyze queries
result = await User.find(User.username == "test").explain()
print(result)

# Create indexes for frequently queried fields
await User.get_motor_collection().create_index("username")
```

---

## 14. Future Enhancements

### MongoDB-Specific Features

- **Full-Text Search:** Implement text search on user profiles

  ```javascript
  db.users.createIndex({ full_name: "text", bio: "text" });
  ```

- **Aggregation Pipelines:** Complex analytics and reporting

  ```python
  pipeline = [
      {"$match": {"is_active": True}},
      {"$group": {"_id": "$created_at", "count": {"$sum": 1}}}
  ]
  result = await User.aggregate(pipeline).to_list()
  ```

- **Change Streams:** Real-time notifications

  ```python
  async for change in User.watch():
      print(f"Change detected: {change}")
  ```

- **Geospatial Queries:** Location-based features
  ```python
  class User(Document):
      location: dict = Field(default={"type": "Point", "coordinates": [0, 0]})
  ```

---

## Appendix

### A. MongoDB Resources

- Official Documentation: https://docs.mongodb.com/
- Motor (Async Driver): https://motor.readthedocs.io/
- Beanie ODM: https://beanie-odm.dev/
- MongoDB Atlas: https://www.mongodb.com/cloud/atlas
- MongoDB University: https://university.mongodb.com/

### B. Sample .env File

```bash
# Environment
NODE_ENV=development
DEBUG=true

# Security
SECRET_KEY=generate-a-long-random-string-min-32-chars
JWT_SECRET_KEY=generate-another-long-random-string-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# MongoDB
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=walle_fantasy

# CORS
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# API
API_HOST=0.0.0.0
API_PORT=8000
```

### C. requirements.txt

```
# Core
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6

# Database - MongoDB
motor==3.3.2
pymongo==4.6.0
beanie==1.23.6

# Authentication
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.0

# Validation
pydantic==2.5.0
pydantic-settings==2.1.0
email-validator==2.1.0

# Utilities
python-dateutil==2.8.2

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
httpx==0.25.2
```

---

**End of Technical Specification - MongoDB Edition**

This specification is tailored for MongoDB and ready for implementation. Start with Phase 1 to set up MongoDB and proceed through the phases sequentially.

For questions or support, refer to the MongoDB documentation and FastAPI documentation linked in the appendix.
