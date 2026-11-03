"""Response models for the CricHeroes third-party tournament API (v1).

Every model is lenient (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §8): unknown
keys are kept, not dropped, so a field CricHeroes adds -- or one not modelled
here yet -- still reaches our own responses under its upstream name.

A field is declared here only when one of these is true:

- its upstream key is not a usable Python name (`4s`, `Team Name`), so it
  needs an alias -- the table in spec §8.1;
- its type is a trap a naive model would get wrong -- spec §8.2;
- the documented example body it came from is on hand to check it against.

Everything else passes through as an extra. Declaring a field with a clean
upstream name adds nothing on the wire, so leaving it to pass through loses
nothing; guessing its type could only make a valid response fail. Where a
declared field's exact type has not been checked against an example, it is
typed `Loose`, which accepts any of the plausible scalar types unchanged.
"""

from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

# A number whose upstream type has not been confirmed from an example body.
# Smart-mode union validation keeps whichever type arrives -- 3, 3.5 or "3.50"
# -- so nothing is coerced, or rejected, on a guess.
Loose = Union[int, float, str]


class CricHeroesModel(BaseModel):
    # coerce_numbers_to_str: the doc shows several numbers as strings ("81.00",
    # "92.2"). If a row arrives with a bare number instead, keep the field a
    # string rather than fail the whole response over it.
    model_config = ConfigDict(
        populate_by_name=True, extra="allow", coerce_numbers_to_str=True
    )


# -- match ---------------------------------------------------------------


class MatchPartnership(CricHeroesModel):
    """One partnership. The current-partnership endpoint returns one of these;
    the per-team variant returns a list of them."""

    # "-" while the stand is still going.
    to_over: Optional[str] = None


# -- tournament ----------------------------------------------------------


class TournamentBoundaryCount(CricHeroesModel):
    """Boundary totals for a tournament.

    No field needs an alias or hides a type trap, so the documented keys all
    pass through as they are.
    """


class TournamentMatch(CricHeroesModel):
    """One row of the tournament match list."""

    # A string: "" for an abandoned match, "0" for a no-result, else a team id.
    winning_team_id: Optional[str] = None
    # 0 means "not revised", not a target or an over count of zero.
    revised_target: Optional[Loose] = None
    revised_overs: Optional[Loose] = None


class PointTableRow(CricHeroesModel):
    """One team's row in a tournament point table."""

    group: Optional[Loose] = Field(default=None, alias="Group")
    team_name: Optional[str] = Field(default=None, alias="Team Name")
    matches: Optional[Loose] = Field(default=None, alias="Matches")
    won: Optional[Loose] = Field(default=None, alias="Won")
    lost: Optional[Loose] = Field(default=None, alias="Lost")
    no_result: Optional[Loose] = Field(default=None, alias="N/R")
    points: Optional[Loose] = Field(default=None, alias="Points")
    net_rr: Optional[Loose] = Field(default=None, alias="Net RR")
    last_5: Optional[Loose] = Field(default=None, alias="Last 5")
    group_id: Optional[Loose] = Field(default=None, alias="GroupID")
    round_id: Optional[Loose] = Field(default=None, alias="RoundID")
    round_name: Optional[str] = Field(default=None, alias="RoundName")


# -- leaderboards --------------------------------------------------------


class BattingLeaderboardEntry(CricHeroesModel):
    """One player on the tournament batting leaderboard.

    Fully modelled: the documented example body for this endpoint is on hand.
    """

    player_id: int
    name: str
    profile_photo: Optional[str] = None
    total_match: Optional[int] = None
    innings: Optional[int] = None
    total_runs: Optional[int] = None
    highest_run: Optional[int] = None
    # "*" when the highest score was not out, otherwise "". Not a bool.
    highest_run_with_not_out: Optional[str] = None
    # Strings here ("81.00", "98.33"), unlike the inning leaderboard.
    average: Optional[str] = None
    strike_rate: Optional[str] = None
    not_out: Optional[int] = None
    fours: Optional[int] = Field(default=None, alias="4s")
    sixes: Optional[int] = Field(default=None, alias="6s")
    fifties: Optional[int] = Field(default=None, alias="50s")
    hundreds: Optional[int] = Field(default=None, alias="100s")
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    ball_faced: Optional[int] = None
    batting_hand: Optional[str] = None


