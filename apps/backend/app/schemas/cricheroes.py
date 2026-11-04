"""Response models for the CricHeroes third-party tournament API (v1).

Built from the example bodies in the CricHeroes API doc (the MediaHubble
build of 4 Nov 2026), which are kept in
tests/fixtures/cricheroes_doc_examples.json; every documented field is modelled,
and the tests check that each example parses with nothing left over
(docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §8).

Still lenient: unknown keys are kept, not dropped, so a field CricHeroes adds
later reaches our own responses under its upstream name before we model it.

Types follow the examples, including where they are inconsistent between
endpoints -- `overs` is a string on the tournament bowling leaderboard and a
number on the innings one, for instance. Those are not normalised: the value is
passed on as CricHeroes sent it, and each such field says so in a comment.
Identity fields (ids, names) are required; everything else is optional, so a
row with a missing statistic still parses.

Flags such as `is_captain` stay the 0/1 integers CricHeroes sends, and
timestamps stay ISO-8601 strings, for the same reason.
"""

from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class CricHeroesModel(BaseModel):
    # coerce_numbers_to_str: the doc shows several numbers as strings ("81.00",
    # "92.2"). If a row arrives with a bare number instead, keep the field a
    # string rather than fail the whole response over it.
    model_config = ConfigDict(
        populate_by_name=True, extra="allow", coerce_numbers_to_str=True
    )


# -- match: playing squad ------------------------------------------------


class SquadPlayer(CricHeroesModel):
    # Undocumented. "SS_..." -- the same on every row of one response, so it
    # identifies the query, not the row.
    query_id: Optional[str] = None
    team_id: int
    player_id: int
    player_name: str
    # 0 or 1.
    is_captain: Optional[int] = None
    is_wicket_keeper: Optional[int] = None
    is_substitute: Optional[int] = None
    profile_photo: Optional[str] = None
    batting_hand: Optional[str] = None
    player_role: Optional[str] = None
    bowling_type: Optional[str] = None


class SquadTeam(CricHeroesModel):
    """One team's XI for a match. The endpoint returns one per team."""

    team_id: int
    team_name: str
    match_squad: List[SquadPlayer] = Field(default_factory=list)


# -- match: partnerships -------------------------------------------------


class MatchPartnership(CricHeroesModel):
    """One partnership. The current-partnership endpoint returns one of these;
    the per-team variant returns a list of them."""

    query_id: Optional[str] = None  # see SquadPlayer.query_id
    for_wicket: Optional[str] = None  # "1st", "2nd", ...
    runs: Optional[int] = None
    # Cricket notation: 12.3 is 12 overs and 3 balls, not 12.3 overs.
    overs: Optional[float] = None
    balls: Optional[int] = None
    run_rate: Optional[str] = None
    player_a_name: Optional[str] = None
    player_a_runs: Optional[int] = None
    player_a_balls: Optional[int] = None
    player_b_name: Optional[str] = None
    player_b_runs: Optional[int] = None
    player_b_balls: Optional[int] = None
    from_over: Optional[float] = None
    # Only on the per-team list. A string, and "-" while the stand is unbroken.
    to_over: Optional[str] = None


# -- match: graphs -------------------------------------------------------


class GraphMatchInfo(CricHeroesModel):
    query_id: Optional[str] = None  # manhattan only, not worm
    match_id: int
    overs: Optional[int] = None  # overs per side
    inning: Optional[int] = None
    current_inning: Optional[int] = None
    team_a_id: Optional[int] = None
    team_a_name: Optional[str] = None
    team_b_id: Optional[int] = None
    team_b_name: Optional[str] = None


class ManhattanOver(CricHeroesModel):
    """Runs and wickets in one over."""

    query_id: Optional[str] = None  # manhattan only, not worm
    match_id: int
    team_id: int
    inning: int
    over: int
    runs: Optional[int] = None
    wickets: Optional[int] = None


class WormOver(ManhattanOver):
    """An over, plus the innings total and run rate after it."""

    total_score: Optional[int] = None
    run_rate: Optional[str] = None


class ManhattanGraph(CricHeroesModel):
    # A list, though the doc's example holds one entry.
    match_info: List[GraphMatchInfo] = Field(default_factory=list)
    graph_data: List[ManhattanOver] = Field(default_factory=list)


class WormGraph(CricHeroesModel):
    match_info: List[GraphMatchInfo] = Field(default_factory=list)
    graph_data: List[WormOver] = Field(default_factory=list)


# -- tournament: boundary count ------------------------------------------


class TournamentBoundaryCount(CricHeroesModel):
    """Documented as a one-element list; the client unwraps it."""

    query_id: Optional[str] = None  # see SquadPlayer.query_id
    total_six: Optional[int] = None
    total_four: Optional[int] = None


