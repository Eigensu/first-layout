# Google Sign-In: Cross-Subdomain Relay Specification

## Overview

Google sign-in currently uses the client-side Google Identity Services (GIS)
ID-token flow (`apps/frontend/src/components/auth/GoogleSignInButton.tsx`),
introduced to avoid registering a wildcard *redirect URI* for the
multi-tenant `*.wallearena.com` subdomains (see the `580e5e6` commit).

That sidestepped the redirect-URI problem, but GIS has the same restriction
one level up: a Google OAuth Web-client's **Authorized JavaScript origins**
also cannot be a wildcard. Every subdomain that renders the Google button has
to be added to the OAuth client by hand in Cloud Console, and there is no
supported Google API to automate that — it's a manual, per-tournament step
that breaks the platform's "creating a tournament requires zero infra
changes" invariant (`docs/TOURNAMENT_SUBDOMAINS.md`).

This document specs a fix: move the actual Google interaction to one fixed
origin, and relay the result back to whichever tournament subdomain the user
started from. Only that one fixed origin is ever registered with Google.

## Goals / non-goals

- **Goal:** new tournament subdomains work with Google sign-in immediately,
  with no Cloud Console change per tournament.
- **Goal:** no change to `POST /api/auth/google` or anything backend — it
  already only verifies the ID token's `aud`/`exp`/`email_verified`, which is
  unaffected by which origin obtained the token.
- **Goal:** no change to the call sites (`LoginForm.tsx`, `RegisterForm.tsx`)
  — they consume `onCredential(idToken)` today and should keep doing so.
- **Non-goal (v1):** full mobile-webview support (in-app browsers on
  share links). Flagged as a known gap below, not solved here.

## Architecture

Register exactly one origin with Google — the apex domain, `wallearena.com`
— and route every tournament subdomain's Google button through a relay page
hosted there via a popup + `postMessage` handshake.

```
m11.wallearena.com                    wallearena.com/auth/google-relay          Google
       |                                        |                                 |
  [Continue with Google] click                  |                                 |
       | window.open(relay?origin=..&state=n)   |                                 |
       |---------------------------------------->|                                 |
       |                                        | render GIS button, init(client_id)
       |                                        |-------------------------------->|
       |                                        |          user authenticates      |
       |                                        |<--------------------------------|
       |                                        | callback(idToken)               |
       |                                        | validate `origin` param against |
       |                                        | tournament allowlist            |
       |     postMessage({idToken, state}, origin)                                |
       |<----------------------------------------|                                 |
       | validate event.origin + state nonce     | window.close()                 |
       | onCredential(idToken) — existing path    |                                |
       | POST /api/auth/google (unchanged)        |                                |
```

`apps/frontend/src/middleware.ts` already passes apex requests through
untagged (`getTournamentSlugFromHost` returns no slug for the root domain),
so `wallearena.com/auth/google-relay` needs no middleware changes and sits
naturally alongside the existing `/auth/*` pages.

## Components

### New: relay page

`apps/frontend/src/app/auth/google-relay/page.tsx`, served from the apex
domain only.

Responsibilities, in order:

1. Read `origin` and `state` from the query string.
2. **Validate `origin`** against the same slug rules as
   `apps/frontend/src/common/consts/tournament.ts` — it must be
   `https://<valid-slug>.wallearena.com` or the apex itself. Reject anything
   else before it is ever used as a `postMessage` target.
   This is the one security-critical check in the design: skipping it turns
   the relay into an open token-leak gadget for arbitrary origins.
3. Mount the GIS script and call `google.accounts.id.initialize({ client_id,
   callback })`, identical to today's `GoogleSignInButton.tsx`.
4. In the callback: `opener.postMessage({ type: "google-relay-token",
   idToken, state }, validatedOrigin)`, then `window.close()`.

### Modified: `GoogleSignInButton.tsx`

Branch on whether the current origin is already the registered one:

- **Direct mode** — `window.location.origin === NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN`
  (local dev on `localhost:3000`, and the apex itself). Keep today's inline
  GIS button unchanged.
- **Relay mode** — any tournament subdomain. Render a plain styled button.
  On click, *synchronously* (before any `await`, so popup blockers don't
  fire):
  1. Generate a random `state` nonce.
  2. `window.open(`${RELAY_ORIGIN}/auth/google-relay?origin=${location.origin}&state=${nonce}`, "google-relay", "width=460,height=560")`.
  3. Attach a `message` listener: accept only if
     `event.origin === RELAY_ORIGIN && event.data.state === nonce`.
  4. On match, call the existing `onCredential(idToken)` prop — no changes
     needed in any caller.
  5. Clean up: remove the listener, and poll `popup.closed` to catch the
     user closing it without finishing (surfaced as a cancel, not an error).

Every existing caller of `GoogleSignInButton` is unaffected — the mode
branch and relay logic live entirely inside that one component.

## Config changes

- New env var `NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN=https://wallearena.com`
  (falls back to `window.location.origin` in dev, so `localhost:3000` keeps
  working in direct mode with no extra setup).
- Cloud Console **Authorized JavaScript origins** shrinks to exactly:
  - `http://localhost:3000`
  - `https://wallearena.com`

  One-time setup, stable across every future tournament.
- No backend env changes — `GOOGLE_CLIENT_ID` verification is unaffected by
  which origin obtained the token.

## Security notes

- `postMessage` on both sides must use an explicit target origin, never `"*"`.
- The relay page's origin allowlist check (step 2 above) is mandatory —
  without it, an attacker could craft a link to the relay page with an
  arbitrary `origin` param and have a real user's Google ID token forwarded
  there.
- The `state` nonce guards against a stale or unrelated popup/tab delivering
  an unexpected message to the opener.
- The ID token's exposure is unchanged from today's direct-mode flow: it's
  short-lived, single-use (verified server-side against Google's public
  keys), and never leaves the browser except over the `postMessage` channel
  and the existing `POST /api/auth/google` call.

## Edge cases / deferred to v2

- **Mobile Safari / in-app webviews** (e.g. share links opened inside
  Instagram/WhatsApp) are unreliable with `window.opener` — popups can fail
  to communicate back silently. V1 ships popup-only and accepts degraded UX
  there. A redirect-based fallback (relay does a top-level redirect back to
  the subdomain with a short-lived one-time code, exchanged via a small
  backend endpoint rather than putting the raw ID token in a URL) is the
  natural follow-up if this proves to matter.
- **Popup blocked** (`window.open` returns `null`): show an inline "Enable
  popups to continue with Google" message instead of failing silently.

## Files touched

- New: `apps/frontend/src/app/auth/google-relay/page.tsx`
- Modify: `apps/frontend/src/components/auth/GoogleSignInButton.tsx` (mode
  branch + popup/postMessage handshake)
- Modify: `.env.example`, `apps/frontend/src/config/env.ts`
  (`NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN`)
- No backend changes.

## Rollout

1. Add `https://wallearena.com` to the OAuth client's Authorized JavaScript
   origins in Cloud Console (additive — doesn't break the currently-working
   direct-mode origins already registered).
2. Ship the relay page and the updated `GoogleSignInButton.tsx`.
3. Once relay mode is confirmed working end-to-end, the previously
   individually-registered tournament subdomains can be left as-is or
   cleaned up from the OAuth client — they're no longer needed, since all
   subdomain traffic now routes through the relay.
