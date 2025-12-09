import os
import re
from typing import Optional
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field

# Get the root directory of the monorepo (two levels up from backend/config)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_FILE = ROOT_DIR / ".env"


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
    mongodb_db_name: str = Field(default="world-tower", alias="MONGODB_DB_NAME")
    
    # API Configuration
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    
    # CORS
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000", 
        alias="CORS_ORIGINS"
    )
    
    # Optional external services (for future use)
    redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
    cricket_api_key: Optional[str] = Field(default=None, alias="CRICKET_API_KEY")
    payment_gateway_key: Optional[str] = Field(default=None, alias="PAYMENT_GATEWAY_KEY")
    email_service_key: Optional[str] = Field(default=None, alias="EMAIL_SERVICE_KEY")
    
     # 2Factor / OTP configuration
    twofactor_api_key: Optional[str] = Field(default=None, alias="TWOFACTOR_API_KEY")
    twofactor_template_name: Optional[str] = Field(default=None, alias="TWOFACTOR_TEMPLATE_NAME")
    twofactor_base_url: str = Field(default="https://2factor.in/API/V1", alias="TWOFACTOR_BASE_URL")
    otp_expiry_seconds: int = Field(default=600, alias="OTP_EXPIRY_SECONDS")
    otp_max_attempts: int = Field(default=5, alias="OTP_MAX_ATTEMPTS")
    reset_token_ttl_seconds: int = Field(default=600, alias="RESET_TOKEN_TTL_SECONDS")
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Convert CORS origins string to list and support wildcard patterns."""
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        return origins

    @property
    def cors_exact_origins(self) -> list[str]:
        """Return explicit origins (no wildcard characters)."""
        origins = self.cors_origins_list
        exact = [o for o in origins if "*" not in o and "?" not in o]
        return exact

    @property
    def cors_origin_regex(self) -> Optional[str]:
        """Return a combined regex string for wildcard origin patterns if any.

        Example: 'https://walle-layout-git-*.vercel.app' => '^https://walle-layout-git-.*\\.vercel\\.app$'
        Multiple wildcard patterns will be joined: '^(?:pattern1|pattern2)$'
        """
        origins = self.cors_origins_list
        wildcard = [o for o in origins if "*" in o or "?" in o]
        if not wildcard:
            return None

        patterns = []
        for p in wildcard:
            # Escape regex special chars, then convert wildcard placeholders to regex
            escaped = re.escape(p)
            converted = escaped.replace(r"\*", ".*").replace(r"\?", ".")
            patterns.append(converted)

        combined = "^(?:" + "|".join(patterns) + ")$"
        return combined
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.node_env.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.node_env.lower() == "development"
    
    @property
    def is_test(self) -> bool:
        """Check if running in test mode."""
        return self.node_env.lower() == "test"
    
    class Config:
        # Load from .env file in the monorepo root
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        case_sensitive = False
        # Ignore extra fields (like frontend-specific vars)
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
