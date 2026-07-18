// ---------------------------------------------------------------------------
// thumbnailPolicy.ts — SEQGEN.PUSH.2
//
// Pure: no I/O, no DB. Two small decision functions extracted out of
// `pushSplitPlanToShots`'s transaction so the "manual always wins" and
// "only write a genuinely different duration" policies are independently
// testable without a real database or FFmpeg.
// ---------------------------------------------------------------------------

export type ThumbnailSelectionSource = "manual" | "automatic_push";

/**
 * A push may only ever create OR replace an `automatic_push` thumbnail
 * selection — an existing `manual` choice always wins and is never
 * overwritten by any future push, exactly as the ticket requires.
 */
export function shouldReplaceThumbnailSelection(existing: { source: ThumbnailSelectionSource } | null): boolean {
  return existing === null || existing.source === "automatic_push";
}

const DURATION_EPSILON_SECONDS = 1e-6;

/** Whether a Shot's `durationSeconds` should actually be rewritten — never rewrites an identical value (floating-point noise excluded via a tiny epsilon), and always writes when the current value is null. */
export function hasDurationChanged(currentDurationSeconds: number | null, probedDurationSeconds: number): boolean {
  return currentDurationSeconds === null || Math.abs(currentDurationSeconds - probedDurationSeconds) > DURATION_EPSILON_SECONDS;
}
