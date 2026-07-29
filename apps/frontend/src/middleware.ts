import { NextRequest, NextResponse } from "next/server";
import { getTournamentSlugFromHost } from "@/common/consts/tournament";

/**
 * Subdomain routing: <slug>.wallearena.com serves that tournament.
 *
 * A new tournament created in the admin panel is reachable immediately —
 * the wildcard DNS record + wildcard certificate cover every subdomain, so
 * no DNS, certificate, or environment-variable changes are needed per
 * tournament. Hosts that are not tournament subdomains (apex, www, api-*,
 * Vercel previews, localhost) pass through untouched.
 */
export function middleware(req: NextRequest) {
  const slug = getTournamentSlugFromHost(req.headers.get("host"));
  if (!slug) return NextResponse.next();

  // Expose the tenant to server components / route handlers on every request.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tournament-slug", slug);

  const { pathname } = req.nextUrl;

  // The subdomain root shows the tournament landing page.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = `/t/${slug}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // Every other path is served by the shared app, tagged with the tenant.
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip Next internals, API proxy routes, and static assets (paths with a dot).
  matcher: ["/((?!_next/|api/|favicon\\.ico|.*\\..*).*)"],
};
