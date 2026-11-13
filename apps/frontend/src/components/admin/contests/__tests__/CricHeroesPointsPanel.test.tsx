import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContestCricHeroesPoints } from "@/lib/api/admin/contests";
import { CricHeroesPointsPanel } from "../CricHeroesPointsPanel";

function text(summary: ContestCricHeroesPoints | null) {
  return renderToStaticMarkup(<CricHeroesPointsPanel summary={summary} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

const linked: ContestCricHeroesPoints = {
  contest_id: "c1",
  points_from_cricheroes: true,
  cricheroes_tournament_id: 2242502,
  matches_counted: [
    {
      match_id: 1,
      match_date_time: "2026-11-10T09:00:00.000Z",
      teams: "Lions vs Tigers",
      players: 22,
    },
  ],
  matches_awaiting_mvp: [],
  players_scored: 20,
  unlinked_players: [],
};

describe("CricHeroesPointsPanel", () => {
  it("lists the matches counted and how many players score", () => {
    const shown = text(linked);
    expect(shown).toContain("20 players scored from 1 match");
    // 09:00 UTC is 14:30 in India.
    expect(shown).toContain("Lions vs Tigers · 10 Nov 2026, 2:30");
    expect(shown).toContain("22 players");
    expect(shown).not.toContain("still to read");
    expect(shown).not.toContain("Not linked here");
  });

  it("says how many completed matches the next sync still has to read", () => {
    expect(text({ ...linked, matches_awaiting_mvp: [2, 3] })).toContain(
      "2 completed matches still to read on the next hourly sync",
    );
  });

  it("names the CricHeroes players who score nothing for want of a link", () => {
    expect(
      text({ ...linked, unlinked_players: ["Zed (Lions)", "Yan (Tigers)"] }),
    ).toContain(
      "Not linked here, so scoring nothing: Zed (Lions), Yan (Tigers)",
    );
  });

  it("warns that nothing is scored while the tournament is not linked", () => {
    const shown = text({
      ...linked,
      cricheroes_tournament_id: null,
      matches_counted: [],
      players_scored: 0,
    });
    expect(shown).toContain("isn't linked to a CricHeroes tournament");
    expect(shown).not.toContain("scored from");
  });

  it("says so when the summary could not be loaded", () => {
    expect(text(null)).toContain("Couldn't load the CricHeroes points");
  });
});
