"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { Loader2, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  adminTournamentsApi,
  Tournament,
  TournamentAdmin,
} from "@/lib/api/admin/tournaments";
import { getErrorMessage } from "@/lib/api/client";

/** The admins of one tournament, each with a way to remove them. */
export function TournamentAdminsList({
  admins,
  removingId,
  onRemove,
}: Readonly<{
  admins: TournamentAdmin[];
  removingId: string | null;
  onRemove: (admin: TournamentAdmin) => void;
}>) {
  if (admins.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No admins yet. Platform admins can still run it.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {admins.map((admin) => (
        <li key={admin.user_id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="font-medium text-text-main truncate">
              {admin.full_name || admin.display_name}
            </p>
            <p className="text-xs text-text-muted truncate">
              {admin.display_name === admin.username
                ? admin.username
                : `${admin.display_name} here · ${admin.username}`}
              {admin.email ? ` · ${admin.email}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(admin)}
            disabled={removingId === admin.user_id}
            className="px-2.5 py-1 rounded border border-border text-xs text-red-400 hover:bg-red-500/10 transition-colors inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            {removingId === admin.user_id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserMinus className="w-3.5 h-3.5" />
            )}
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href]";

/** getErrorMessage turns every 404 into "resource not found". Appointing, a 404
 *  means no account signs in that way, which the backend says plainly. */
function appointError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    const detail: unknown = err.response.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return getErrorMessage(err);
}

/**
 * Keeps keyboard focus inside a modal while it is open: Tab cycles through its
 * controls, Escape closes it, and focus goes back to whatever opened it.
 */
function useModalFocus(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  // The parent passes a new onClose on every render; reading it through a ref
  // keeps the effect below to one run per opening, so focus is not handed
  // back to the opener while the dialog is still in use.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [ref]);
}

/**
 * Who runs a tournament. Admin is a role in one tournament: an admin here can
 * open this tournament's admin pages and no other's. Only platform admins see
 * this dialog, since only they can change it.
 */
export function TournamentAdminsDialog({
  tournament,
  onClose,
}: Readonly<{
  tournament: Tournament;
  onClose: () => void;
}>) {
  const [admins, setAdmins] = useState<TournamentAdmin[] | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [appointing, setAppointing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Appointments and removals can overlap, each reloading the list. Only the
  // newest load may land, or a slower, older one would bring back someone
  // just removed.
  const latestLoad = useRef(0);

  useModalFocus(dialogRef, onClose);

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current;
    try {
      const fetched = await adminTournamentsApi.listAdmins(tournament.id);
      if (thisLoad === latestLoad.current) setAdmins(fetched);
    } catch (e) {
      if (thisLoad !== latestLoad.current) return;
      setAdmins([]);
      setError(getErrorMessage(e));
    }
  }, [tournament.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return;
    try {
      setAppointing(true);
      setError(null);
      await adminTournamentsApi.appointAdmin(tournament.id, value);
      setIdentifier("");
      await load();
    } catch (err) {
      setError(appointError(err));
    } finally {
      setAppointing(false);
    }
  };

  const handleRemove = async (admin: TournamentAdmin) => {
    if (
      !window.confirm(
        `Remove ${admin.full_name || admin.display_name} as an admin of ${tournament.name}?`
      )
    ) {
      return;
    }
    try {
      setRemovingId(admin.user_id);
      setError(null);
      await adminTournamentsApi.removeAdmin(tournament.id, admin.user_id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg my-8"
      >
      <Card>
        <CardBody className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2
              id={titleId}
              className="text-xl font-semibold text-text-main flex items-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              Admins of {tournament.name}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-bg-elevated text-text-muted"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-text-muted mb-5">
            They can run this tournament&apos;s contests, players and settings,
            and nothing in any other tournament.
          </p>

          <form onSubmit={handleAppoint} className="flex gap-2 mb-5">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Their mobile number or email"
              aria-label="Mobile number or email of the new admin"
              className="flex-1 min-w-0 px-3 py-2 border border-border-subtle bg-bg-card text-text-main rounded-lg focus:ring-2 focus:ring-accent-orange-500 focus:border-transparent placeholder:text-text-muted"
              disabled={appointing}
              autoFocus
            />
            <Button type="submit" disabled={appointing || !identifier.trim()}>
              {appointing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Make admin
                </>
              )}
            </Button>
          </form>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm px-3 py-2 mb-4">
              {error}
            </div>
          )}

          {admins === null ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <TournamentAdminsList
              admins={admins}
              removingId={removingId}
              onRemove={handleRemove}
            />
          )}
        </CardBody>
      </Card>
      </div>
    </div>
  );
}
