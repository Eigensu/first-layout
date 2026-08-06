from enum import Enum

class ContestStatus(str, Enum):
    LIVE = "live"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ContestVisibility(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class PointsScope(str, Enum):
    TIME_WINDOW = "time_window"
    SNAPSHOT = "snapshot"


class ContestType(str, Enum):
    DAILY = "daily"
    FULL = "full"


class ContestFormat(str, Enum):
    """How a squad is assembled. Independent of ContestType (daily vs full)."""

    # Squad shape comes from Slot configuration; player price is cosmetic.
    SLOT_BASED = "slot_based"
    # Single open pool priced by auction sale value, capped by a purse.
    AUCTION_PURSE = "auction_purse"
