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
      // REVISE (Codex finding #5, SEQGEN.STORYBOARD.EXTRACT.1-FIX6) — this
      // limit bounds the ENTIRE multipart request body, not just the file
      // field: at exactly 10mb of file bytes, the multipart boundary/header
      // framing and the other form fields (sequenceId, returnTo, ...) push
      // the total over 10mb, so a file the app itself advertises as valid
      // (MAX_SEQUENCE_STORYBOARD_UPLOAD_BYTES = 10MB in
      // src/actions/sequenceStoryboard.ts) was rejected before ever
      // reaching the action. The per-file ceiling stays exactly 10MB
      // (enforced in that action); this only adds headroom for multipart
      // overhead.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
