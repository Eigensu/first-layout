import re
from datetime import datetime
from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.common.consts.index import RESERVED_SUBDOMAINS, TOURNAMENT_SLUG_PATTERN
from app.common.datetime_utils import IST
from app.common.enums.tournaments import TournamentStatus
from app.schemas.dates import DatesInIST

SLUG_RE = re.compile(TOURNAMENT_SLUG_PATTERN)

# A CricHeroes tournament id (CRICHEROES_INTEGRATION_TECH_SPEC.md §13.1): a
# positive whole number. Strict, so a JSON `true`, `2242502.0` or "2242502" is
# refused rather than coerced; capped at the largest integer a browser holds
# exactly, since the admin form reads it back as a JavaScript number.
CricHeroesTournamentId = Annotated[int, Field(strict=True, gt=0, le=2**53 - 1)]


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
        raise ValueError(
            "Slugs starting with 'api-' or ending with '-api' are reserved for backend hosts"
        )
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
    cricheroes_tournament_id: Optional[CricHeroesTournamentId] = None

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
    # null unlinks the tournament: its stats page goes back to empty.
    cricheroes_tournament_id: Optional[CricHeroesTournamentId] = None

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


class TournamentResponse(DatesInIST):
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
    cricheroes_tournament_id: Optional[int] = None
    # Set only on the response to a save that linked a CricHeroes tournament,
    # when CricHeroes could not be asked whether they serve it: the link is
    # saved, and this says what is not confirmed.
    cricheroes_warning: Optional[str] = None
    created_at: datetime
    updated_at: datetime

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


class PublicTournamentResponse(DatesInIST):
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


class TournamentAdminAppoint(BaseModel):
    # Whatever the person signs in with: a mobile number, an email, or (while
    # usernames last) a username.
    identifier: str = Field(..., min_length=1)


class TournamentAdminResponse(BaseModel):
    user_id: str
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    # The name they go by in this tournament, which need not be their username.
    display_name: str


class TournamentAdminListResponse(BaseModel):
    admins: List[TournamentAdminResponse]
