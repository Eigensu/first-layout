"use client";

import React, { useState, useSyncExternalStore } from "react";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  getAllowedOpenerOrigin,
  getGoogleRelayOrigin,
  GOOGLE_RELAY_MESSAGE,
  isRelayState,
  type GoogleRelayMessage,
} from "@/lib/auth/googleRelay";

// The page's origin never changes, so there is nothing to subscribe to.
const subscribe = () => () => {};

/** Long enough for the message to reach the opener before it sees the popup close. */
const CLOSE_DELAY_MS = 150;

function RelayCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-card p-6 text-center space-y-4">
        <h1 className="text-xl font-bold text-text-main">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * The popup a tournament subdomain's Google button opens on the apex: it runs
 * Google sign-in here, on the one origin registered with Google, and posts the
 * ID token back to the page that opened it (src/lib/auth/googleRelay.ts).
 */
export function GoogleRelay({
  origin,
  state,
}: {
  origin: string | null;
  state: string | null;
}) {
  // null while server rendering, where the host isn't known yet.
  const here = useSyncExternalStore<string | null>(
    subscribe,
    () => window.location.origin,
    () => null,
  );
  const [openerGone, setOpenerGone] = useState(false);

  if (here === null) return <RelayCard title="Sign in with Google">{null}</RelayCard>;

  // Only the registered origin relays, and only to a tournament page under it.
  const target =
    getGoogleRelayOrigin(here) === null ? getAllowedOpenerOrigin(origin, here) : null;

  if (!target || !isRelayState(state)) {
    return (
      <RelayCard title="Nothing to sign in to">
        <p className="text-sm text-text-muted">
          This window opens from the Google button on a tournament&apos;s sign-in
          page. Close it and start again from there.
        </p>
      </RelayCard>
    );
  }

  const nonce: string = state;

  const handleCredential = (idToken: string) => {
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) {
      setOpenerGone(true);
      return;
    }
    const message: GoogleRelayMessage = { type: GOOGLE_RELAY_MESSAGE, idToken, state: nonce };
    opener.postMessage(message, target);
    window.setTimeout(() => window.close(), CLOSE_DELAY_MS);
  };

  return (
    <RelayCard title="Sign in with Google">
      <p className="text-sm text-text-muted">
        to continue on{" "}
        <span className="font-semibold text-text-main">{new URL(target).host}</span>
      </p>
      <GoogleSignInButton onCredential={handleCredential} text="continue_with" />
      {openerGone && (
        <p role="alert" className="text-xs text-danger">
          The page that opened this window has closed. Close this window and
          sign in again.
        </p>
      )}
      <button
        type="button"
        onClick={() => window.close()}
        className="text-sm text-text-muted hover:text-text-main transition-colors"
      >
        Cancel
      </button>
    </RelayCard>
  );
}
