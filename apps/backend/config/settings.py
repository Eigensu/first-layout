import os
import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

from config.redaction import redact_mongodb_url

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

    # Google OAuth (Sign in with Google)
    google_client_id: Optional[str] = Field(default=None, alias="GOOGLE_CLIENT_ID")

    # Apple Sign In — the native mobile identity token's `aud` claim is the
    # app's iOS bundle identifier (not a web "Services ID"), so this must
    # equal the mobile app's ios.bundleIdentifier.
    apple_bundle_id: Optional[str] = Field(default=None, alias="APPLE_BUNDLE_ID")

    # MongoDB Database
    mongodb_url: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URL")
    mongodb_db_name: str = Field(default="world-tower", alias="MONGODB_DB_NAME")

    # Tenancy (app/utils/tenant.py). "single" is a legacy per-tournament
    # service: one database holds one tournament, whose documents carry no
    # tournament_id. "shared" is the one backend serving every tournament from
    # walle_arena, where each request names its tournament. The default keeps
    # the live services unchanged; the unified backend sets "shared".
    tenancy: Literal["single", "shared"] = Field(default="single", alias="TENANCY")

    # Rate limits on the auth routes (docs/RATE_LIMITING_SPEC.md). Enabled but
    # not enforcing by default: the limiter counts and logs what it would have
    # blocked, and RATE_LIMIT_ENFORCE=true turns that into 429s once the logs
    # show real users are clear of the limits. RATE_LIMIT_ENFORCE_RULES names
    # rules to enforce on their own first, comma-separated, e.g.
    # "forgot_password_request". Proxy hops is how many proxies in front of the
    # service append to X-Forwarded-For (spec §4.1).
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_enforce: bool = Field(default=False, alias="RATE_LIMIT_ENFORCE")
    rate_limit_enforce_rules: str = Field(default="", alias="RATE_LIMIT_ENFORCE_RULES")
    rate_limit_proxy_hops: int = Field(default=1, alias="RATE_LIMIT_PROXY_HOPS")

    # API Configuration
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")

    # CORS
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000", alias="CORS_ORIGINS"
    )

    # Optional external services (for future use)
    redis_url: Optional[str] = Field(default=None, alias="REDIS_URL")
    cricket_api_key: Optional[str] = Field(default=None, alias="CRICKET_API_KEY")
    payment_gateway_key: Optional[str] = Field(
        default=None, alias="PAYMENT_GATEWAY_KEY"
    )

    # Cloudinary
    cloudinary_cloud_name: Optional[str] = Field(
        default=None, alias="CLOUDINARY_CLOUD_NAME"
    )
    cloudinary_api_key: Optional[str] = Field(default=None, alias="CLOUDINARY_API_KEY")
    cloudinary_api_secret: Optional[str] = Field(
        default=None, alias="CLOUDINARY_API_SECRET"
    )
    cloudinary_secure: bool = Field(default=True, alias="CLOUDINARY_SECURE")
    cloudinary_default_folder: str = Field(
        default="walle", alias="CLOUDINARY_DEFAULT_FOLDER"
    )

    # CricHeroes third-party tournament API (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md).
    # The credentials are optional here and checked when a call is made, so a
    # deployment without them still boots and the admin routes answer 503
    # naming what is missing. The values printed in the CricHeroes API doc are
    # examples and will be rejected.
    cricheroes_base_url: str = Field(
        default="https://cricheroes.in/api/v1", alias="CRICHEROES_BASE_URL"
    )
    cricheroes_api_key: Optional[str] = Field(default=None, alias="CRICHEROES_API_KEY")
    cricheroes_secret_access_key: Optional[str] = Field(
        default=None, alias="CRICHEROES_SECRET_ACCESS_KEY"
    )
    cricheroes_udid: Optional[str] = Field(default=None, alias="CRICHEROES_UDID")
    # Deliberately below the 30s CricHeroes allows (spec §6.4).
    cricheroes_timeout_seconds: float = Field(
        default=15.0, gt=0, alias="CRICHEROES_TIMEOUT_SECONDS"
    )
    # Retries on HTTP 429 only (spec §6.5). Off by default: CricHeroes charge a
    # throttled request against the quota just like a successful one, so every
    # retry is a paid call nobody asked for.
    cricheroes_max_retries: int = Field(default=0, ge=0, alias="CRICHEROES_MAX_RETRIES")
    # The call counter (spec §6.6) measures against the quota. It is per
    # 12-month term: set the term's first day to count from it, or the last
    # 365 days are counted. Past the warning share, the usage route flags it
    # and every sync run logs a warning.
    cricheroes_annual_quota: int = Field(
        default=100_000, gt=0, alias="CRICHEROES_ANNUAL_QUOTA"
    )
    cricheroes_quota_term_start: Optional[date] = Field(
        default=None, alias="CRICHEROES_QUOTA_TERM_START"
    )
    cricheroes_usage_warn_percent: float = Field(
        default=50.0, gt=0, le=100, alias="CRICHEROES_USAGE_WARN_PERCENT"
    )
    # The CricHeroes tournaments kept cached (spec §6.7), comma-separated, e.g.
    # "2242502,2251924". Empty: the sync does nothing.
    cricheroes_sync_tournament_ids: str = Field(
        default="", alias="CRICHEROES_SYNC_TOURNAMENT_IDS"
    )
    # A cached resource is refreshed after a match result changes, and at least
    # this often regardless.
    cricheroes_snapshot_max_age_hours: float = Field(
        default=24.0, gt=0, alias="CRICHEROES_SNAPSHOT_MAX_AGE_HOURS"
    )

    # 2Factor / OTP configuration
    twofactor_api_key: Optional[str] = Field(default=None, alias="TWOFACTOR_API_KEY")
    twofactor_template_name: Optional[str] = Field(
        default=None, alias="TWOFACTOR_TEMPLATE_NAME"
    )
    twofactor_base_url: str = Field(
        default="https://2factor.in/API/V1", alias="TWOFACTOR_BASE_URL"
    )
    otp_expiry_seconds: int = Field(default=600, alias="OTP_EXPIRY_SECONDS")
    otp_max_attempts: int = Field(default=5, alias="OTP_MAX_ATTEMPTS")
    reset_token_ttl_seconds: int = Field(default=600, alias="RESET_TOKEN_TTL_SECONDS")

    # Resend, the email channel for reset and change-email codes (spec §5.4).
    # Both must be set for the channel to be offered; until then the email
    # option answers 503 and the website hides it.
    resend_api_key: Optional[str] = Field(default=None, alias="RESEND_API_KEY")
    resend_from_email: Optional[str] = Field(default=None, alias="RESEND_FROM_EMAIL")
    resend_reply_to: Optional[str] = Field(default=None, alias="RESEND_REPLY_TO")

    @field_validator("cricheroes_sync_tournament_ids")
    @classmethod
    def _cricheroes_ids_are_positive_numbers(cls, value: str) -> str:
        # Checked at startup: a typo here would otherwise only show as a sync
        # that quietly caches nothing. -1 ("both tournaments") is refused: the
        # cache keeps each tournament on its own.
        for part in value.split(","):
            part = part.strip()
            if part and not (part.isdigit() and int(part) > 0):
                raise ValueError(
                    "CRICHEROES_SYNC_TOURNAMENT_IDS must be CricHeroes tournament "
                    f"ids separated by commas; {part!r} is not one"
                )
        return value

    @property
    def cricheroes_sync_tournaments(self) -> list[int]:
        """CRICHEROES_SYNC_TOURNAMENT_IDS as numbers, duplicates dropped."""
        ids = [
            int(p) for p in self.cricheroes_sync_tournament_ids.split(",") if p.strip()
        ]
        return list(dict.fromkeys(ids))

    @property
    def cors_origins_list(self) -> list[str]:
        """Convert CORS origins string to list and support wildcard patterns."""
        origins = [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]
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
    def mongodb_url_redacted(self) -> str:
        """MONGODB_URL with its user, password and options removed, for logs."""
        return redact_mongodb_url(self.mongodb_url)

    @property
    def shared_tenancy(self) -> bool:
        """True on the one backend that serves every tournament."""
        return self.tenancy == "shared"

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
