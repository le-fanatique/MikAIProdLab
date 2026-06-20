import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js module — must not be bundled by Next.js
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
