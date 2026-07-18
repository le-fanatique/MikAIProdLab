// ---------------------------------------------------------------------------
// detectionParams.ts — SEQGEN.SPLIT.1
//
// Shared scene-detection parameter bounds/defaults and their strict parser,
// used by BOTH the server action (`sequenceVideoSplit.ts`, a "use server"
// file where every export must be an async function — these plain
// constants/functions cannot live there) and the detection form UI (so the
// form's `min`/`max`/`defaultValue` attributes can never drift from what the
// server actually enforces).
// ---------------------------------------------------------------------------

export const DEFAULT_SCENE_THRESHOLD = 0.35;
export const MIN_SCENE_THRESHOLD = 0.05;
export const MAX_SCENE_THRESHOLD = 0.9;

// SEQGEN.SPLIT.MINFRAMES.1 — the old 0.5s default / 0.1s floor could silently
// drop or refuse a genuinely short Shot. `0` is now a first-class value: it
// means "use the absolute minimum" (1 source frame on CFR, a high-precision
// epsilon on VFR/unknown — see `resolveMinGapSeconds` in frameTime.ts), and
// is the new default so new runs never ignore short Shots by default. The
// scene threshold remains the primary noise control; a positive value here
// still lets the user impose a deliberately larger minimum.
export const DEFAULT_MIN_SEGMENT_DURATION = 0;
export const MIN_MIN_SEGMENT_DURATION = 0;
export const MAX_MIN_SEGMENT_DURATION = 10;

/** Requires the WHOLE string to be a plain decimal number before checking bounds — rejects "3abc", "1e1", trailing garbage, etc. */
export function parseStrictBoundedFloat(raw: string, min: number, max: number): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}
