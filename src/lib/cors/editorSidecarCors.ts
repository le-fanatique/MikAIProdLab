// ---------------------------------------------------------------------------
// Scoped CORS allowlist for local editor sidecar media fetches
// (NLE.VENDOR.BRIDGE.1)
//
// Lets a locally-running sidecar editor (e.g. an OpenReel dev server on
// http://localhost:5173) fetch() MikAI's uploaded media bytes cross-origin,
// without making the uploads route publicly CORS-open. Never returns a
// wildcard ("*") origin — always echoes back one specific allowed origin,
// or nothing at all.
//
// Same-origin requests (no Origin header, or Origin === request host) are
// unaffected either way — browsers don't send Origin for same-origin
// requests, and this module only ever adds headers, never removes the
// route's existing behavior.
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/**
 * Default allowlist plus any origins from MIKAI_EDITOR_CORS_ORIGINS
 * (comma-separated) — additive, never replaces the defaults, and produces
 * the same allowlist as before if the env var is unset.
 */
function getAllowedOrigins(): string[] {
  const fromEnv = process.env.MIKAI_EDITOR_CORS_ORIGINS;
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;

  const extra = fromEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
}

export type EditorSidecarCorsOptions = {
  /** Value for Access-Control-Allow-Methods. Defaults to the media-route set (GET, HEAD, OPTIONS). */
  methods?: string;
  /** Value for Access-Control-Allow-Headers. Defaults to the media-route set (Range, Content-Type). */
  headers?: string;
  /** Value for Access-Control-Expose-Headers, or null to omit it entirely (e.g. a route with no Range/streaming response). Defaults to the media-route set. */
  exposeHeaders?: string | null;
};

const DEFAULT_METHODS = "GET, HEAD, OPTIONS";
const DEFAULT_ALLOW_HEADERS = "Range, Content-Type";
const DEFAULT_EXPOSE_HEADERS = "Content-Length, Content-Range, Accept-Ranges";

/**
 * Resolves the CORS response headers for a given request's Origin header.
 * Returns null when there is no Origin header (same-origin request — no
 * CORS headers needed) or when the Origin is not on the allowlist (no
 * Access-Control-Allow-Origin is ever added for an unrecognized origin —
 * never a wildcard fallback).
 *
 * `options` lets a POST/JSON route (e.g. editorial-timing-patch) request a
 * different Allow-Methods/Allow-Headers/Expose-Headers set than the
 * media-route defaults (GET/HEAD/Range) without duplicating the allowlist
 * or origin-matching logic — every caller still shares the same allowlist.
 */
export function resolveEditorSidecarCorsHeaders(
  originHeader: string | null,
  options: EditorSidecarCorsOptions = {}
): Record<string, string> | null {
  if (!originHeader) return null;
  if (!getAllowedOrigins().includes(originHeader)) return null;

  const exposeHeaders = options.exposeHeaders === undefined ? DEFAULT_EXPOSE_HEADERS : options.exposeHeaders;

  const result: Record<string, string> = {
    "Access-Control-Allow-Origin": originHeader,
    Vary: "Origin",
    "Access-Control-Allow-Methods": options.methods ?? DEFAULT_METHODS,
    "Access-Control-Allow-Headers": options.headers ?? DEFAULT_ALLOW_HEADERS,
  };
  if (exposeHeaders) {
    result["Access-Control-Expose-Headers"] = exposeHeaders;
  }
  return result;
}
