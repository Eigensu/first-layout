import re
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from app.common.consts.index import TOURNAMENT_SLUG_PATTERN, RESERVED_SUBDOMAINS
from app.common.enums.tournaments import TournamentStatus
from app.utils.timezone import to_ist, IST

SLUG_RE = re.compile(TOURNAMENT_SLUG_PATTERN)


def validate_slug(value: str) -> str:
    """Normalize and validate a tournament subdomain slug.

    Raises ValueError with a human-readable message on failure so pydantic
    surfaces it as a 422 detail.
    """
    slug = (value or "").strip().lower()
    if not SLUG_RE.match(slug):
        raise ValueError(
            "Slug must be 3-32 characters, lowercase letters, numbers and hyphens, "
            "and must start and end with a letter or number"
        )
    if slug in RESERVED_SUBDOMAINS:
        raise ValueError(f"'{slug}' is a reserved subdomain and cannot be used")
    if slug.startswith("api-") or slug.endswith("-api"):
        raise ValueError("Slugs starting with 'api-' or ending with '-api' are reserved for backend hosts")
    return slug


def _parse_ist(v):
    """Parse datetimes as IST when naive, convert when timezone-aware."""
    if isinstance(v, str):
        parsed = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=IST)
        return parsed.astimezone(IST)
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=IST)
        return v.astimezone(IST)
    return v


class TournamentCreate(BaseModel):
    slug: str = Field(..., min_length=3, max_length=32)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    logo_url: Optional[str] = None
    status: TournamentStatus = TournamentStatus.DRAFT
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    primary_color: Optional[str] = Field(default=None, max_length=32)
    secondary_color: Optional[str] = Field(default=None, max_length=32)
    api_base_url: Optional[str] = Field(default=None, max_length=300)

    @field_validator("slug")
    @classmethod
    def check_slug(cls, v):
        return validate_slug(v)

    @field_validator("start_at", "end_at", mode="before")
    @classmethod
    def parse_as_ist(cls, v):
        return _parse_ist(v)


class TournamentUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=3, max_length=32)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    logo_url: Optional[str] = None
    status: Optional[TournamentStatus] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    primary_color: Optional[str] = Field(default=None, max_length=32)
    secondary_color: Optional[str] = Field(default=None, max_length=32)
    api_base_url: Optional[str] = Field(default=None, max_length=300)

    @field_validator("slug")
    @classmethod
    def check_slug(cls, v):
        if v is None:
            return v
        return validate_slug(v)

    @field_validator("start_at", "end_at", mode="before")
    @classmethod
    def parse_as_ist(cls, v):
        return _parse_ist(v)


class TournamentResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    status: TournamentStatus
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    api_base_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("start_at", "end_at", "created_at", "updated_at", mode="before")
    @classmethod
    def ensure_ist(cls, v):
        if isinstance(v, datetime):
            return to_ist(v)
        return v

    class Config:
        from_attributes = True


class TournamentListResponse(BaseModel):
    tournaments: List[TournamentResponse]
    total: int
    page: int
    page_size: int


class SlugAvailabilityResponse(BaseModel):
    slug: str
    available: bool
    reason: Optional[str] = None


class PublicTournamentResponse(BaseModel):
    """Shape returned to unauthenticated subdomain visitors."""

    slug: str
    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    status: TournamentStatus
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    api_base_url: Optional[str] = None

    @field_validator("start_at", "end_at", mode="before")
    @classmethod
    def ensure_ist(cls, v):
        if isinstance(v, datetime):
            return to_ist(v)
        return v
