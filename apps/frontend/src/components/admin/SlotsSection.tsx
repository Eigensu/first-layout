"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { slotsApi, type Slot, type PlayerSummary } from "@/lib/api/admin/slots";
import { playersApi } from "@/lib/api/admin/players";
import { Search, Filter, Plus, Users, Trash2, X } from "lucide-react";

export function SlotsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    min_select: 4,
    max_select: 4,
  });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    min_select: 4,
    max_select: 4,
  });

  // Manage modal state
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [assignedPlayers, setAssignedPlayers] = useState<PlayerSummary[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerSummary[]>([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [assignedSearch, setAssignedSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");
  const [selectedAssigned, setSelectedAssigned] = useState<
    Record<string, boolean>
  >({});
  const [selectedAvailable, setSelectedAvailable] = useState<
    Record<string, boolean>
  >({});

  const fetchSlots = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await slotsApi.getSlots({ search: searchQuery });
      setSlots(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch slots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const resetForm = () => {
    setForm({ code: "", name: "", min_select: 4, max_select: 4 });
  };

  const handleOpenCreate = () => {
    resetForm();
    setCreateModalOpen(true);
  };

  const handleCreateSlot = async () => {
    setCreating(true);
    setError(null);
    try {
      await slotsApi.createSlot({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        min_select: form.min_select,
        max_select: form.max_select,
      });
      setCreateModalOpen(false);
      resetForm();
      await fetchSlots();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Failed to create slot");
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (slot: Slot) => {
    setSlotToDelete(slot);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!slotToDelete) return;

    setDeleting(true);
    try {
      const force = slotToDelete.player_count > 0;
      await slotsApi.deleteSlot(slotToDelete.id, force);
      await fetchSlots();
      setDeleteModalOpen(false);
      setSlotToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete slot");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setSlotToDelete(null);
  };

  // Edit modal handlers
  const openEdit = (slot: Slot) => {
    setEditSlot(slot);
    setEditForm({
      name: slot.name,
      min_select: slot.min_select,
      max_select: slot.max_select,
    });
    setEditModalOpen(true);
  };

  const handleUpdateSlot = async () => {
    if (!editSlot) return;
    setEditing(true);
    setError(null);
    try {
      await slotsApi.updateSlot(editSlot.id, {
        name: editForm.name.trim(),
        min_select: editForm.min_select,
        max_select: editForm.max_select,
      });
      setEditModalOpen(false);
      setEditSlot(null);
      await fetchSlots();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Failed to update slot");
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setEditing(false);
    }
  };

  // Manage modal handlers
  const openManage = async (slot: Slot) => {
    setSelectedSlot(slot);
    setManageOpen(true);
    setSelectedAssigned({});
    setSelectedAvailable({});
    setAssignedSearch("");
    setAvailableSearch("");
    await Promise.all([fetchAssigned(slot.id), fetchAvailable("")]);
  };

  const closeManage = async (refresh = false) => {
    setManageOpen(false);
    setSelectedSlot(null);
    setAssignedPlayers([]);
    setAvailablePlayers([]);
    if (refresh) {
      await fetchSlots();
    }
  };

  const fetchAssigned = async (slotId: string) => {
    setLoadingAssigned(true);
    try {
      const res = await slotsApi.getSlotPlayers(slotId, {
        page: 1,
        page_size: 100,
        search: assignedSearch,
      });
      setAssignedPlayers(res.players);
    } catch (e) {
      // surface error in banner
      setError("Failed to load assigned players");
    } finally {
      setLoadingAssigned(false);
    }
  };

  const fetchAvailable = async (search: string) => {
    setLoadingAvailable(true);
    try {
      const res = await playersApi.getPlayers({
        page: 1,
        page_size: 100,
        search,
      });
      // Map to PlayerSummary and filter out players already assigned to the selected slot
      const mapped: PlayerSummary[] = res.players
        .filter((p) => !selectedSlot || p.slot !== selectedSlot.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          role: p.role,
          points: p.points,
          status: p.status,
          price: p.price,
          slot: p.slot ?? null,
          image_url: p.image_url,
          stats: p.stats,
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
      setAvailablePlayers(mapped);
    } catch (e) {
      setError("Failed to load available players");
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedSlot) return;
    setAssigning(true);
    try {
      const ids = Object.keys(selectedAvailable).filter(
        (id) => selectedAvailable[id]
      );
      if (ids.length === 0) return;
      await slotsApi.assignPlayers(selectedSlot.id, { player_ids: ids });
      await Promise.all([
        fetchAssigned(selectedSlot.id),
        fetchAvailable(availableSearch),
        fetchSlots(),
      ]);
      setSelectedAvailable({});
    } catch (e) {
      setError("Failed to assign players");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    if (!selectedSlot) return;
    setUnassigning(true);
    try {
      const ids = Object.keys(selectedAssigned).filter(
        (id) => selectedAssigned[id]
      );
      if (ids.length === 0) return;
      await slotsApi.bulkUnassignPlayers(selectedSlot.id, { player_ids: ids });
      await Promise.all([
        fetchAssigned(selectedSlot.id),
        fetchAvailable(availableSearch),
        fetchSlots(),
      ]);
      setSelectedAssigned({});
    } catch (e) {
      setError("Failed to unassign players");
    } finally {
      setUnassigning(false);
    }
  };

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
                  placeholder="Search slots by code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="ghost" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Slot
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Error Message */}
      {error && (
        <Card>
          <CardBody className="p-4 bg-red-50">
            <p className="text-red-600 text-sm">{error}</p>
          </CardBody>
        </Card>
      )}

      {/* Edit Slot Modal */}
      {editModalOpen && editSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardBody className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Edit Slot
                  </h3>
                  <p className="text-sm text-gray-500">Code: {editSlot.code}</p>
                </div>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                {/* Category removed from edit form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Min select
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.min_select}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          min_select: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Max select
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.max_select}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          max_select: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditModalOpen(false)}
                  disabled={editing}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleUpdateSlot}
                  disabled={
                    editing || editForm.min_select > editForm.max_select
                  }
                >
                  {editing ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <Card>
          <CardBody className="p-8 text-center">
            <p className="text-gray-500">Loading slots...</p>
          </CardBody>
        </Card>
      ) : (
        /* Slots Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slots
            .filter(
              (slot) =>
                slot.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                slot.name?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((slot) => (
              <Card key={slot.id} hover>
                <CardBody className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg">
                      {slot.code}
                    </div>
                    <button
                      onClick={() => handleDeleteClick(slot)}
                      className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {slot.name}
                  </h3>
                  {/* Category removed from UI */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>{slot.player_count} Players</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>
                        Min select:{" "}
                        <span className="font-medium">{slot.min_select}</span>
                      </span>
                      <span>
                        Max select:{" "}
                        <span className="font-medium">{slot.max_select}</span>
                      </span>
                    </div>
                    <div className="pt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openManage(slot)}
                      >
                        Manage Players
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(slot)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && slots.length === 0 && (
        <Card>
          <CardBody className="p-8 text-center">
            <p className="text-gray-500 mb-4">No slots available</p>
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Slot
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && slotToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Delete Slot {slotToDelete.name}
                </h3>
                <button
                  onClick={handleDeleteCancel}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this slot? This will unassign{" "}
                <span className="font-semibold">
                  {slotToDelete.player_count} player
                  {slotToDelete.player_count !== 1 ? "s" : ""}
                </span>{" "}
                from this slot.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDeleteCancel}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Create Slot Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardBody className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Create Slot
                </h3>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Code
                  </label>
                  <input
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value }))
                    }
                    placeholder="E.g., BATTERS"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="E.g., Batters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                {/* Category removed from create form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Min select
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.min_select}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_select: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Max select
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.max_select}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          max_select: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleCreateSlot}
                  disabled={
                    creating ||
                    !form.code ||
                    !form.name ||
                    form.min_select > form.max_select
                  }
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Manage Slot Modal */}
      {manageOpen && selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl">
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Manage Players
                  </h3>
                  <p className="text-sm text-gray-500">
                    Slot:{" "}
                    <span className="font-medium">{selectedSlot.name}</span> (
                    {selectedSlot.code})
                  </p>
                </div>
                <button
                  onClick={() => closeManage(true)}
                  className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Assigned Players */}
                <div className="border rounded-md">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h4 className="font-medium">Assigned Players</h4>
                    <div className="text-sm text-gray-500">
                      {assignedPlayers.length}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        value={assignedSearch}
                        onChange={async (e) => {
                          setAssignedSearch(e.target.value);
                          await fetchAssigned(selectedSlot.id);
                        }}
                        placeholder="Search assigned players"
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {loadingAssigned ? (
                        <p className="text-sm text-gray-500 p-2">Loading...</p>
                      ) : (
                        assignedPlayers.map((p) => (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!!selectedAssigned[p.id]}
                              onChange={(e) =>
                                setSelectedAssigned((s) => ({
                                  ...s,
                                  [p.id]: e.target.checked,
                                }))
                              }
                            />
                            <span className="text-sm text-gray-700">
                              {p.name}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              {p.team} • {p.role}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    <div className="pt-3">
                      <Button
                        variant="outline"
                        onClick={handleUnassign}
                        disabled={unassigning}
                      >
                        {unassigning ? "Unassigning..." : "Unassign Selected"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Available Players */}
                <div className="border rounded-md">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h4 className="font-medium">Available Players</h4>
                    <div className="text-sm text-gray-500">
                      {availablePlayers.length}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        value={availableSearch}
                        onChange={async (e) => {
                          const v = e.target.value;
                          setAvailableSearch(v);
                          await fetchAvailable(v);
                        }}
                        placeholder="Search players to assign"
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {loadingAvailable ? (
                        <p className="text-sm text-gray-500 p-2">Loading...</p>
                      ) : (
                        availablePlayers.map((p) => (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!!selectedAvailable[p.id]}
                              onChange={(e) =>
                                setSelectedAvailable((s) => ({
                                  ...s,
                                  [p.id]: e.target.checked,
                                }))
                              }
                            />
                            <span className="text-sm text-gray-700">
                              {p.name}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              {p.team} • {p.role}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    <div className="pt-3">
                      <Button
                        variant="primary"
                        onClick={handleAssign}
                        disabled={assigning}
                      >
                        {assigning ? "Assigning..." : "Assign Selected"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