# -- tournament: one player's matches ------------------------------------


class MatchPlayerInfo(CricHeroesModel):
    query_id: Optional[str] = None  # see SquadPlayer.query_id
    player_id: int
    name: str
    player_role: Optional[str] = None
    bowling_type: Optional[str] = None
    batting_hand: Optional[str] = None
    profile_photo: Optional[str] = None
    dob: Optional[str] = None  # "" when unknown
    total_match: Optional[int] = None


class MatchBattingRow(CricHeroesModel):
    """One innings. No fours or sixes (§13.9)."""

    query_id: Optional[str] = None  # see SquadPlayer.query_id
    # New in the doc of 4 Nov 2026; optional until the live API is seen to
    # send them. Without them, rows could only be told apart by opposition
    # and order (§13.9).
    match_id: Optional[int] = None
    match_date_time: Optional[str] = None
    runs: Optional[int] = None
    ball: Optional[int] = None
    sr: Optional[float] = None
    is_not_out: Optional[int] = None  # 0 or 1
    opposition_team_name: Optional[str] = None


class MatchBowlingRow(CricHeroesModel):
    """One spell. No dot balls (§13.9)."""

    query_id: Optional[str] = None  # see SquadPlayer.query_id
    match_id: Optional[int] = None  # see MatchBattingRow.match_id
    match_date_time: Optional[str] = None
    # A number here (2.5, 7), unlike the tournament bowling leaderboard.
    overs: Optional[float] = None
    maidens: Optional[int] = None
    runs: Optional[int] = None
    wickets: Optional[int] = None
    opposition_team_name: Optional[str] = None


class PlayerMatchBattingData(CricHeroesModel):
    player_info: MatchPlayerInfo
    player_data: List[MatchBattingRow] = Field(default_factory=list)


class PlayerMatchBowlingData(CricHeroesModel):
    player_info: MatchPlayerInfo
    player_data: List[MatchBowlingRow] = Field(default_factory=list)


# -- tournament: match list ----------------------------------------------


class MatchSummary(CricHeroesModel):
    team_id: Optional[int] = None  # -1 in every documented example
    summary: Optional[str] = None
    short_summary: Optional[str] = None
    full_summary: Optional[str] = None
    rrr: Optional[str] = None  # required run rate
    target: Optional[str] = None  # "-" when there is none


class InningsScore(CricHeroesModel):
    score: Optional[str] = None  # "311/8"
    over: Optional[str] = None  # "(50.0 Ov)"
    ball: Optional[str] = None  # "(0 Ball)"
    rr: Optional[str] = None


class MatchInnings(CricHeroesModel):
    team_id: int
    inning: int
    inning_start_time: Optional[str] = None
    inning_end_time: Optional[str] = None
    is_declare: Optional[int] = None
    is_forfeited: Optional[int] = None
    is_followon: Optional[int] = None
    total_run: Optional[int] = None
    total_wicket: Optional[int] = None
    total_extra: Optional[int] = None
    overs_played: Optional[str] = None  # "50.0", a string here
    balls_played: Optional[int] = None
    # Per innings, not per match. 0 means "not revised", not a target of zero.
    revised_target: Optional[int] = None
    revised_overs: Optional[int] = None
    lead_by: Optional[int] = None
    trail_by: Optional[int] = None
    summary: Optional[InningsScore] = None


class TournamentMatch(CricHeroesModel):
    """One row of the tournament match list."""

    query_id: Optional[str] = None  # see SquadPlayer.query_id
    match_id: int
    # 1 live, 2 upcoming, 3 past; the same codes the `type` filter takes.
    type: Optional[int] = None
    match_date_time: Optional[str] = None
    status: Optional[str] = None  # "live", "upcoming", "past"
    team_a_id: Optional[int] = None
    team_a_name: Optional[str] = None
    team_a_short_name: Optional[str] = None
    team_a_logo: Optional[str] = None
    team_a_summary: Optional[str] = None  # "311/8", "" or "Yet to bat"
    team_a_innings: List[MatchInnings] = Field(default_factory=list)
    team_b_id: Optional[int] = None
    team_b_name: Optional[str] = None
    team_b_short_name: Optional[str] = None
    team_b_logo: Optional[str] = None
    team_b_summary: Optional[str] = None
    team_b_innings: List[MatchInnings] = Field(default_factory=list)
    # Free text, inconsistently cased: "Resulted", "Abandoned", "abandoned".
    match_result: Optional[str] = None
    win_by: Optional[str] = None
    # A string: "" when abandoned, "0" for a no-result, else the team id.
    winning_team_id: Optional[str] = None
    winning_team: Optional[str] = None
    ground_id: Optional[int] = None
    ground_name: Optional[str] = None
    city_id: Optional[int] = None
    # `city_name` since the doc of 4 Nov 2026, which also dropped
    # `is_watch_live`. Either would still come through as an extra.
    city_name: Optional[str] = None
    index: Optional[int] = None
    match_summary: Optional[MatchSummary] = None
    toss_details: Optional[str] = None


