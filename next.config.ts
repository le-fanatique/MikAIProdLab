import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js module — must not be bundled by Next.js.
  // ffmpeg-ffprobe-static resolves its binary paths via `path.join(__dirname, ...)`
  // at require time (FFMPEG.BUNDLE.1) — bundling it rewrites __dirname to a
  // synthetic Next.js build path, breaking that resolution entirely (observed:
  // ffmpegPath resolved to "\ROOT\node_modules\..." instead of the real
  // absolute path). Externalizing keeps it a plain runtime require(), same
  // fix as better-sqlite3, for the same underlying reason.
  serverExternalPackages: ["better-sqlite3", "ffmpeg-ffprobe-static"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
