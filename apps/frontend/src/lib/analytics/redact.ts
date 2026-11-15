/**
 * Redaction for everything the browser sends to PostHog.
 *
 * PostHog knows users by id alone (docs/POSTHOG_OBSERVABILITY.md), so email
 * addresses and mobile numbers are replaced wherever they turn up: an error
 * message, a clicked element's text, a replayed page. The backend does the
 * same (apps/backend/config/redaction.py). URLs also lose the secrets this
 * app puts in query strings: the password-reset token, the refresh token the
 * API client sends, Google sign-in's state.
 */

export const EMAIL_PLACEHOLDER = "[email]";
export const MOBILE_PLACEHOLDER = "[mobile]";
export const SECRET_PLACEHOLDER = "[redacted]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Mobiles are stored as 10 to 15 bare digits. No lookbehind for "standing on
// its own": Safari before 16.4 cannot parse one, and the bundle would fail.
const MOBILE = /(^|\W)\+?\d{10,15}(?!\w)/g;

const SECRET_QUERY_PARAMS = new Set([
  "token",
  "refresh_token",
  "access_token",
  "id_token",
  "state",
  "code",
  "otp",
  "password",
]);

// Event properties holding free text; ids and the like are never touched.
const TEXT_PROPERTIES = new Set(["$el_text", "$exception_message", "$elements_chain", "title"]);

export function redactPersonalData(text: string): string {
  return text.replace(EMAIL, EMAIL_PLACEHOLDER).replace(MOBILE, `$1${MOBILE_PLACEHOLDER}`);
}

/**
 * `url` with its secret query parameters masked and personal data redacted.
 * Query values are decoded first: an email in a query string is `%40`-encoded.
 */
export function redactUrl(url: string): string {
  const queryAt = url.indexOf("?");
  if (queryAt === -1) return redactPersonalData(url);
  const hashAt = url.indexOf("#", queryAt);
  const base = url.slice(0, queryAt);
  const query = url.slice(queryAt + 1, hashAt === -1 ? undefined : hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);

  const redacted = new URLSearchParams();
  new URLSearchParams(query).forEach((value, key) => {
    redacted.append(
      key,
      SECRET_QUERY_PARAMS.has(key.toLowerCase()) ? SECRET_PLACEHOLDER : redactPersonalData(value)
    );
  });
  const search = redacted
    .toString()
    // Keep the placeholders readable rather than percent-encoded.
    .replace(/%5B(email|mobile|redacted)%5D/g, "[$1]");
  return `${redactPersonalData(base)}?${search}${redactPersonalData(hash)}`;
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:)?\/\//.test(value) || value.startsWith("/");
}

function redactProperties(properties: Record<string, unknown> | undefined): void {
  if (!properties) return;
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    if (looksLikeUrl(value)) properties[key] = redactUrl(value);
    else if (TEXT_PROPERTIES.has(key)) properties[key] = redactPersonalData(value);
  }
}

type RedactableEvent = {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
};

/** posthog-js's before_send. */
export function redactEvent<T extends RedactableEvent | null>(event: T): T {
  if (!event) return event;
  redactProperties(event.properties);
  redactProperties(event.$set);
  redactProperties(event.$set_once);

  const properties = event.properties ?? {};
  for (const exception of (properties.$exception_list as Array<Record<string, unknown>>) ?? []) {
    if (typeof exception?.value === "string") exception.value = redactPersonalData(exception.value);
  }
  for (const element of (properties.$elements as Array<Record<string, unknown>>) ?? []) {
    if (element && typeof element === "object") redactProperties(element);
  }
  return event;
}

/** Session replay's network (and page URL) mask: the URL is in `name`. */
export function redactNetworkRequest<T extends { name: string }>(request: T): T {
  return { ...request, name: redactUrl(request.name) };
}
