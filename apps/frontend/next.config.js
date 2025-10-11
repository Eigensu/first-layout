const path = require("path");
const { config } = require("dotenv");

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, "../../.env");
config({ path: rootEnvPath });

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
  // Ignore build errors for faster deployment (optional - remove in production)
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
