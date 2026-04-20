import { useState, useEffect } from "react";
import { playersApi, Player, GetPlayersParams } from "@/lib/api/admin/players";
import { slotsApi } from "@/lib/api/admin/slots";

type SlotOption = { id: string; label: string };

export function usePlayersSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [slotMap, setSlotMap] = useState<Record<string, string>>({});
  const [slotOptions, setSlotOptions] = useState<SlotOption[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const pageSize = 10;
  const totalPages = Math.ceil(totalPlayers / pageSize);

  // Fetch players
  const fetchPlayers = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: GetPlayersParams = {
        page,
        page_size: pageSize,
      };

      if (searchQuery) params.search = searchQuery;
      if (statusFilter) params.status = statusFilter;

      const response = await playersApi.getPlayers(params);
      setPlayers(response.players);
      setTotalPlayers(response.total);
    } catch (err: any) {
      console.error("Error fetching players:", err);
      setError(err?.response?.data?.detail || "Failed to load players");
    } finally {
      setLoading(false);
    }
  };

  // Fetch slots
  const fetchSlots = async () => {
    try {
      const response = await slotsApi.getSlots();
      const slotMap: Record<string, string> = {};
      const options: SlotOption[] = [];
      response.slots.forEach((slot) => {
        const label = slot.code || slot.name;
        slotMap[slot.id] = label;
        options.push({ id: slot.id, label });
      });
      setSlotMap(slotMap);
      setSlotOptions(options);
    } catch (err: any) {
      console.error("Error fetching slots:", err);
    }
  };

  // Handle delete
  const handleDelete = async (playerId: string) => {
    if (!confirm("Are you sure you want to delete this player?")) return;

    try {
      await playersApi.deletePlayer(playerId);
      fetchPlayers(); // Refresh list
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to delete player");
    }
  };

  const handleDeleteAllPlayers = async () => {
    const confirmed = confirm(
      "This will permanently delete ALL players and clear player data from teams. Continue?",
    );
    if (!confirmed) return;

    const phrase = window.prompt(
      "Type DELETE_ALL_PLAYERS to confirm:",
      "",
    );
    if (phrase !== "DELETE_ALL_PLAYERS") {
      alert("Cancelled: confirmation phrase did not match.");
      return;
    }

    try {
      setDeletingAll(true);
      const result = await playersApi.deleteAllPlayers(phrase);
      await fetchPlayers();
      alert(
        `${result.message}\nDeleted: ${result.players_deleted}\nTeams cleared: ${result.teams_cleared}`,
      );
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to delete all players");
    } finally {
      setDeletingAll(false);
    }
  };

  // Open/close import modal
  const openImport = () => setShowImport(true);
  const closeImport = () => setShowImport(false);

  const handleImportSuccess = () => {
    closeImport();
    fetchPlayers();
  };

  // Fetch players when filters change
  useEffect(() => {
    fetchPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, statusFilter]);

  // Fetch slots on mount
  useEffect(() => {
    fetchSlots();
  }, []);

  // Resolve any missing slot labels lazily when players list updates
  useEffect(() => {
    const missing = new Set<string>();
    players.forEach((p) => {
      if (p.slot && !slotMap[p.slot]) missing.add(p.slot);
    });
    if (missing.size === 0) return;

    (async () => {
      const updates: Record<string, string> = {};
      for (const id of Array.from(missing)) {
        try {
          const s = await slotsApi.getSlot(id);
          updates[id] = s.code || s.name;
        } catch {
          // ignore individual failures
        }
      }
      if (Object.keys(updates).length > 0) {
        setSlotMap((prev) => ({ ...prev, ...updates }));
      }
    })();
  }, [players, slotMap]);

  return {
    // State
    searchQuery,
    statusFilter,
    players,
    loading,
    error,
    page,
    totalPlayers,
    pageSize,
    totalPages,
    slotMap,
    slotOptions,
    showImport,
    deletingAll,

    // Actions
    setSearchQuery,
    setStatusFilter,
    setPage,
    handleDelete,
    handleDeleteAllPlayers,
    openImport,
    closeImport,
    handleImportSuccess,
    // Refresh
    refresh: fetchPlayers,
  };
}
