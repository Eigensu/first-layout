"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  adminContestsApi,
  Contest,
  ContestCreate,
  ContestType,
  ContestVisibility,
  ContestStatus,
} from "@/lib/api/admin/contests";
import { API_BASE_URL } from "@/common/consts";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function AdminContestsPage() {
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ContestCreate>({
    code: "",
    name: "",
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    visibility: "public",
    points_scope: "time_window",
    status: "live",
    contest_type: "full",
    allowed_teams: [],
  });
  const [creating, setCreating] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [selectedAllowedTeams, setSelectedAllowedTeams] = useState<string[]>(
    []
  );
  const [allowedDropdownOpen, setAllowedDropdownOpen] =
    useState<boolean>(false);

  // IST inputs for start/end (date + free time HH:MM 24h)
  const [startDate, setStartDate] = useState(""); // yyyy-MM-dd
  const [startTime, setStartTime] = useState(""); // HH:MM (24h)
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState(""); // HH:MM (24h)

  // Alert dialog
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState<string | undefined>(undefined);
  const [alertMessage, setAlertMessage] = useState("");
  const showAlert = (message: string, title?: string) => {
    setAlertMessage(message);
    setAlertTitle(title);
    setAlertOpen(true);
  };

  // Delete dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForceDeleteDialog, setShowForceDeleteDialog] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminContestsApi.list({ page_size: 100 });
      setContests(res.contests);
    } catch (e: any) {
      setError(e?.message || "Failed to load contests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Load available real-world teams from players once
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/players?limit=1000`);
        if (!res.ok) return;
        const data: Array<{ team?: string | null }> = await res.json();
        const uniq = Array.from(
          new Set(
            data.map((p) => (p.team || "").trim()).filter((t) => t.length > 0)
          )
        ).sort();
        setAvailableTeams(uniq);
      } catch {
        // ignore silently
      }
    })();
  }, []);

  // Seed IST defaults for create form (now and +1 day) using 24-hour HH:MM
  useEffect(() => {
    const seedISTDefaults = () => {
      const now = new Date();
      const utcNow = now.getTime() + now.getTimezoneOffset() * 60000;
      const istNow = new Date(utcNow + (5 * 60 + 30) * 60000);
      const istEnd = new Date(istNow.getTime() + 24 * 3600 * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const toParts = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh24 = pad(d.getHours());
        const mi = pad(d.getMinutes());
        return { date: `${yyyy}-${mm}-${dd}`, time: `${hh24}:${mi}` };
      };
      const s = toParts(istNow);
      const e = toParts(istEnd);
      setStartDate(s.date);
      setStartTime(s.time);
      setEndDate(e.date);
      setEndTime(e.time);
    };
    seedISTDefaults();
  }, []);

  const create = async () => {
    try {
      setCreating(true);
      if (!form.code.trim() || !form.name.trim()) {
        showAlert("Code and Name are required", "Validation");
        return;
      }
      // Validate schedule inputs
      if (!startDate || !startTime || !endDate || !endTime) {
        showAlert("Start and End date/time are required", "Validation");
        return;
      }
      const formToNaiveIso = (dateStr: string, hhmm24: string) => {
        const [yyyy, mm, dd] = dateStr.split("-").map(Number);
        const [hhStr, miStr] = hhmm24.split(":");
        const hh = Number(hhStr);
        const mi = Number(miStr);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(yyyy)}-${pad(mm)}-${pad(dd)}T${pad(hh)}:${pad(mi)}:00`;
      };
      const startIso = formToNaiveIso(startDate, startTime);
      const endIso = formToNaiveIso(endDate, endTime);
      if (startIso >= endIso) {
        showAlert("Start must be before End", "Validation");
        return;
      }
      const payload: ContestCreate = {
        ...form,
        start_at: startIso,
        end_at: endIso,
        // Only send allowed_teams for daily contests; clear otherwise
        allowed_teams:
          form.contest_type === "daily" ? selectedAllowedTeams : [],
      };
      await adminContestsApi.create(payload);
      setForm({ ...form, code: "", name: "" });
      // Reset only code/name; keep IST inputs seeded
      setSelectedAllowedTeams([]);
      await load();
    } catch (e: any) {
      showAlert(e?.message || "Failed to create contest", "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setDeleting(true);
      await adminContestsApi.delete(deleteTargetId);
      setShowDeleteDialog(false);
      setDeleteTargetId(null);
      await load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail as string | undefined;
      // If active enrollments, ask for force delete
      if (detail && detail.includes("active enrollments")) {
        setShowDeleteDialog(false);
        setShowForceDeleteDialog(true);
        return;
      }
      showAlert(e?.message || "Failed to delete", "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const confirmForceDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setDeleting(true);
      await adminContestsApi.delete(deleteTargetId, true);
      setShowForceDeleteDialog(false);
      setDeleteTargetId(null);
      await load();
    } catch (e: any) {
      showAlert(e?.message || "Failed to force delete", "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-5xl mx-auto p-4 space-y-4 text-text-main">
        <AlertDialog
          open={alertOpen}
          title={alertTitle}
          message={alertMessage}
          onClose={() => setAlertOpen(false)}
        />
        <ConfirmDialog
          open={showDeleteDialog}
          title="Delete this contest?"
          description="This action cannot be undone."
          cancelText="Cancel"
          confirmText={deleting ? "Deleting..." : "Delete"}
          destructive
          loading={deleting}
          onCancel={() => {
            if (!deleting) {
              setShowDeleteDialog(false);
              setDeleteTargetId(null);
            }
          }}
          onConfirm={confirmDelete}
        />
        <ConfirmDialog
          open={showForceDeleteDialog}
          title="Force delete contest?"
          description="Active enrollments were found. This will permanently remove the contest and its enrollments."
          cancelText="Cancel"
          confirmText={deleting ? "Deleting..." : "Force Delete"}
          destructive
          loading={deleting}
          onCancel={() => {
            if (!deleting) {
              setShowForceDeleteDialog(false);
            }
          }}
          onConfirm={confirmForceDelete}
        />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-main">
            Admin · Contests
          </h1>
          <Link
            href="/admin"
            className="px-3 py-1 rounded border border-border-subtle text-text-main hover:bg-bg-elevated"
          >
            Back
          </Link>
        </div>

        <Card className="bg-bg-card border border-border-subtle text-text-main shadow-pink-soft">
          <CardBody className="p-4">
            <h2 className="text-lg font-medium mb-2 text-text-main">
              Create Contest
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-text-muted">Code</label>
                <input
                  className="w-full border border-border-subtle bg-bg-card text-text-main placeholder:text-text-muted p-2 rounded"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted">Name</label>
                <input
                  className="w-full border border-border-subtle bg-bg-card text-text-main placeholder:text-text-muted p-2 rounded"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted">
                  Start (IST)
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="border border-border-subtle bg-bg-card text-text-main p-2 rounded"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <input
                    type="time"
                    step={60}
                    className="border border-border-subtle bg-bg-card text-text-main p-2 rounded w-28"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-muted">
                  End (IST)
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="border border-border-subtle bg-bg-card text-text-main p-2 rounded"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <input
                    type="time"
                    step={60}
                    className="border border-border-subtle bg-bg-card text-text-main p-2 rounded w-28"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-muted">
                  Visibility
                </label>
                <select
                  className="w-full border border-border-subtle bg-bg-card text-text-main p-2 rounded"
                  value={form.visibility}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      visibility: e.currentTarget.value as ContestVisibility,
                    })
                  }
                >
                  <option value="public">public</option>
                  <option value="private">private</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted">Status</label>
                <select
                  className="w-full border border-border-subtle bg-bg-card text-text-main p-2 rounded"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.currentTarget.value as ContestStatus,
                    })
                  }
                >
                  <option value="live">live</option>
                  <option value="ongoing">ongoing</option>
                  <option value="completed">completed</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted">
                  Contest Type
                </label>
                <select
                  className="w-full border border-border-subtle bg-bg-card text-text-main p-2 rounded"
                  value={form.contest_type as ContestType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contest_type: e.target.value as ContestType,
                    })
                  }
                >
                  <option value="full">full</option>
                  <option value="daily">daily</option>
                </select>
              </div>
              {form.contest_type === "daily" && (
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-sm text-text-muted">
                    Allowed Teams
                  </label>
                  {/* Dropdown trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between border border-border-subtle rounded px-3 py-2 bg-bg-card text-text-main hover:bg-bg-elevated"
                      onClick={() => setAllowedDropdownOpen((o) => !o)}
                    >
                      <span className="text-left truncate">
                        {selectedAllowedTeams.length > 0
                          ? `${selectedAllowedTeams.length} selected`
                          : "Select allowed teams"}
                      </span>
                      <svg
                        className={`w-4 h-4 ml-2 transition-transform ${allowedDropdownOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" />
                      </svg>
                    </button>
                    {allowedDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded border border-border-subtle bg-bg-card shadow-lg">
                        <div className="p-2 sticky top-0 bg-bg-card border-b border-border-subtle flex gap-2">
                          <input
                            type="text"
                            placeholder="Search..."
                            className="flex-1 border border-border-subtle rounded px-2 py-1 text-sm bg-bg-card text-text-main placeholder:text-text-muted"
                            onChange={(e) => {
                              const q = e.currentTarget.value.toLowerCase();
                              e.currentTarget.dataset.query = q;
                            }}
                          />
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-border-subtle text-text-main hover:bg-bg-elevated"
                            onClick={() =>
                              setSelectedAllowedTeams(availableTeams)
                            }
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-border-subtle text-text-main hover:bg-bg-elevated"
                            onClick={() => setSelectedAllowedTeams([])}
                          >
                            Clear
                          </button>
                        </div>
                        <ul className="divide-y divide-border-subtle">
                          {availableTeams.map((t) => (
                            <li
                              key={t}
                              className="px-3 py-2 hover:bg-bg-elevated cursor-pointer"
                              onClick={() => {
                                setSelectedAllowedTeams((prev) =>
                                  prev.includes(t)
                                    ? prev.filter((x) => x !== t)
                                    : [...prev, t]
                                );
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex w-4 h-4 items-center justify-center rounded border ${selectedAllowedTeams.includes(t) ? "bg-accent-pink-soft border-accent-pink-soft" : "bg-bg-card"}`}
                                >
                                  {selectedAllowedTeams.includes(t) && (
                                    <svg
                                      viewBox="0 0 20 20"
                                      fill="none"
                                      className="w-3 h-3"
                                    >
                                      <path
                                        d="M5 10.5l3 3 7-7"
                                        stroke="white"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </span>
                                <span className="text-sm text-text-main">
                                  {t}
                                </span>
                              </div>
                            </li>
                          ))}
                          {availableTeams.length === 0 && (
                            <li className="px-3 py-2 text-sm text-text-muted">
                              No teams available
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    Only players whose team is in the allowed list will be
                    selectable for this daily contest.
                  </p>
                </div>
              )}
            </div>
            <Button className="mt-3" disabled={creating} onClick={create}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </CardBody>
        </Card>

        {loading && <div>Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        <div className="grid gap-3">
          {contests.map((c) => (
            <Card
              key={c.id}
              hover
              className="bg-bg-card border border-border-subtle text-text-main"
            >
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-main">{c.name}</div>
                    <div className="text-sm text-text-muted">
                      {c.code} · {c.status} · {c.visibility}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {(() => {
                        const fmt = (iso: string) => {
                          const d = new Date(iso);
                          const utc =
                            d.getTime() + d.getTimezoneOffset() * 60000;
                          const ist = new Date(utc + (5 * 60 + 30) * 60000);
                          return ist.toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          });
                        };
                        return (
                          <span>
                            {fmt(c.start_at)} – {fmt(c.end_at)} IST
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/admin/contests/${c.id}`)}
                    >
                      Manage
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setDeleteTargetId(c.id);
                        setShowDeleteDialog(true);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
          {!loading && contests.length === 0 && (
            <div className="text-gray-600">No contests yet.</div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