class InningBattingLeaderboardEntry(CricHeroesModel):
    """One innings on the best-single-innings batting leaderboard."""

    # A float here (112.925), unlike the tournament batting leaderboard.
    strike_rate: Optional[float] = None
    fours: Optional[Loose] = Field(default=None, alias="4s")
    sixes: Optional[Loose] = Field(default=None, alias="6s")
    fifties: Optional[Loose] = Field(default=None, alias="50s")
    hundreds: Optional[Loose] = Field(default=None, alias="100s")


class BowlingLeaderboardEntry(CricHeroesModel):
    """One player on the tournament bowling leaderboard."""

    strike_rate: Optional[Loose] = Field(default=None, alias="SR")
    # A float for bowling (18.63), unlike batting's string.
    average: Optional[float] = Field(default=None, alias="avg")
    # A string here ("92.2"), unlike the per-player data's float.
    overs: Optional[str] = None
    three_wickets: Optional[Loose] = Field(default=None, alias="3_wickets")
    four_wickets: Optional[Loose] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[Loose] = Field(default=None, alias="5_wickets")


class InningBowlingLeaderboardEntry(CricHeroesModel):
    """One spell on the best-single-innings bowling leaderboard."""

    three_wickets: Optional[Loose] = Field(default=None, alias="3_wickets")
    four_wickets: Optional[Loose] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[Loose] = Field(default=None, alias="5_wickets")


class SeasonOption(CricHeroesModel):
    """A sibling season of the tournament: its label and tournament id."""

    key: str
    # The tournament id, as a string ("1493258").
    value: str


class LeaderboardFilterOption(CricHeroesModel):
    """A leaderboard the tournament supports, and the endpoint that serves it."""

    key: str
    # e.g. "thirdparty/client/get-tournament-batting-leaderboard"
    url: Optional[str] = None


class LeaderboardFilterTeam(CricHeroesModel):
    team_id: int
    team_name: str


class LeaderboardStatsFilter(CricHeroesModel):
    """What leaderboards a tournament supports.

    CricHeroes' own discovery endpoint. Prefer it over hardcoded sort_filter
    lists: the API doc's lists disagree with what this returns (spec §13.3).
    """

    season: List[SeasonOption] = Field(default_factory=list)
    batting: List[LeaderboardFilterOption] = Field(default_factory=list)
    bowling: List[LeaderboardFilterOption] = Field(default_factory=list)
    teams: List[LeaderboardFilterTeam] = Field(default_factory=list)


# -- player season stats -------------------------------------------------


class PlayerBattingSeason(CricHeroesModel):
    """A player's batting totals for one season, or the "Career" row."""

    # "Career" for the aggregate row, otherwise a year as a string.
    year: str
    matches: Optional[Loose] = Field(default=None, alias="mat")
    not_outs: Optional[Loose] = Field(default=None, alias="no")
    highest_score: Optional[Loose] = Field(default=None, alias="hs")
    balls_faced: Optional[Loose] = Field(default=None, alias="bf")
    strike_rate: Optional[Loose] = Field(default=None, alias="sr")
    average: Optional[Loose] = Field(default=None, alias="avg")
    fours: Optional[Loose] = Field(default=None, alias="4s")
    sixes: Optional[Loose] = Field(default=None, alias="6s")
    fifties: Optional[Loose] = Field(default=None, alias="50s")
    hundreds: Optional[Loose] = Field(default=None, alias="100s")


class PlayerBowlingSeason(CricHeroesModel):
    """A player's bowling totals for one season, or the "Career" row."""

    year: str
    # An int on the "Career" row, a string on each season row.
    balls: Optional[Union[int, str]] = None
    best_bowling: Optional[Loose] = Field(default=None, alias="bbm")
    average: Optional[Loose] = Field(default=None, alias="ave")
    economy: Optional[Loose] = Field(default=None, alias="econ")
    three_wickets: Optional[Loose] = Field(default=None, alias="3_wickets")
    four_wickets: Optional[Loose] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[Loose] = Field(default=None, alias="5_wickets")
