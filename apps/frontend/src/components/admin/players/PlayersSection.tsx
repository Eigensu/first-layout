"use client";

import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Search, Plus, Loader2, AlertCircle, Upload, X } from "lucide-react";
import { PlayerImport } from "./import/PlayerImport";
import { PlayerTableRow } from "./PlayerTableRow";
import { Pagination } from "./Pagination";
import { usePlayersSection } from "./usePlayersSection";
import { useState } from "react";
import { PlayerFormModal } from "./PlayerFormModal";
import type { Player } from "@/lib/api/admin/players";

export function PlayersSection() {
  const {
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
    setSearchQuery,
    setStatusFilter,
    setPage,
    handleDelete,
    handleDeleteAllPlayers,
    openImport,
    closeImport,
    handleImportSuccess,
    refresh,
    deletingAll,
  } = usePlayersSection();

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);

  const closeEditModal = () => setEditingPlayer(null);
  const closeAddModal = () => setAddingPlayer(false);

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <label htmlFor="players-search" className="sr-only">
                Search players
              </label>
              <div className="relative flex items-center rounded-xl border border-border-subtle bg-bg-card px-3 py-2 shadow-sm backdrop-blur focus-within:ring-2 focus-within:ring-orange-500">
                <Search className="text-text-muted w-5 h-5" />
                <input
                  id="players-search"
                  type="search"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent outline-none pl-2 pr-8 text-sm text-text-main placeholder:text-text-muted"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 p-1 rounded-md text-text-muted hover:text-text-main hover:bg-bg-elevated"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto flex-wrap">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteAllPlayers}
                disabled={deletingAll}
              >
                {deletingAll ? "Deleting All..." : "Delete All Players"}
              </Button>
              <Button variant="secondary" size="sm" onClick={openImport}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAddingPlayer(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Player
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Players Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
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
            <div className="text-center py-12 text-text-muted">
              No players found. Click &quot;Add Player&quot; to get started.
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
                      <PlayerTableRow
                        key={player.id}
                        player={player}
                        slotMap={slotMap}
                        onDelete={handleDelete}
                        onEditPoints={(p: Player) => setEditingPlayer(p)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalPlayers}
                onPageChange={setPage}
              />
            </>
          )}
        </CardBody>
      </Card>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-border-subtle">
            <div className="p-6">
              <PlayerImport
                onSuccess={handleImportSuccess}
                onClose={closeImport}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Player Modals */}
      {addingPlayer && (
        <PlayerFormModal
          mode="add"
          slotOptions={slotOptions}
          onClose={closeAddModal}
          onSaved={refresh}
        />
      )}

      {editingPlayer && (
        <PlayerFormModal
          mode="edit"
          player={editingPlayer}
          slotOptions={slotOptions}
          onClose={closeEditModal}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
