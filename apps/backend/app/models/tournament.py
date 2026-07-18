from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime
from typing import Optional
from app.common.enums.tournaments import TournamentStatus
from app.utils.timezone import now_ist


class Tournament(Document):
    """A tournament tenant. Each tournament is served on its own subdomain
    (<slug>.wallearena.com); creating one here is all that is required for the
    subdomain to resolve — no per-tournament infrastructure changes.
    """

    # subdomain label, e.g. "dpcl" -> dpcl.wallearena.com
    slug: Indexed(str, unique=True)  # type: ignore

    name: str
    description: Optional[str] = None
    logo_url: Optional[str] = None

    status: TournamentStatus = TournamentStatus.DRAFT

    # optional schedule window
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    # branding for the subdomain landing page
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None

    # Where this tournament's backend lives. Empty means "the same API that
    # serves this registry" (target architecture: one shared backend). Set it
    # only for legacy per-tournament deployments (e.g. https://api-lpcl.wallearena.com).
    api_base_url: Optional[str] = None

    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)

    class Settings:
        name = "tournaments"
        indexes = [
            "slug",
            [("status", 1), ("start_at", -1)],
            [("created_at", -1)],
        ]
