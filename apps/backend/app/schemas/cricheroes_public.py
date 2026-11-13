"""What the public CricHeroes stats routes return
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.2).

One envelope for every table, so a page handles "not linked", "not fetched
yet" and "here it is, as of then" the same way for each.
"""

from datetime import datetime
from typing import Generic, List, Optional, TypeVar

from pydantic import Field

from app.schemas.cricheroes import (
    BattingLeaderboardEntry,
    BowlingLeaderboardEntry,
    PlayerMvp,
    PointTableRow,
)
from app.schemas.dates import DatesInIST

Row = TypeVar("Row")


class CachedTable(DatesInIST, Generic[Row]):
    # Whether a platform admin has linked this tournament to a CricHeroes
    # tournament (§13.1). False: there is nothing to show, and nothing coming.
    linked: bool
    # When CricHeroes was last read for this table, in IST. None: linked, but
    # not fetched yet. Data is kept through a failed refresh (§6.7), so this
    # is what tells a page how old the rows are.
    fetched_at: Optional[datetime] = None
    # In CricHeroes' order, under our attribute names (§8.3).
    rows: List[Row] = Field(default_factory=list)


# Named subclasses, so the OpenAPI schema names read well.
class CachedPointTable(CachedTable[PointTableRow]):
    pass


class CachedMvpTable(CachedTable[PlayerMvp]):
    pass


class CachedBattingLeaderboard(CachedTable[BattingLeaderboardEntry]):
    pass


class CachedBowlingLeaderboard(CachedTable[BowlingLeaderboardEntry]):
    pass
