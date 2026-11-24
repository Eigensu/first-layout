// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditPlayersModal } from "../EditPlayersModal";
import { CONTEST_FORMAT } from "@/common/consts/contest";

afterEach(cleanup);

const pool = [
  { id: "a", name: "Alpha", team: "A", price: 10, slot: "s1" },
  { id: "b", name: "Bravo", team: "B", price: 10, slot: "s1" },
  { id: "c", name: "Charlie", team: "A", price: 10, slot: "s1" },
];

function renderSheet(onSave = vi.fn()) {
  render(
    <EditPlayersModal
      isOpen
      onClose={() => {}}
      teamName="Squad"
      // "gone" went inactive: the pool no longer lists them.
      currentPlayerIds={["a", "gone"]}
      captainId="a"
      viceCaptainId="gone"
      allPlayers={pool}
      unavailablePlayers={[{ id: "gone", name: "Gone Player", team: "B" }]}
      requiredCount={2}
      slotLimits={{ s1: 2 }}
      contestFormat={CONTEST_FORMAT.SLOT_PURSE}
      purse={100}
      saving={false}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe("EditPlayersModal with an unavailable squad member", () => {
  it("lists the member and blocks Save until they are removed", () => {
    renderSheet();

    expect(screen.getByText("Gone Player")).toBeTruthy();
    expect(
      screen.getByText(
        "Gone Player is no longer available. Remove them to save.",
      ),
    ).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save Changes" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets the user remove them and pick a replacement", () => {
    const onSave = renderSheet();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Gone Player from squad" }),
    );
    expect(screen.queryByText("Gone Player")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add Bravo to squad" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Make Bravo vice-captain" }),
    );
    const save = screen.getByRole("button", { name: "Save Changes" });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);

    expect(onSave).toHaveBeenCalledWith({
      player_ids: ["a", "b"],
      captain_id: "a",
      vice_captain_id: "b",
    });
  });
});
