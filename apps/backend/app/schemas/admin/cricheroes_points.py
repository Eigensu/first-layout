"""What an admin sees of a contest scored from CricHeroes (spec §9.3)."""

from typing import List, Optional

from pydantic import BaseModel, Field


class CountedMatch(BaseModel):
    """A CricHeroes match whose MVP table counts towards the contest."""

    match_id: int
    match_date_time: Optional[str] = None
    teams: str  # "Team A vs Team B"
    players: int  # rows in its MVP table


class ContestPointsSummary(BaseModel):
    """How a contest is scored from CricHeroes, worked out from what is stored:
    no request to CricHeroes is made to build it."""

    contest_id: str
    points_from_cricheroes: bool
    # The CricHeroes tournament the contest's tournament is linked to; None
    # when it is not linked, and then nothing can be scored.
    cricheroes_tournament_id: Optional[int] = None
    matches_counted: List[CountedMatch] = Field(default_factory=list)
    # Completed matches in the contest's window whose MVP table has not been
    # read yet: the next scheduled sync reads them.
    matches_awaiting_mvp: List[int] = Field(default_factory=list)
    players_scored: int = 0
    # CricHeroes players with points in these matches but no player here
    # holding their id: they score nothing until linked (the CricHeroes
    # import, or the sheet import's id column).
    unlinked_players: List[str] = Field(default_factory=list)
