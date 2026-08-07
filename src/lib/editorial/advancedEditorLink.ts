// ---------------------------------------------------------------------------
// Advanced Editor (OpenReel) link builder (EDITORIAL.UX.1)
//
// Extracted from src/app/projects/[projectId]/sequences/[sequenceId]/
// nle-prototype/page.tsx, which originated this exact logic — pulled out
// so Sequence Detail can open the same OpenReel URL without duplicating it
// or routing through /nle-prototype first.
// ---------------------------------------------------------------------------

import type { VideoSourceMode } from "./videoSourceModeShared";

/**
 * The uploads-relative editorial export API path for a sequence (also
 * usable directly as a same-origin link target).
 *
 * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — `videoSourceMode` is OPTIONAL and
 * additive: omitted (every pre-existing caller — the direct "Export
 * Editorial JSON" button, `nle-prototype`, Sequence Detail's own OpenReel
 * link), the URL has no query string at all, byte-identical to before this
 * ticket, and the route resolves `approved-only`. Passed explicitly (only
 * the Editorial page's OpenReel link does this, nesting its OWN current
 * mode), the route resolves that mode instead — an invalid value is
 * refused by the route itself (HTTP 400), never silently downgraded.
 */
export function editorialExportHrefFor(projectId: number, sequenceId: number, videoSourceMode?: VideoSourceMode): string {
  const base = `/api/projects/${projectId}/sequences/${sequenceId}/editorial-export`;
  return videoSourceMode ? `${base}?videoSourceMode=${videoSourceMode}` : base;
}

/**
 * Builds the URL that opens the OpenReel sidecar with this sequence's
 * editorial export pre-loaded. The sidecar reads `mikaiExportUrl` on boot
 * and fetches it itself (see docs/NLE_VENDOR_DECISION_OPENREEL.md) — this
 * function only ever needs to produce that URL, no server-side integration
 * beyond the already-shipped export route.
 */
export function buildAdvancedEditorHref(params: {
  mikaiOrigin: string;
  sidecarOrigin: string;
  projectId: number;
  sequenceId: number;
  /** EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — optional, additive; see `editorialExportHrefFor`'s own doc comment. */
  videoSourceMode?: VideoSourceMode;
}): string {
  const absoluteExportUrl = `${params.mikaiOrigin}${editorialExportHrefFor(params.projectId, params.sequenceId, params.videoSourceMode)}`;
  return `${params.sidecarOrigin}/?${new URLSearchParams({
    mikaiExportUrl: absoluteExportUrl,
    mikaiProjectId: String(params.projectId),
    mikaiSequenceId: String(params.sequenceId),
  }).toString()}`;
}
