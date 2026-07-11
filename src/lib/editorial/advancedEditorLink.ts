// ---------------------------------------------------------------------------
// Advanced Editor (OpenReel) link builder (EDITORIAL.UX.1)
//
// Extracted from src/app/projects/[projectId]/sequences/[sequenceId]/
// nle-prototype/page.tsx, which originated this exact logic — pulled out
// so Sequence Detail can open the same OpenReel URL without duplicating it
// or routing through /nle-prototype first.
// ---------------------------------------------------------------------------

/** The uploads-relative editorial export API path for a sequence (also usable directly as a same-origin link target). */
export function editorialExportHrefFor(projectId: number, sequenceId: number): string {
  return `/api/projects/${projectId}/sequences/${sequenceId}/editorial-export`;
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
}): string {
  const absoluteExportUrl = `${params.mikaiOrigin}${editorialExportHrefFor(params.projectId, params.sequenceId)}`;
  return `${params.sidecarOrigin}/?${new URLSearchParams({
    mikaiExportUrl: absoluteExportUrl,
    mikaiProjectId: String(params.projectId),
    mikaiSequenceId: String(params.sequenceId),
  }).toString()}`;
}
