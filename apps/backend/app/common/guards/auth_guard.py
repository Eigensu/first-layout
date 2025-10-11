"""
Authentication Guard Middleware for FastAPI

Similar to NestJS AuthGuard, this middleware intercepts all requests
and validates JWT tokens before allowing access to protected routes.
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Optional, List
import re

from app.utils.security import decode_token
from app.models.user import User


class AuthGuardMiddleware(BaseHTTPMiddleware):
    """
    Authentication Guard Middleware
    Automatically validates JWT tokens for all routes except public ones.
    """

    def __init__(
        self,
        app,
        public_routes: Optional[List[str]] = None,
        public_patterns: Optional[List[str]] = None,
    ):
        """
        Initialize the auth guard middleware
        
        Args:
            app: FastAPI application
            public_routes: List of exact route paths that don't require auth
            public_patterns: List of regex patterns for public routes
        """
        super().__init__(app)
        
        # Default public routes
        self.public_routes = public_routes or [
            "/",
            "/api/health",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/docs",
            "/redoc",
            "/openapi.json",
        ]
        
        # Compile public patterns
        self.public_patterns = [
            re.compile(pattern) for pattern in (public_patterns or [
                r"^/docs.*",
                r"^/redoc.*",
                r"^/openapi\.json$",
                r"^/api/auth/.*",
            ])
        ]

    def is_public_route(self, path: str) -> bool:
        """Check if a route is public"""
        # Check exact matches
        if path in self.public_routes:
            return True
        
        # Check pattern matches
        for pattern in self.public_patterns:
            if pattern.match(path):
                return True
        
        return False

    async def dispatch(self, request: Request, call_next):
        """
        Process the request and validate authentication
        
        Similar to NestJS's getRequest() method that extracts
        the request from different contexts (HTTP, GraphQL, etc.)
        """
        path = request.url.path
        
        # Skip auth for public routes
        if self.is_public_route(path):
            return await call_next(request)
        
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        
        if not auth_header:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Missing authentication credentials",
                    "error": "UNAUTHORIZED"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Validate Bearer token format
        try:
            scheme, token = auth_header.split()
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Invalid authentication credentials format",
                    "error": "INVALID_TOKEN_FORMAT"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Decode and validate token
        payload = decode_token(token)
        
        if payload is None:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Could not validate credentials",
                    "error": "INVALID_TOKEN"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Validate token type
        token_type = payload.get("type")
        if token_type != "access":
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Invalid token type",
                    "error": "WRONG_TOKEN_TYPE"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get username from token
        username = payload.get("sub")
        if not username:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Token missing required claims",
                    "error": "INVALID_TOKEN_CLAIMS"
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Fetch user from database
        try:
            user = await User.find_one(User.username == username)
            if user is None:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "detail": "User not found",
                        "error": "USER_NOT_FOUND"
                    },
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Check if user is active
            if not user.is_active:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "User account is inactive",
                        "error": "INACTIVE_USER"
                    },
                )
            
            # Attach user to request state for access in route handlers
            request.state.user = user
            request.state.token_payload = payload
            
        except Exception as e:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": "Authentication service error",
                    "error": "AUTH_SERVICE_ERROR"
                },
            )
        
        # Proceed with the request
        response = await call_next(request)
        return response


class RoleGuard:
    """
    Role-based authorization guard
    
    Use this as a dependency in routes that require specific roles.
    """
    
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles
    
    async def __call__(self, request: Request):
        """Check if user has required role"""
        if not hasattr(request.state, "user"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        user: User = request.state.user
        
        # Check if user has admin role or any of the allowed roles
        user_roles = getattr(user, "roles", [])
        
        if not any(role in self.allowed_roles for role in user_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {', '.join(self.allowed_roles)}"
            )
        
        return user


class VerifiedUserGuard:
    """
    Guard that ensures user has verified their email
    """
    
    async def __call__(self, request: Request):
        """Check if user is verified"""
        if not hasattr(request.state, "user"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        user: User = request.state.user
        
        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email verification required"
            )
        
        return user


# Helper function to get current user from request
def get_current_user_from_request(request: Request) -> User:
    """
    Extract the current authenticated user from request state
    
    Use this in route handlers to access the authenticated user:
    
    @app.get("/api/profile")
    async def get_profile(request: Request):
        user = get_current_user_from_request(request)
        return {"username": user.username}
    """
    if not hasattr(request.state, "user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return request.state.user
