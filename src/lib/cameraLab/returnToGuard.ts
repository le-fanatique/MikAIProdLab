// ---------------------------------------------------------------------------
// returnToGuard.ts — CAMLAB.POLISH.1 retake round 5 (Codex P2)
//
// Shared confinement for any `returnTo` value accepted from a form/query
// string that will be used as a redirect target. Never trusts the raw
// value — only ever accepts it if it's exactly this Shot's own Camera Lab
// path (optionally with query string), otherwise falls back to the
// server-reconstructed canonical path. Closes the open-redirect class of
// finding for every caller, instead of re-deriving this check per file.
// ---------------------------------------------------------------------------

export function buildCameraLabPath(projectId: number, sequenceId: number, shotId: number): string {
  return `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/camera-lab`;
}

export function isValidCameraLabReturnTo(
  value: string,
  projectId: number,
  sequenceId: number,
  shotId: number
): boolean {
  const expected = buildCameraLabPath(projectId, sequenceId, shotId);
  return value === expected || value.startsWith(`${expected}?`);
}

/** Confines an optional, untrusted `returnTo` to this Shot's own Camera Lab path — never an arbitrary caller-supplied URL. Falls back to the reconstructed canonical path when absent or invalid. */
export function resolveConfinedCameraLabReturnTo(
  rawValue: string | null | undefined,
  projectId: number,
  sequenceId: number,
  shotId: number
): string {
  const trimmed = rawValue?.trim() ?? "";
  if (trimmed && isValidCameraLabReturnTo(trimmed, projectId, sequenceId, shotId)) {
    return trimmed;
  }
  return buildCameraLabPath(projectId, sequenceId, shotId);
}
