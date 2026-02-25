const path = require("path");
const { config } = require("dotenv");

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, "../../.env");
config({ path: rootEnvPath });

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
        hostname: "api-m11.wallearena.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "mscsuper.blr1.digitaloceanspaces.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
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
