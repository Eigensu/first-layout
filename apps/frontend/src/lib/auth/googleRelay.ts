// Google sign-in for tournament subdomains (docs/GOOGLE_OAUTH_RELAY_SPEC.md).
//
// Google matches a client's Authorized JavaScript origins exactly, with no
// wildcards, so a button rendered on <slug>.wallearena.com fails unless that
// host was registered by hand. Instead the button opens a popup on the apex,
// the one registered origin, and the apex posts the ID token back to the
// tournament page that opened it.
import {
  getTournamentSlugFromHost,
  ROOT_DOMAIN,
} from "@/common/consts/tournament";
import { NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN } from "@/config/env";

/** The relay page, served from the relay origin. */
export const GOOGLE_RELAY_PATH = "/auth/google-relay";

/** Tags the relay's message so the opener ignores every other message. */
export const GOOGLE_RELAY_MESSAGE = "google-relay-token";

export interface GoogleRelayMessage {
  type: typeof GOOGLE_RELAY_MESSAGE;
  idToken: string;
  state: string;
}

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function originOf(value: string): string | null {
  return parse(value)?.origin ?? null;
}

/**
 * The origin Google sign-in has to run on for a page at `pageOrigin`, or null
 * when the page can render Google's button itself. Subdomains of the root
 * domain use https://<root domain>; the apex, Vercel previews and localhost
 * render the button directly. NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN overrides the
 * relay, e.g. http://localhost:3000 to try relay mode on rspl.localhost:3000.
 */
export function getGoogleRelayOrigin(
  pageOrigin: string,
  configured: string = NEXT_PUBLIC_GOOGLE_RELAY_ORIGIN,
): string | null {
  let relay: string | null = null;
  if (configured) {
    relay = originOf(configured);
  } else if (parse(pageOrigin)?.hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    relay = `https://${ROOT_DOMAIN}`;
  }
  return relay && relay !== pageOrigin ? relay : null;
}

/**
 * The origin the relay at `relayOrigin` may post a token to, or null. Only a
 * tournament subdomain of the relay's own host, on the same scheme and port,
 * qualifies: posting to any other origin would hand a signed-in user's ID
 * token to whoever opened the popup.
 */
export function getAllowedOpenerOrigin(
  target: string | null,
  relayOrigin: string,
): string | null {
  const url = target ? parse(target) : null;
  const relay = parse(relayOrigin);
  // Exactly an origin: no path, query or credentials, and not "null".
  if (!url || !relay || url.origin !== target) return null;
  if (url.protocol !== relay.protocol || url.port !== relay.port) return null;
  if (!url.hostname.endsWith(`.${relay.hostname}`)) return null;
  return getTournamentSlugFromHost(url.host) ? target : null;
}

/** A fresh nonce tying a relay message to the popup that asked for it. */
export function newRelayState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isRelayState(value: string | null): value is string {
  return value !== null && STATE_PATTERN.test(value);
}

export function isRelayMessage(
  data: unknown,
  state: string,
): data is GoogleRelayMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as Partial<GoogleRelayMessage>;
  return (
    message.type === GOOGLE_RELAY_MESSAGE &&
    message.state === state &&
    typeof message.idToken === "string" &&
    message.idToken.length > 0
  );
}

/** The relay page's URL for a sign-in started at `pageOrigin`. */
export function relayUrl(relayOrigin: string, pageOrigin: string, state: string): string {
  const url = new URL(GOOGLE_RELAY_PATH, relayOrigin);
  url.searchParams.set("origin", pageOrigin);
  url.searchParams.set("state", state);
  return url.toString();
}
