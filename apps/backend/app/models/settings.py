from datetime import datetime
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field

from app.utils.timezone import now_ist

PLATFORM_DEFAULTS_ID = "global"


class GlobalSettings(Document):
    """Squad composition settings, per tournament.

    Was a singleton pinned to id="global". Under one database that singleton
    would apply to every tournament at once, which is wrong -- squad rules are
    exactly the kind of thing that differs between tournaments.

    So there is now one document per tournament, plus the original "global"
    document, which stays as the platform default a tournament inherits from
    before anyone overrides it. Resolution runs
    ``Contest.max_players_per_team`` -> this tournament's row -> platform
    default; Contest already carries the per-contest override.
    """

    id: str = Field(default=PLATFORM_DEFAULTS_ID)

    # None on the platform-default document; set on a tournament's own row.
    # See app/utils/tenant.py -- this is the one tenant-scoped collection
    # that keeps a global document too, because the default has to live
    # somewhere.
    tournament_id: Optional[PydanticObjectId] = None

    default_contest_logo_file_id: Optional[str] = None
    min_players_per_team: int = Field(
        default=1,
        description="Minimum number of players required from a single team when finalizing a team.",
    )
    max_players_per_team: int = Field(
        default=7,
        description="Maximum limit of players that can be drafted from a single team.",
    )
    updated_at: datetime = Field(default_factory=now_ist)

    class Settings:
        name = "global_settings"
        indexes = [
            "tournament_id",
        ]

    @classmethod
    async def get_instance(cls) -> "GlobalSettings":
        """The platform-default document, creating it if absent.

        Kept because every current caller wants exactly this: before the
        backfill there is one tournament per database, so the platform default
        *is* that tournament's settings. New code should prefer
        :meth:`get_for_tournament`.
        """
        instance = await cls.get(PLATFORM_DEFAULTS_ID)
        if not instance:
            instance = cls(id=PLATFORM_DEFAULTS_ID)
            await instance.insert()
        return instance

    @classmethod
    async def get_for_tournament(
        cls, tournament_id: Optional[PydanticObjectId]
    ) -> "GlobalSettings":
        """This tournament's settings, falling back to the platform default.

        The fallback is not a temporary migration convenience -- a tournament
        that has never had its rules customised should keep tracking the
        platform default rather than freeze a copy of it at creation time.
        A row is written for a tournament only when someone overrides it.
        """
        if tournament_id is None:
            return await cls.get_instance()

        instance = await cls.find_one(cls.tournament_id == tournament_id)
        if instance:
            return instance
        return await cls.get_instance()
