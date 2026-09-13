from datetime import datetime
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.utils.timezone import now_ist

# status values
STATUS_REGISTERED = "registered"
STATUS_PLAYED = "played"

# role values
ROLE_PLAYER = "player"
ROLE_ADMIN = "admin"


class MembershipStats(BaseModel):
    """What this person did in this tournament.

    Materialised rather than computed per request. The counts are cheap enough
    to derive, but best_rank and total_points need leaderboard data per contest,
    which is not something a profile page should be doing on every load.

    Refreshed by scripts/refresh_membership_stats.py while a tournament is live
    and frozen once it completes -- at which point these numbers are final by
    definition and never need recomputing again.
    """

    teams_count: int = 0
    contests_count: int = 0
    best_rank: Optional[int] = None
    total_points: float = 0.0
    refreshed_at: Optional[datetime] = None


class TournamentMembership(Document):
    """One person's participation in one tournament.

    This is the collection that answers "which tournaments has this user played",
    which is the whole point of unifying the accounts. A list on the user
    document would have been simpler and wrong: it grows without bound, it
    cannot carry what differs per tournament (the name they used there, their
    role, their rank), and it only answers one direction. This answers both --
    all tournaments for a user, and all users in a tournament -- each off its
    own index.
    """

    user_id: PydanticObjectId
    tournament_id: PydanticObjectId
    # Denormalised so a profile can render the list without joining the
    # registry for every row. tournament_id stays the reference of record.
    tournament_slug: str

    # Which database this came from, and who they were in it. Kept for the
    # lifetime of the record: it is how a support question about an old team
    # gets answered, and what a mistaken merge would be unpicked with.
    source_db: Optional[str] = None
    legacy_user_id: Optional[PydanticObjectId] = None

    # The username this person used in this tournament. Usernames stop being
    # globally unique, so the name someone played under here is theirs alone
    # and does not have to match what they are called anywhere else.
    display_name: str

    role: str = ROLE_PLAYER
    # registered -> played on the first team or enrolment. Never goes back:
    # having played a tournament is not something that later becomes untrue.
    status: str = STATUS_REGISTERED

    joined_at: datetime = Field(default_factory=now_ist)
    first_played_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None

    stats: MembershipStats = Field(default_factory=MembershipStats)

    class Settings:
        name = "tournament_memberships"
        indexes = [
            [("user_id", 1), ("status", 1)],
            [("tournament_id", 1), ("role", 1)],
            IndexModel(
                [("user_id", 1), ("tournament_id", 1)],
                unique=True,
                name="uniq_user_per_tournament",
            ),
            # Makes the migration idempotent: re-running it cannot create a
            # second membership for a legacy row it already imported. Partial
            # because memberships created by the app after cutover have no
            # legacy row, and every one of those would otherwise collide on the
            # same missing key.
            IndexModel(
                [("source_db", 1), ("legacy_user_id", 1)],
                unique=True,
                partialFilterExpression={"legacy_user_id": {"$exists": True}},
                name="uniq_legacy_row",
            ),
        ]

    def __repr__(self):
        return (
            f"<TournamentMembership {self.display_name}@{self.tournament_slug} "
            f"{self.status}>"
        )