# -- tournament: point table ---------------------------------------------


class PointTableRow(CricHeroesModel):
    """One team's row in a tournament point table."""

    group: Optional[str] = Field(default=None, alias="Group")
    team_id: Optional[int] = Field(default=None, alias="TeamID")
    team_name: str = Field(alias="Team Name")
    team_logo: Optional[str] = None
    matches: Optional[int] = Field(default=None, alias="Matches")
    won: Optional[int] = Field(default=None, alias="Won")
    lost: Optional[int] = Field(default=None, alias="Lost")
    drawn: Optional[int] = Field(default=None, alias="Drawn")
    tied: Optional[int] = Field(default=None, alias="Tied")
    no_result: Optional[int] = Field(default=None, alias="N/R")
    points: Optional[int] = Field(default=None, alias="Points")
    # "-0.200", or a bare 0 before a result counts; kept a string either way.
    net_rr: Optional[str] = Field(default=None, alias="Net RR")
    # Despite the name, every result so far: "W-L-W-W-W-L-L-W-W".
    last_5: Optional[str] = Field(default=None, alias="Last 5")
    quotient: Optional[float] = Field(default=None, alias="Quotient")
    group_id: Optional[int] = Field(default=None, alias="GroupID")
    round_id: Optional[int] = Field(default=None, alias="RoundID")
    round_name: Optional[str] = Field(default=None, alias="RoundName")


# -- leaderboards --------------------------------------------------------


class BattingLeaderboardEntry(CricHeroesModel):
    """One player on the tournament batting leaderboard."""

    player_id: int
    name: str
    profile_photo: Optional[str] = None
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    batting_hand: Optional[str] = None
    total_match: Optional[int] = None
    innings: Optional[int] = None
    total_runs: Optional[int] = None
    highest_run: Optional[int] = None
    # "*" when the highest score was not out, otherwise "". Not a bool.
    highest_run_with_not_out: Optional[str] = None
    not_out: Optional[int] = None
    ball_faced: Optional[int] = None
    # Strings here ("81.00", "98.33"), unlike the inning leaderboard.
    average: Optional[str] = None
    strike_rate: Optional[str] = None
    fours: Optional[int] = Field(default=None, alias="4s")
    sixes: Optional[int] = Field(default=None, alias="6s")
    fifties: Optional[int] = Field(default=None, alias="50s")
    hundreds: Optional[int] = Field(default=None, alias="100s")


class InningBattingLeaderboardEntry(CricHeroesModel):
    """One innings on the best-single-innings batting leaderboard."""

    player_id: int
    name: str
    profile_photo: Optional[str] = None
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    against_team_id: Optional[int] = None
    against_team_name: Optional[str] = None
    batting_hand: Optional[str] = None
    total_runs: Optional[int] = None
    highest_run: Optional[int] = None
    not_out: Optional[int] = None
    ball_faced: Optional[int] = None
    # A float here, unlike the tournament leaderboard's string -- and with
    # single-precision noise: 112.92500305175781. Round for display.
    strike_rate: Optional[float] = None
    fours: Optional[int] = Field(default=None, alias="4s")
    sixes: Optional[int] = Field(default=None, alias="6s")
    match_date: Optional[str] = None
    ground_id: Optional[int] = None
    ground_name: Optional[str] = None
    city_id: Optional[int] = None
    city_name: Optional[str] = None


class BowlingLeaderboardEntry(CricHeroesModel):
    """One player on the tournament bowling leaderboard."""

    player_id: int
    name: str
    profile_photo: Optional[str] = None
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    bowling_style: Optional[str] = None
    total_match: Optional[int] = None
    innings: Optional[int] = None
    total_wickets: Optional[int] = None
    highest_wicket: Optional[int] = None
    maidens: Optional[int] = None
    runs: Optional[int] = None
    # Strings here ("554", "92.2", "5.45", "20.52") -- unlike the innings
    # leaderboard, where overs and economy are numbers.
    balls: Optional[str] = None
    overs: Optional[str] = None
    economy: Optional[str] = None
    strike_rate: Optional[str] = Field(default=None, alias="SR")
    # ...but the average is a number (18.63).
    average: Optional[float] = Field(default=None, alias="avg")
    three_wickets: Optional[int] = Field(default=None, alias="3_wickets")
    four_wickets: Optional[int] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[int] = Field(default=None, alias="5_wickets")


