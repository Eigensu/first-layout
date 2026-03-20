"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Search, Filter, Upload, Plus, Edit, Trash2 } from "lucide-react";
import { useSponsorsSection } from "./useSponsorsSection";

export function SponsorsSection() {
  const {
    searchQuery,
    setSearchQuery,
    loading,
    error,
    isAddOpen,
    setIsAddOpen,
    creating,
    createError,
    form,
    setForm,
    setLogoFile,
    filtered,
    availableFeatured,
    availableNonFeatured,
    priorityTouched,
    setPriorityTouched,
    handleCreate,
    titleCase,
    // edit state
    isEditOpen,
    setIsEditOpen,
    editing,
    editError,
    editForm,
    setEditForm,
    openEdit,
    handleUpdate,
    // delete
    handleDelete,
    deletingId,
    deleteError,
  } = useSponsorsSection();

  // Local delete confirmation modal state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search sponsors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAddOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Sponsor
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Add Sponsor Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Sponsor</h3>
              <button
                onClick={() => {
                  if (!creating) setIsAddOpen(false);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close add sponsor"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreate();
              }}
            >
              <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
                {(createError || deleteError) && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {createError || deleteError}
                  </div>
                )}
                {/* Row: Name */}
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="e.g., TechCorp"
                  />
                </div>
                {/* Row: Website & Logo URL (optional) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Website (optional)
                    </label>
                    <input
                      type="url"
                      value={form.website}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, website: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Logo URL (optional)
                    </label>
                    <input
                      value={form.logo}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, logo: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                {/* Row: Upload Logo */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Upload Logo (image/*)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    rows={3}
                    placeholder="Short description..."
                  />
                </div>
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, featured: e.target.checked }))
                      }
                    />
                    Featured
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, active: e.target.checked }))
                      }
                    />
                    Active
                  </label>
                </div>
                {/* Priority input */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Priority
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.priority}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setForm((f) => ({ ...f, priority: val }));
                      // mark as user-touched so effects don't overwrite
                      if (!priorityTouched) setPriorityTouched(true);
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="e.g., 1"
                    required
                  />
                  <div className="mt-2 text-xs space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-500">
                          Featured priorities
                        </span>
                        {form.featured && (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-orange-100 text-orange-700">
                            current group
                          </span>
                        )}
                      </div>
                      {availableFeatured ? (
                        <div className="flex flex-wrap gap-2">
                          {availableFeatured.gaps
                            .slice(0, 10)
                            .map((n: number) => (
                              <button
                                type="button"
                                key={`feat-gap-${n}`}
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    priority: n,
                                    featured: true,
                                  }));
                                  if (!priorityTouched)
                                    setPriorityTouched(true);
                                }}
                                className={`px-2 py-1 rounded border text-xs ${form.priority === n && form.featured ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                              >
                                {n}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                priority: availableFeatured.next,
                                featured: true,
                              }));
                              if (!priorityTouched) setPriorityTouched(true);
                            }}
                            className={`px-2 py-1 rounded border text-xs ${form.priority === availableFeatured.next && form.featured ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                          >
                            Next: {availableFeatured.next}
                          </button>
                        </div>
                      ) : (
                        <div className="text-gray-400">
                          No suggestions (auth or network issue)
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-500">
                          Non-featured priorities
                        </span>
                        {!form.featured && (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-orange-100 text-orange-700">
                            current group
                          </span>
                        )}
                      </div>
                      {availableNonFeatured ? (
                        <div className="flex flex-wrap gap-2">
                          {availableNonFeatured.gaps
                            .slice(0, 10)
                            .map((n: number) => (
                              <button
                                type="button"
                                key={`non-gap-${n}`}
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    priority: n,
                                    featured: false,
                                  }));
                                  if (!priorityTouched)
                                    setPriorityTouched(true);
                                }}
                                className={`px-2 py-1 rounded border text-xs ${form.priority === n && !form.featured ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                              >
                                {n}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                priority: availableNonFeatured.next,
                                featured: false,
                              }));
                              if (!priorityTouched) setPriorityTouched(true);
                            }}
                            className={`px-2 py-1 rounded border text-xs ${form.priority === availableNonFeatured.next && !form.featured ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                          >
                            Next: {availableNonFeatured.next}
                          </button>
                        </div>
                      ) : (
                        <div className="text-gray-400">
                          No suggestions (auth or network issue)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => !creating && setIsAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={creating}
                  type="submit"
                >
                  {creating ? "Adding..." : "Add Sponsor"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sponsor Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Sponsor</h3>
              <button
                onClick={() => {
                  if (!editing) setIsEditOpen(false);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close edit sponsor"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleUpdate();
              }}
            >
              <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
                {editError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {editError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="Sponsor name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    rows={3}
                    placeholder="Short description..."
                  />
                </div>
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.featured}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          featured: e.target.checked,
                        }))
                      }
                    />
                    Featured
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.active}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, active: e.target.checked }))
                      }
                    />
                    Active
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Priority
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        priority: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="e.g., 1"
                    required
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => !editing && setIsEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={editing}
                  type="submit"
                >
                  {editing ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardBody className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </CardBody>
        </Card>
      )}

      {/* Sponsors Grid split into Featured and Other */}
      <div className="space-y-6">
        {/* Featured section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-base font-semibold">Featured sponsors</h4>
            <span className="text-xs text-gray-500">
              Assign priorities within this group
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Card
                  key={`loading-feat-${i}`}
                  className="bg-white border-gray-200 shadow-sm"
                >
                  <CardBody className="p-6 animate-pulse">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-16 h-16 bg-gray-200 rounded-2xl" />
                      <div className="flex gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded" />
                        <div className="w-8 h-8 bg-gray-200 rounded" />
                      </div>
                    </div>
                    <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                      <div className="h-4 bg-gray-200 rounded w-5/6" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                    </div>
                  </CardBody>
                </Card>
              ))}
            {!loading &&
              filtered
                .filter((s) => s.featured)
                .sort(
                  (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
                )
                .map((sponsor) => (
                  <Card
                    key={sponsor.id}
                    hover
                    className="bg-white border-gray-200 shadow-sm"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg overflow-hidden">
                          {sponsor.logo?.startsWith("http") ||
                          sponsor.logo?.startsWith("/api") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={sponsor.logo}
                              alt={`${sponsor.name} logo`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            sponsor.name?.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label={`Edit ${sponsor.name}`}
                            onClick={() => openEdit(sponsor)}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Delete ${sponsor.name}`}
                            disabled={deletingId === sponsor.id}
                            onClick={() => {
                              setToDelete({
                                id: sponsor.id,
                                name: sponsor.name,
                              });
                              setIsDeleteOpen(true);
                            }}
                          >
                            {deletingId === sponsor.id ? (
                              <span className="text-xs">Deleting...</span>
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {sponsor.name}
                      </h3>
                      {sponsor.website && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Website:
                          </span>
                          <a
                            href={sponsor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline truncate max-w-[60%] text-right"
                          >
                            {sponsor.website}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Status:</span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${sponsor.active ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                        >
                          {sponsor.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Priority:</span>
                        <span className="text-sm font-medium text-gray-800">
                          {typeof sponsor.priority === "number" &&
                          sponsor.priority > 0
                            ? sponsor.priority
                            : "—"}
                        </span>
                      </div>
                      {typeof sponsor.featured !== "undefined" && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Featured:
                          </span>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${sponsor.featured ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}
                          >
                            {sponsor.featured ? "Yes" : "No"}
                          </span>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
          </div>
          {!loading &&
            !error &&
            filtered.filter((s) => s.featured).length === 0 && (
              <div className="text-sm text-gray-500">No featured sponsors.</div>
            )}
        </div>

        {/* Other (non-featured) section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-base font-semibold">Other sponsors</h4>
            <span className="text-xs text-gray-500">
              Assign priorities within this group
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Card
                  key={`loading-non-${i}`}
                  className="bg-white border-gray-200 shadow-sm"
                >
                  <CardBody className="p-6 animate-pulse">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-16 h-16 bg-gray-200 rounded-2xl" />
                      <div className="flex gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded" />
                        <div className="w-8 h-8 bg-gray-200 rounded" />
                      </div>
                    </div>
                    <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                      <div className="h-4 bg-gray-200 rounded w-5/6" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                    </div>
                  </CardBody>
                </Card>
              ))}
            {!loading &&
              filtered
                .filter((s) => !s.featured)
                .sort(
                  (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity),
                )
                .map((sponsor) => (
                  <Card
                    key={sponsor.id}
                    hover
                    className="bg-white border-gray-200 shadow-sm"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg overflow-hidden">
                          {sponsor.logo?.startsWith("http") ||
                          sponsor.logo?.startsWith("/api") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={sponsor.logo}
                              alt={`${sponsor.name} logo`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            sponsor.name?.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label={`Edit ${sponsor.name}`}
                            onClick={() => openEdit(sponsor)}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Delete ${sponsor.name}`}
                            disabled={deletingId === sponsor.id}
                            onClick={() => {
                              setToDelete({
                                id: sponsor.id,
                                name: sponsor.name,
                              });
                              setIsDeleteOpen(true);
                            }}
                          >
                            {deletingId === sponsor.id ? (
                              <span className="text-xs">Deleting...</span>
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {sponsor.name}
                      </h3>
                      {sponsor.website && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Website:
                          </span>
                          <a
                            href={sponsor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline truncate max-w-[60%] text-right"
                          >
                            {sponsor.website}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Status:</span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${sponsor.active ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
                        >
                          {sponsor.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Priority:</span>
                        <span className="text-sm font-medium text-gray-800">
                          {typeof sponsor.priority === "number" &&
                          sponsor.priority > 0
                            ? sponsor.priority
                            : "—"}
                        </span>
                      </div>
                      {typeof sponsor.featured !== "undefined" && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Featured:
                          </span>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${sponsor.featured ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}
                          >
                            {sponsor.featured ? "Yes" : "No"}
                          </span>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
          </div>
          {!loading &&
            !error &&
            filtered.filter((s) => !s.featured).length === 0 && (
              <div className="text-sm text-gray-500">No other sponsors.</div>
            )}
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {isDeleteOpen && toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Delete Sponsor</h3>
              <button
                onClick={() => {
                  if (deletingId !== toDelete.id) setIsDeleteOpen(false);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close delete modal"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {deleteError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {deleteError}
                </div>
              )}
              <p className="text-sm text-gray-700">
                Are you sure you want to permanently delete{" "}
                <span className="font-medium">{toDelete.name}</span>? This
                action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  deletingId !== toDelete.id && setIsDeleteOpen(false)
                }
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={deletingId === toDelete.id}
                onClick={() => {
                  if (!toDelete) return;
                  void (async () => {
                    await handleDelete(toDelete.id);
                    // Close only if deletion finished and no error
                    if (!deleteError) setIsDeleteOpen(false);
                  })();
                }}
                className="!border-red-500 !text-red-600 hover:!bg-red-50"
              >
                {deletingId === toDelete.id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
