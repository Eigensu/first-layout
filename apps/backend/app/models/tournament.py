from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import Field

from app.common.datetime_utils import utc_now
from app.common.enums.tournaments import TournamentStatus


class Tournament(Document):
    """A tournament tenant. Each tournament is served on its own subdomain
    (<slug>.wallearena.com); creating one here is all that is required for the
    subdomain to resolve — no per-tournament infrastructure changes.
    """

    # subdomain label, e.g. "dpcl" -> dpcl.wallearena.com. Unique by the admin
    # route's check, not by the database: the field-level unique was shadowed
    # by the "slug" entry in Settings.indexes and never built (spec §13.8, R22).
    slug: str

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

    # The same tournament on CricHeroes, whose cached standings, MVP and
    # leaderboards its public stats page shows (CRICHEROES_INTEGRATION_TECH_SPEC.md
    # §13.1). Unset: the page shows nothing. Set by platform admins only; the
    # cache holds only the ids in CRICHEROES_SYNC_TOURNAMENT_IDS.
    cricheroes_tournament_id: Optional[int] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "tournaments"
        indexes = [
            "slug",
            [("status", 1), ("start_at", -1)],
            [("created_at", -1)],
        ]