class InningBowlingLeaderboardEntry(CricHeroesModel):
    """One spell on the best-single-innings bowling leaderboard."""

    player_id: int
    name: str
    profile_photo: Optional[str] = None
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    against_team_id: Optional[int] = None
    against_team_name: Optional[str] = None
    bowling_style: Optional[str] = None
    total_wickets: Optional[int] = None
    highest_wicket: Optional[int] = None
    maidens: Optional[int] = None
    dot_ball: Optional[int] = None
    runs: Optional[int] = None
    balls: Optional[str] = None  # a string, as on the tournament leaderboard
    # Numbers here (9.1, 10; 3.82), unlike the tournament leaderboard.
    overs: Optional[float] = None
    economy: Optional[float] = None
    best_bowling_figure: Optional[str] = Field(default=None, alias="bbf")  # "6-35"
    match_date: Optional[str] = None
    ground_id: Optional[int] = None
    ground_name: Optional[str] = None
    city_id: Optional[int] = None
    city_name: Optional[str] = None
    three_wickets: Optional[int] = Field(default=None, alias="3_wickets")
    four_wickets: Optional[int] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[int] = Field(default=None, alias="5_wickets")


class SeasonOption(CricHeroesModel):
    """A season of the tournament: its label and tournament id."""

    key: str
    # The tournament id as a string ("2242502"); "-1" for the "ALL" entry.
    value: str


class LeaderboardFilterOption(CricHeroesModel):
    """A leaderboard the tournament offers: its display name, the endpoint
    that serves it, and the sort_filter value to send."""

    key: str  # display name, sometimes a sponsor's ("Orange Cap")
    url: str  # "thirdparty/mediahubble/get-tournament-batting-leaderboard"
    value: str  # the sort_filter value, e.g. "RUN"


class LeaderboardFilterTeam(CricHeroesModel):
    query_id: Optional[str] = None  # see SquadPlayer.query_id
    team_id: int
    # The season this entry belongs to. The same team repeats once per season.
    tournament_id: Optional[int] = None
    team_name: str


class LeaderboardStatsFilter(CricHeroesModel):
    """What leaderboards, seasons and teams a tournament offers.

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
    matches: Optional[int] = Field(default=None, alias="mat")
    not_outs: Optional[int] = Field(default=None, alias="no")
    runs: Optional[int] = None
    # Strings: "64", "56.00", "188.76".
    highest_score: Optional[str] = Field(default=None, alias="hs")
    average: Optional[str] = Field(default=None, alias="avg")
    strike_rate: Optional[str] = Field(default=None, alias="sr")
    balls_faced: Optional[int] = Field(default=None, alias="bf")
    fours: Optional[int] = Field(default=None, alias="4s")
    sixes: Optional[int] = Field(default=None, alias="6s")
    fifties: Optional[int] = Field(default=None, alias="50s")
    hundreds: Optional[int] = Field(default=None, alias="100s")


class PlayerBowlingSeason(CricHeroesModel):
    """A player's bowling totals for one season, or the "Career" row."""

    year: str
    matches: Optional[int] = Field(default=None, alias="mat")
    # An int on the "Career" row, a string on each season row.
    balls: Optional[Union[int, str]] = None
    runs: Optional[int] = None
    wickets: Optional[int] = None
    # Strings, with "" or "-" when there is nothing to show.
    best_bowling: Optional[str] = Field(default=None, alias="bbm")
    average: Optional[str] = Field(default=None, alias="ave")
    economy: Optional[str] = Field(default=None, alias="econ")
    strike_rate: Optional[str] = Field(default=None, alias="sr")
    # No 3-wicket count on this endpoint, unlike the leaderboards.
    four_wickets: Optional[int] = Field(default=None, alias="4_wickets")
    five_wickets: Optional[int] = Field(default=None, alias="5_wickets")


# -- MVP -----------------------------------------------------------------


class PlayerMvp(CricHeroesModel):
    """One player's row in a match's or a tournament's MVP table.

    Points come from CricHeroes' own MVP formula (spec §13.5), not ours. They
    are strings with three decimals ("8.719"), and `total` is the sum of the
    other three. The doc's samples are marked provisional (§13.12).
    """

    player_id: int
    name: str
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    profile_photo: Optional[str] = None
    matches: Optional[int] = None  # 1 on the match table
    batting: Optional[str] = None
    bowling: Optional[str] = None
    fielding: Optional[str] = None
    total: Optional[str] = None
    is_player_pro: Optional[int] = None  # 0 or 1
    rank: Optional[int] = None
