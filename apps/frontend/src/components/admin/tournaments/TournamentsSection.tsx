"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Search,
  Globe,
  Plus,
  Calendar,
  Pencil,
  Archive,
  ExternalLink,
  Copy,
  Check,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  adminTournamentsApi,
  Tournament,
  TournamentCreate,
  TournamentUpdate,
} from "@/lib/api/admin/tournaments";
import { getErrorMessage } from "@/lib/api/client";
import {
  ROOT_DOMAIN,
  TournamentStatus,
  getSlugError,
  slugifyTournamentName,
  tournamentUrl,
} from "@/common/consts/tournament";

const STATUS_OPTIONS: { value: TournamentStatus; label: string }[] = [
  { value: "draft", label: "Draft (coming soon page)" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived (subdomain off)" },
];

const STATUS_CHIP: Record<TournamentStatus, string> = {
  draft: "bg-yellow-500/15 text-yellow-600",
  live: "bg-green-500/15 text-green-600",
  completed: "bg-blue-500/15 text-blue-600",
  archived: "bg-gray-500/15 text-gray-500",
};

interface FormState {
  name: string;
  slug: string;
  description: string;
  status: TournamentStatus;
  start_at: string; // datetime-local value
  end_at: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  api_base_url: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  status: "draft",
  start_at: "",
  end_at: "",
  logo_url: "",
  primary_color: "",
  secondary_color: "",
  api_base_url: "",
};

/** "2026-08-01T10:00:00+05:30" -> "2026-08-01T10:00" for datetime-local inputs. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function formToPayload(form: FormState, isEdit: boolean): TournamentUpdate {
  // On create, empty optionals are omitted; on edit they are sent as null so
  // the backend clears the stored value (omitted keys are left untouched).
  const empty = isEdit ? null : undefined;
  return {
    name: form.name.trim(),
    slug: form.slug.trim().toLowerCase(),
    description: form.description.trim() || empty,
    status: form.status,
    // Sent without a timezone; the backend interprets naive datetimes as IST.
    start_at: form.start_at || empty,
    end_at: form.end_at || empty,
    logo_url: form.logo_url.trim() || empty,
    primary_color: form.primary_color || empty,
    secondary_color: form.secondary_color || empty,
    api_base_url: form.api_base_url.trim() || empty,
  };
}

function TournamentForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Tournament | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          slug: initial.slug,
          description: initial.description || "",
          status: initial.status,
          start_at: toLocalInput(initial.start_at),
          end_at: toLocalInput(initial.end_at),
          logo_url: initial.logo_url || "",
          primary_color: initial.primary_color || "",
          secondary_color: initial.secondary_color || "",
          api_base_url: initial.api_base_url || "",
        }
      : EMPTY_FORM
  );
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [slugStatus, setSlugStatus] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "ok" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Availability check (debounced). Local format errors short-circuit the call.
  const scheduleSlugCheck = useCallback(
    (slug: string) => {
      if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
      const value = slug.trim().toLowerCase();
      if (!value || (isEdit && value === initial?.slug)) {
        setSlugStatus({ state: "idle" });
        return;
      }
      const localError = getSlugError(value);
      if (localError) {
        setSlugStatus({ state: "error", message: localError });
        return;
      }
      setSlugStatus({ state: "checking" });
      slugCheckTimer.current = setTimeout(async () => {
        try {
          const res = await adminTournamentsApi.checkSlug(value);
          setSlugStatus(
            res.available
              ? { state: "ok" }
              : { state: "error", message: res.reason || "Slug is not available" }
          );
        } catch {
          // Availability is re-validated on submit; don't block typing on errors.
          setSlugStatus({ state: "idle" });
        }
      }, 400);
    },
    [isEdit, initial?.slug]
  );

  const handleNameChange = (name: string) => {
    set("name", name);
    if (!slugTouched) {
      const suggested = slugifyTournamentName(name);
      set("slug", suggested);
      scheduleSlugCheck(suggested);
    }
  };

  const handleSlugChange = (slug: string) => {
    setSlugTouched(true);
    const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    set("slug", cleaned);
    scheduleSlugCheck(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const slugError = getSlugError(form.slug);
    if (slugError) {
      setError(`Slug: ${slugError}`);
      return;
    }
    if (form.start_at && form.end_at && form.start_at >= form.end_at) {
      setError("Start date must be before end date");
      return;
    }

    try {
      setSaving(true);
      if (isEdit && initial) {
        await adminTournamentsApi.update(initial.id, formToPayload(form, true));
      } else {
        await adminTournamentsApi.create(formToPayload(form, false) as TournamentCreate);
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-border-subtle bg-bg-card text-text-main rounded-lg focus:ring-2 focus:ring-accent-orange-500 focus:border-transparent placeholder:text-text-muted";
  const labelClass = "block text-sm font-medium text-text-main mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <Card className="w-full max-w-2xl my-8">
        <CardBody className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-text-main">
              {isEdit ? `Edit ${initial?.name}` : "Create Tournament"}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-bg-elevated text-text-muted"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Tournament Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Delhi Premier Cricket League"
                className={inputClass}
                maxLength={200}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Subdomain Slug *</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="dpcl"
                  className={`${inputClass} font-mono`}
                  maxLength={32}
                  required
                />
                {slugStatus.state === "checking" && (
                  <Loader2 className="w-5 h-5 animate-spin text-text-muted shrink-0" />
                )}
                {slugStatus.state === "ok" && (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                )}
                {slugStatus.state === "error" && (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Fans will visit{" "}
                <span className="font-mono text-accent-pink">
                  {form.slug || "<slug>"}.{ROOT_DOMAIN}
                </span>
                {" "}— active immediately after saving.
              </p>
              {slugStatus.state === "error" && (
                <p className="mt-1 text-xs text-red-500">{slugStatus.message}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Short blurb shown on the tournament landing page"
                className={inputClass}
                maxLength={2000}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as TournamentStatus)}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Logo URL</label>
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={(e) => set("logo_url", e.target.value)}
                  placeholder="https://…"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Starts (IST)</label>
                <input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => set("start_at", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ends (IST)</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => set("end_at", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Primary Brand Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color || "#3c1f62"}
                    onChange={(e) => set("primary_color", e.target.value)}
                    className="h-10 w-14 rounded border border-border-subtle bg-bg-card cursor-pointer"
                  />
                  {form.primary_color && (
                    <button
                      type="button"
                      onClick={() => set("primary_color", "")}
                      className="text-xs text-text-muted hover:text-text-main"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Secondary Brand Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondary_color || "#4a325f"}
                    onChange={(e) => set("secondary_color", e.target.value)}
                    className="h-10 w-14 rounded border border-border-subtle bg-bg-card cursor-pointer"
                  />
                  {form.secondary_color && (
                    <button
                      type="button"
                      onClick={() => set("secondary_color", "")}
                      className="text-xs text-text-muted hover:text-text-main"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <details className="rounded-lg border border-border-subtle p-3">
              <summary className="text-sm text-text-muted cursor-pointer select-none">
                Advanced: separate backend (legacy deployments only)
              </summary>
              <div className="mt-3">
                <label className={labelClass}>API Base URL</label>
                <input
                  type="url"
                  value={form.api_base_url}
                  onChange={(e) => set("api_base_url", e.target.value)}
                  placeholder="Leave empty to use the shared API (recommended)"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-muted">
                  Only for tournaments still running on their own Railway
                  service (e.g. https://api-lpcl.{ROOT_DOMAIN}). New tournaments
                  should leave this empty.
                </p>
              </div>
            </details>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || slugStatus.state === "error"}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Tournament"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export function TournamentsSection() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<Tournament | "create" | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminTournamentsApi.list({
        page_size: 50,
        search: search || undefined,
      });
      setTournaments(res.tournaments);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleArchive = async (t: Tournament) => {
    if (
      !window.confirm(
        `Archive "${t.name}"? ${t.slug}.${ROOT_DOMAIN} will stop resolving until it is set back to live.`
      )
    ) {
      return;
    }
    try {
      await adminTournamentsApi.archive(t.id);
      load(searchQuery);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleCopy = async (t: Tournament) => {
    try {
      await navigator.clipboard.writeText(tournamentUrl(t.slug));
      setCopiedSlug(t.slug);
      setTimeout(() => setCopiedSlug(null), 1500);
    } catch {
      // Clipboard unavailable (http/permissions); the URL is visible anyway.
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search tournaments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load(searchQuery);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-border-subtle bg-bg-card text-text-main rounded-lg focus:ring-2 focus:ring-accent-orange-500 focus:border-transparent placeholder:text-text-muted"
                />
              </div>
            </div>
            <Button onClick={() => setFormTarget("create")} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Tournament
            </Button>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Creating a tournament activates{" "}
            <span className="font-mono">&lt;slug&gt;.{ROOT_DOMAIN}</span>{" "}
            immediately — the wildcard DNS + certificate cover every subdomain,
            so no Railway or DNS changes are needed per tournament.
          </p>
        </CardBody>
      </Card>

      {error && <div className="text-red-500 text-sm">{error}</div>}
      {loading && <div className="text-text-muted text-sm">Loading...</div>}

      {/* Tournament grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tournaments.map((t) => (
          <Card key={t.id} hover>
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg overflow-hidden">
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.logo_url}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Globe className="w-6 h-6" />
                  )}
                </div>
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_CHIP[t.status]}`}
                >
                  {t.status}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-text-main mb-1">{t.name}</h3>

              <div className="flex items-center gap-1 mb-4">
                <a
                  href={tournamentUrl(t.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-accent-pink hover:underline truncate"
                >
                  {t.slug}.{ROOT_DOMAIN}
                </a>
                <button
                  onClick={() => handleCopy(t)}
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted shrink-0"
                  title="Copy URL"
                >
                  {copiedSlug === t.slug ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={tournamentUrl(t.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-bg-elevated text-text-muted shrink-0"
                  title="Open"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {(t.start_at || t.end_at) && (
                <div className="flex items-center gap-2 text-sm text-text-muted mb-4">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {toLocalInput(t.start_at).replace("T", " ")}
                    {t.end_at ? ` → ${toLocalInput(t.end_at).replace("T", " ")}` : ""}
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-border flex gap-2">
                <button
                  onClick={() => setFormTarget(t)}
                  className="px-3 py-1 rounded border border-border text-sm flex-1 text-center text-text-main hover:bg-bg-elevated transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                {t.status !== "archived" && (
                  <button
                    onClick={() => handleArchive(t)}
                    className="px-3 py-1 rounded border border-border text-sm flex-1 text-center text-red-400 hover:bg-red-500/10 transition-colors inline-flex items-center justify-center gap-1"
                  >
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
        {!loading && tournaments.length === 0 && (
          <div className="text-text-muted">
            No tournaments yet. Create the first one — its subdomain goes live
            instantly.
          </div>
        )}
      </div>

      {formTarget && (
        <TournamentForm
          initial={formTarget === "create" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            load(searchQuery);
          }}
        />
      )}
    </div>
  );
}
