import { useEffect, useMemo, useState, useCallback } from "react";
import type { Player } from "@/components";
import { fetchSlots, type ApiSlot } from "@/lib/api/public/slots";
import {
  fetchPlayersBySlot,
  fetchAllPlayers,
  fetchHotPlayerIds,
  type ApiPlayer,
} from "@/lib/api/public/players";
import { publicContestsApi, type Contest } from "@/lib/api/public/contests";
import { CONTEST_FORMAT } from "@/common/consts/contest";
import { formatPoints } from "@/utils/playerValue";

export type UIBuildPlayer = Player & { slotId: string };

/** Why a player cannot be added to the current squad, or null if they can. */
export type SelectionBlock = string | null;

export function useTeamBuilder(
  contestId?: string,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const [players, setPlayers] = useState<UIBuildPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string>("");
  const [viceCaptainId, setViceCaptainId] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(1);

  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string>("");
  const [isStep1Collapsed, setIsStep1Collapsed] = useState(false);
  const [contest, setContest] = useState<Contest | null>(null);

  const isAuction = contest?.contest_format === CONTEST_FORMAT.AUCTION_PURSE;

  // Limits per slot from backend
  const SLOT_LIMITS = useMemo(() => {
    const map: Record<string, number> = {};
    slots.forEach((s) => {
      map[s.id] = s.max_select ?? 4;
    });
    return map;
  }, [slots]);

  // Squad size: fixed by the contest in an auction, summed from slots otherwise.
  const TOTAL_MAX = useMemo(() => {
    if (isAuction) return contest?.squad_size ?? 0;
    return slots.reduce((sum, s) => sum + (s.max_select ?? 0), 0);
  }, [isAuction, contest, slots]);

  // Fetch slots and players by slot (on mount and when contestId changes)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        // Clear the previous contest's squad before loading the new one: if
        // this load fails, the catch below must not leave a stale contest,
        // pool, or selection in place — those player IDs belong to the old
        // contest and must not be submittable against this one.
        if (!cancelled) {
          setContest(null);
          setPlayers([]);
          setSelectedPlayers([]);
          setCaptainId("");
          setViceCaptainId("");
          setCurrentStep(1);
          setSlots([]);
          setActiveSlotId("");
        }

        // The contest decides how the pool is shaped, so it has to load first.
        // A failure here must not fall through to the slot-based path: an
        // auction contest would then render with the wrong pool and no
        // purse/per-team validation until submission is rejected.
        let loadedContest: Contest | null = null;
        if (contestId) {
          loadedContest = await publicContestsApi.get(contestId);
        }
        if (!cancelled) setContest(loadedContest);

        if (loadedContest?.contest_format === CONTEST_FORMAT.AUCTION_PURSE) {
          // One open pool, already narrowed to auctioned players by the API.
          const pool = await fetchAllPlayers(contestId);
          const mappedPool: UIBuildPlayer[] = pool.map((p) => ({
            id: String(p.id),
            name: p.name,
            team: p.team || "",
            role: "",
            price: Number(p.price) || 0,
            points: Number(p.points || 0),
            image: p.image_url || undefined,
            slotId: "",
            stats: { matches: 0 },
          }));
          let auctionHotIds: Set<string> = new Set();
          try {
            const hot = await fetchHotPlayerIds({ contest_id: contestId });
            auctionHotIds = new Set(hot.player_ids);
          } catch (_) {
            // ignore hot ids failure; UI can work without it
          }
          if (!cancelled) {
            setSlots([]);
            setActiveSlotId("");
            setPlayers(
              mappedPool.map((p) => ({ ...p, isHot: auctionHotIds.has(p.id) })),
            );
          }
          return;
        }

        const slotsList = await fetchSlots();
        // Sort slots numerically by number embedded in name or code (fallback to name)
        const numFrom = (s: { name: string; code: string }) => {
          const nameNum = Number(s.name.match(/\d+/)?.[0] ?? NaN);
          if (!Number.isNaN(nameNum)) return nameNum;
          const codeNum = Number(s.code.match(/\d+/)?.[0] ?? NaN);
          if (!Number.isNaN(codeNum)) return codeNum;
          return Number.MAX_SAFE_INTEGER;
        };
        const sortedSlots = [...slotsList].sort((a, b) => {
          const an = numFrom(a);
          const bn = numFrom(b);
          if (an !== bn) return an - bn;
          return a.name.localeCompare(b.name);
        });
        if (!cancelled) {
          setSlots(sortedSlots);
          setActiveSlotId(sortedSlots[0]?.id || "");
        }

        // Build a local map for slot names to avoid depending on external state
        const slotNameById: Record<string, string> = Object.fromEntries(
          sortedSlots.map((s) => [s.id, s.name])
        );

        const playerArrays = await Promise.all(
          sortedSlots.map(async (s) => {
            try {
              const arr: ApiPlayer[] = await fetchPlayersBySlot(
                s.id,
                contestId
              );
              return arr.map((p) => ({ ...p, slot: p.slot || s.id }));
            } catch {
              return [] as ApiPlayer[];
            }
          })
        );
        const flatPlayers: ApiPlayer[] = playerArrays.flat();
        const mappedBase: UIBuildPlayer[] = flatPlayers.map((p) => ({
          id: String(p.id),
          name: p.name,
          team: p.team || "",
          role: slotNameById[String(p.slot || "")] || "Slot",
          price: Number(p.price) || 0,
          points: Number(p.points || 0),
          image: p.image_url || undefined,
          slotId: String(p.slot || ""),
          stats: { matches: 0 },
        }));
        // Fetch hot player IDs (contest-aware)
        let hotIdsSet: Set<string> = new Set();
        try {
          const hot = await fetchHotPlayerIds({ contest_id: contestId });
          hotIdsSet = new Set(hot.player_ids);
        } catch (_) {
          // ignore hot ids failure; UI can work without it
        }
        const mapped: UIBuildPlayer[] = mappedBase.map((p) => ({
          ...p,
          // wire through to Player.isHot (extends Player in components types)
          isHot: hotIdsSet.has(p.id),
        }));
        if (!cancelled) setPlayers(mapped);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, enabled]);

  const selectedCountBySlot = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedPlayers.forEach((id) => {
      const p = players.find((mp) => mp.id === id);
      if (!p) return;
      const sid = p.slotId;
      counts[sid] = (counts[sid] || 0) + 1;
    });
    return counts;
  }, [selectedPlayers, players]);

  const selectedPlayerObjects = useMemo(
    () =>
      selectedPlayers
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is UIBuildPlayer => Boolean(p)),
    [selectedPlayers, players],
  );

  // --- auction purse state -------------------------------------------------

  const purse = contest?.purse ?? 0;

  const spent = useMemo(
    () => selectedPlayerObjects.reduce((sum, p) => sum + (p.price || 0), 0),
    [selectedPlayerObjects],
  );

  const remainingPurse = purse - spent;

  const selectedCountByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedPlayerObjects.forEach((p) => {
      if (!p.team) return;
      counts[p.team] = (counts[p.team] || 0) + 1;
    });
    return counts;
  }, [selectedPlayerObjects]);

  const maxPerTeam = contest?.effective_max_players_per_team ?? 0;

  /**
   * Why an unselected player cannot be added to `selectedIds`, or null if they
   * can be.
   *
   * Mirrors the server's auction rules so the UI can disable a card and say
   * why, rather than letting the submit fail. Takes the selection explicitly
   * so a state updater can pass its own `prev` — reading component state here
   * would go stale when React batches two selections into one render.
   */
  const blockForSelection = useCallback(
    (
      selectedIds: string[],
      player: { id: string; name?: string; team: string; price: number },
    ): SelectionBlock => {
      if (!isAuction) return null;
      if (selectedIds.includes(player.id)) return null;
      if (TOTAL_MAX > 0 && selectedIds.length >= TOTAL_MAX) {
        return `Your squad is full at ${TOTAL_MAX} players.`;
      }

      const chosen = selectedIds
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is UIBuildPlayer => Boolean(p));

      if (maxPerTeam > 0) {
        const fromSameTeam = chosen.filter((p) => p.team === player.team).length;
        if (fromSameTeam >= maxPerTeam) {
          return `You already have ${maxPerTeam} player${
            maxPerTeam === 1 ? "" : "s"
          } from ${player.team}.`;
        }
      }

      const left = purse - chosen.reduce((sum, p) => sum + (p.price || 0), 0);
      if ((player.price || 0) > left) {
        return `${player.name ?? "This player"} costs ${formatPoints(
          player.price,
        )} but you have ${formatPoints(left)} left.`;
      }
      return null;
    },
    [isAuction, players, TOTAL_MAX, maxPerTeam, purse],
  );

  /** Block reason against the current selection, for rendering. */
  const getSelectionBlock = useCallback(
    (player: { id: string; name?: string; team: string; price: number }) =>
      blockForSelection(selectedPlayers, player),
    [blockForSelection, selectedPlayers],
  );

  const canSubmitAuctionSquad =
    isAuction &&
    TOTAL_MAX > 0 &&
    selectedPlayers.length === TOTAL_MAX &&
    remainingPurse >= 0;

  const canNextForActiveSlot = useMemo(() => {
    const s = slots.find((sl) => sl.id === activeSlotId);
    const minRequired = s?.min_select ?? 4;
    return (selectedCountBySlot[activeSlotId] || 0) >= minRequired;
  }, [selectedCountBySlot, activeSlotId, slots]);

  const goToNextSlot = useCallback(() => {
    const idx = slots.findIndex((s) => s.id === activeSlotId);
    const next = slots[Math.min(idx + 1, Math.max(slots.length - 1, 0))];
    if (next) setActiveSlotId(next.id);
  }, [slots, activeSlotId]);

  const goToPrevSlot = useCallback(() => {
    const idx = slots.findIndex((s) => s.id === activeSlotId);
    const prev = slots[Math.max(idx - 1, 0)];
    if (prev) setActiveSlotId(prev.id);
  }, [slots, activeSlotId]);

  const isFirstSlot = useMemo(
    () => slots.findIndex((s) => s.id === activeSlotId) === 0,
    [activeSlotId, slots]
  );

  const handleClearAll = useCallback(() => {
    setSelectedPlayers([]);
    setCaptainId("");
    setViceCaptainId("");
    setCurrentStep(1);
    if (slots[0]) setActiveSlotId(slots[0].id);
    setIsStep1Collapsed(false);
  }, [slots]);

  const handlePlayerSelect = useCallback(
    (playerId: string) => {
      setSelectedPlayers((prev) => {
        if (prev.includes(playerId)) {
          return prev.filter((id) => id !== playerId);
        }
        // Enforce total squad size (slot totals, or the contest's squad_size)
        if (TOTAL_MAX > 0 && prev.length >= TOTAL_MAX) {
          return prev;
        }
        const player = players.find((p) => p.id === playerId);
        if (!player) return prev;

        if (isAuction) {
          // Purse and the per-real-team cap stand in for slot limits here.
          // Checked against `prev`, not render state, so batched clicks cannot
          // slip an extra player past the budget.
          if (blockForSelection(prev, player)) return prev;
          return [...prev, playerId];
        }

        const currentSlotCount = prev.filter((id) => {
          const p = players.find((mp) => mp.id === id);
          return (p as any)?.slotId === player.slotId;
        }).length;
        const slotLimit = SLOT_LIMITS[player.slotId] || 4;
        if (currentSlotCount >= slotLimit) {
          return prev;
        }
        return [...prev, playerId];
      });
    },
    [players, SLOT_LIMITS, TOTAL_MAX, isAuction, blockForSelection]
  );

  const handleSetCaptain = useCallback((playerId: string) => {
    setCaptainId(playerId);
    setViceCaptainId((vc) => (vc === playerId ? "" : vc));
  }, []);

  const handleSetViceCaptain = useCallback((playerId: string) => {
    setViceCaptainId(playerId);
    setCaptainId((c) => (c === playerId ? "" : c));
  }, []);

  return {
    // data
    slots,
    players,
    loading,
    error,
    contest,
    isAuction,

    // selection state
    selectedPlayers,
    captainId,
    viceCaptainId,
    currentStep,
    activeSlotId,
    isStep1Collapsed,

    // derived
    SLOT_LIMITS,
    selectedCountBySlot,
    canNextForActiveSlot,
    isFirstSlot,
    TOTAL_MAX,

    // auction purse
    purse,
    spent,
    remainingPurse,
    selectedCountByTeam,
    maxPerTeam,
    getSelectionBlock,
    canSubmitAuctionSquad,

    // setters/handlers
    setSelectedPlayers,
    setCaptainId,
    setViceCaptainId,
    setCurrentStep,
    setIsStep1Collapsed,
    setActiveSlotId,
    handleClearAll,
    handlePlayerSelect,
    handleSetCaptain,
    handleSetViceCaptain,
    goToNextSlot,
    goToPrevSlot,
  };
}
