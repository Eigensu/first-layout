const path = require("path");
const { config } = require("dotenv");

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, "../../.env");
config({ path: rootEnvPath });

// PostHog, proxied through /ingest so ad blockers that block PostHog's own
// domain do not hide errors from us (docs/POSTHOG_OBSERVABILITY.md). PostHog
// Cloud serves its scripts from a separate assets host; self-hosted, the same.
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const POSTHOG_ASSETS_HOST = POSTHOG_HOST.replace(
  /^https:\/\/(us|eu)\.i\.posthog\.com$/,
  "https://$1-assets.i.posthog.com"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/api/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/api/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "drive.google.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "walle-api.wallearena.com",
        port: "",
        pathname: "/api/**",
      },
      {
        protocol: "https",
        hostname: "api-m11.wallearena.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api-lpcl.wallearena.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "walle-third.eigensu.in",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "fifth-api.wallearena.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "mscsuper.blr1.digitaloceanspaces.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    // The player page moved from /dashboard to /profile; keep old links and
    // bookmarks working. Temporary (307), so browsers do not cache it for
    // good and /dashboard stays free to reuse.
    return [{ source: "/dashboard", destination: "/profile", permanent: false }];
  },
  // PostHog's endpoints end in a slash (/e/, /flags/); redirecting them away
  // from it would break every request through /ingest.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS_HOST}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG_HOST}/:path*` },
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/:path*`
          : "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
  // Ignore build errors for faster deployment (optional - remove in production)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Disable Next.js dev activity indicator (logo/watermark)
  devIndicators: {
    position: "bottom-right",
  },
};

module.exports = nextConfig;
