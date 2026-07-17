// ---------------------------------------------------------------------------
// frameTime.ts — SEQGEN.SPLIT.WORKSPACE.1
//
// Pure frame/seconds/timecode conversion, shared by the global boundary
// selection algorithm (selectSegmentBoundaries.ts), local-detection
// filtering, and the server actions for "Split at Current Frame" and
// manual boundary edits. No process spawning, no filesystem, no Date.now().
//
// Design: seconds (high-precision, as stored in the DB) remain the ONLY
// durable source of truth — this module never introduces a second,
// divertible source of truth (no frame-number columns). Frame numbers and
// timecodes are always a DERIVED, presentation-time projection of seconds
// against a given FPS, computed fresh every time.
//
// FPS reliability: `sourceFps` on a run is only trustworthy for VFR-free,
// well-probed sources. `isReliableFps` bounds what's accepted as a real
// constant frame rate (1–240 — bundled ffmpeg/ffprobe's own realistic
// range); anything else (null, 0, NaN, negative, absurdly high) is treated
// as "unknown/unreliable," and callers must fall back to
// `roundHighPrecision` (never a frame-snap) and surface a VFR/unreliable-FPS
// warning rather than promise frame-exact behavior they cannot deliver.
// ---------------------------------------------------------------------------

/** Bundled ffmpeg/ffprobe's own realistic constant-frame-rate range. Outside this, FPS is treated as unreliable — never used for frame quantization. */
export const MIN_RELIABLE_FPS = 1;
export const MAX_RELIABLE_FPS = 240;

export function isReliableFps(fps: number | null | undefined): fps is number {
  return typeof fps === "number" && Number.isFinite(fps) && fps >= MIN_RELIABLE_FPS && fps <= MAX_RELIABLE_FPS;
}

/** Nearest frame index for a given number of seconds at the given FPS — never negative. */
export function secondsToFrame(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

/** Seconds for a given frame index at the given FPS. */
export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Snaps a seconds value to the exact seconds-value of its nearest frame at
 * the given FPS — replaces the old destructive `round2` (fixed 2-decimal
 * rounding, up to ±0.005s of error per boundary, which can exceed a frame
 * at high FPS or on a very short Shot) with a value that round-trips
 * exactly through `secondsToFrame`/`frameToSeconds` for the photographed
 * FPS of this specific run.
 */
export function quantizeToNearestFrame(seconds: number, fps: number): number {
  return frameToSeconds(secondsToFrame(seconds, fps), fps);
}

/**
 * Fallback precision for sources with no reliable FPS (VFR, or FPS could
 * not be probed) — far finer than the old 2-decimal `round2` (which could
 * itself shift a boundary by more than a frame at common FPS values), but
 * still bounded so repeated arithmetic never accumulates unbounded
 * floating-point drift. 6 decimals = microsecond precision, well below any
 * real single-frame duration even at very high frame rates.
 */
const HIGH_PRECISION_DECIMALS = 6;
const HIGH_PRECISION_FACTOR = 10 ** HIGH_PRECISION_DECIMALS;

export function roundHighPrecision(seconds: number): number {
  return Math.round(seconds * HIGH_PRECISION_FACTOR) / HIGH_PRECISION_FACTOR;
}

/**
 * The single rounding policy every boundary in this feature must go
 * through: frame-exact when the run's FPS is reliable, high-precision
 * (never frame-snapped) otherwise. Centralizing this is what lets
 * `selectSegmentBoundaries`, manual Adjust/Split, and "Split at Current
 * Frame" all agree on the same notion of "the same boundary" instead of
 * each rounding independently and silently drifting apart.
 */
export function roundBoundarySeconds(seconds: number, fps: number | null | undefined): number {
  return isReliableFps(fps) ? quantizeToNearestFrame(seconds, fps) : roundHighPrecision(seconds);
}

export type FrameSplitValidation = { ok: true; splitAtSeconds: number } | { ok: false; error: string };

/**
 * Pure validation for "Split at Current Frame" (SEQGEN.SPLIT.WORKSPACE.1,
 * Lot B): converts a client-supplied integer frame index into a validated,
 * server-derived split timestamp — the server NEVER trusts a client-
 * supplied timestamp directly, only a frame index re-derived through the
 * run's own snapshotted FPS. Refuses (never silently snaps to a different
 * frame):
 *   - a non-integer or negative frame;
 *   - a frame outside the selected segment's own frame range;
 *   - the segment's own first or last frame (that's not a new cut, it's
 *     the segment's existing boundary);
 *   - any split that would leave either resulting side shorter than
 *     `minGapSeconds` converted to whole frames (at least 1 frame either
 *     side, always — `minGapSeconds` can only make this floor larger).
 */
export function validateFrameSplit(params: {
  frame: number;
  fps: number;
  segmentStartSeconds: number;
  segmentEndSeconds: number;
  minGapSeconds: number;
}): FrameSplitValidation {
  const { frame, fps, segmentStartSeconds, segmentEndSeconds, minGapSeconds } = params;

  if (!Number.isInteger(frame) || frame < 0) {
    return { ok: false, error: "Frame must be a non-negative whole number." };
  }
  if (!isReliableFps(fps)) {
    return { ok: false, error: "This run has no reliable FPS for the source video — frame-exact splitting is not available. Use the numeric Split control instead." };
  }

  const startFrame = secondsToFrame(segmentStartSeconds, fps);
  const endFrame = secondsToFrame(segmentEndSeconds, fps);
  const requiredGapFrames = Math.max(1, Math.round(minGapSeconds * fps));

  if (frame < startFrame + requiredGapFrames || frame > endFrame - requiredGapFrames) {
    return {
      ok: false,
      error: `Frame ${frame} is too close to this segment's own boundaries (or outside it) — choose a frame strictly inside the segment, leaving at least ${requiredGapFrames} frame(s) on each side.`,
    };
  }

  return { ok: true, splitAtSeconds: frameToSeconds(frame, fps) };
}

/** `HH:MM:SS:FF` timecode for a frame index at a given FPS — same format/derivation as `VideoFrameReviewPlayer`'s own internal formatter, reimplemented here (not imported) so this module stays a pure, standalone, independently testable unit with zero dependency on a Client Component. */
export function formatTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalSeconds = Math.floor(frame / safeFps);
  const frames = frame % safeFps;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
