"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Search,
  Download,
  Plus,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { playersApi, Player, GetPlayersParams } from "@/lib/api/admin/players";
import { slotsApi } from "@/lib/api/admin/slots";

export function PlayersSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const pageSize = 10;
  const [slotMap, setSlotMap] = useState<Record<string, string>>({});

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
      if (roleFilter) params.role = roleFilter;
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

  // Fetch slots on mount
  const fetchSlots = async () => {
    try {
      const response = await slotsApi.getSlots();
      const slotMap: Record<string, string> = {};
      response.slots.forEach((slot) => {
        slotMap[slot.id] = slot.code || slot.name;
      });
      setSlotMap(slotMap);
    } catch (err: any) {
      console.error("Error fetching slots:", err);
    }
  };

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchPlayers();
  }, [page, searchQuery, roleFilter, statusFilter]);

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

  const totalPages = Math.ceil(totalPlayers / pageSize);

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto flex-wrap">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              >
                <option value="">All Roles</option>
                <option value="Batsman">Batsman</option>
                <option value="Bowler">Bowler</option>
                <option value="All-Rounder">All-Rounder</option>
                <option value="Wicket-Keeper">Wicket-Keeper</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              >
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Injured">Injured</option>
              </select>
              <Button variant="ghost" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Player
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Players Table */}
      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-600">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No players found. Click "Add Player" to get started.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Slot
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Points
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {players.map((player) => (
                      <tr key={player.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center text-white font-semibold">
                              {player.name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {player.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {player.team}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {player.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {player.slot ? (slotMap[player.slot] || player.slot) : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {(player.price ?? 0).toFixed(1)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              player.status === "Active"
                                ? "bg-green-100 text-green-800"
                                : player.status === "Injured"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {player.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button className="text-blue-600 hover:text-blue-900">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(player.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {(page - 1) * pageSize + 1} to{" "}
                      {Math.min(page * pageSize, totalPlayers)} of{" "}
                      {totalPlayers} players
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(
                            (p) =>
                              p === 1 ||
                              p === totalPages ||
                              Math.abs(p - page) <= 1
                          )
                          .map((p, idx, arr) => (
                            <>
                              {idx > 0 && arr[idx - 1] !== p - 1 && (
                                <span
                                  key={`ellipsis-${p}`}
                                  className="px-2 text-gray-400"
                                >
                                  ...
                                </span>
                              )}
                              <button
                                key={p}
                                onClick={() => setPage(p)}
                                className={`px-3 py-1 rounded ${
                                  page === p
                                    ? "bg-orange-500 text-white"
                                    : "bg-white text-gray-700 hover:bg-gray-50 border"
                                }`}
                              >
                                {p}
                              </button>
                            </>
                          ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
