// ---------------------------------------------------------------------------
// localDetectionFilter.ts — SEQGEN.SPLIT.WORKSPACE.1 (Lot C)
//
// Pure, deterministic filtering of scene-cut candidates found by re-running
// FFmpeg scoped to ONE selected segment's own [start, end] range ("Refine
// Detection in This Segment"). No process spawning, no filesystem, no
// Date.now(). Candidates here are already ABSOLUTE video timestamps (the
// caller is responsible for converting the FFmpeg range command's
// range-relative `pts_time` back to absolute seconds before calling this).
// ---------------------------------------------------------------------------

import { isReliableFps, secondsToFrame, frameToSeconds } from "./frameTime";

export type LocalCandidate = { timestampSeconds: number; score: number | null };

/** Hard cap on how many new cuts a single local-refine operation may accept — a threshold producing more than this is refused outright (never silently truncated) as "dangerous/noisy," asking the user for a higher threshold instead. */
export const MAX_LOCAL_CUTS = 20;

export type LocalDetectionFilterResult =
  | { ok: true; candidates: LocalCandidate[] }
  | { ok: false; reason: "no-candidates" }
  | { ok: false; reason: "too-many-candidates"; rejectedCount: number };

/**
 * Filters raw local candidates down to the ones usable as new segment
 * boundaries inside `[segmentStartSeconds, segmentEndSeconds]`:
 *   1. drop anything outside the segment, or within `minGapSeconds` of
 *      either of the segment's OWN edges (a "cut" that close to an edge
 *      isn't a new boundary — it's noise around the existing one) — a
 *      candidate exactly `minGapSeconds` away from an edge (e.g. exactly 1
 *      source frame in from a CFR segment's own boundary, the ticket's own
 *      "1 frame minimum" case) is KEPT, never rejected for merely equaling
 *      the floor;
 *   2. sort ascending, then deterministically de-duplicate: a candidate is
 *      kept only if it is at least `minGapSeconds` away from the
 *      PREVIOUSLY KEPT candidate (greedy left-to-right — never reconsiders
 *      a dropped candidate, so the result is fully deterministic for a
 *      given input);
 *   3. if nothing survives, `{ ok: false, reason: "no-candidates" }` — the
 *      caller must mutate nothing and suggest lowering the threshold,
 *      reducing the minimum duration, or using "Split at Current Frame";
 *   4. if more than `maxCuts` survive, `{ ok: false, reason:
 *      "too-many-candidates" }` — refused outright (never an arbitrary
 *      truncation to the first N), asking for a higher threshold instead.
 *
 * REVISE (SEQGEN.SPLIT.MINFRAMES.1, Lot B) — when `fps` is a proven-CFR,
 * reliable rate (the caller is responsible for only passing a value here
 * once `frameRateMode === "cfr"` has been confirmed, never a numerically
 * plausible `fps` alone), every comparison is done in integer frame-index
 * space, never approximate seconds floats: this is what lets a candidate
 * sitting exactly on `startFrame + minGapFrames` be kept (the old
 * strict-`>` seconds comparison could reject it purely due to float
 * rounding) while one sitting exactly ON the edge is still refused. On
 * VFR/unknown (`fps` omitted/unreliable), the original high-precision
 * seconds comparison is used unchanged, with an inclusive `>=`/`<=` bound
 * so a candidate exactly `minGapSeconds` from an edge is likewise kept.
 */
export function filterLocalCandidates(params: {
  candidates: LocalCandidate[];
  segmentStartSeconds: number;
  segmentEndSeconds: number;
  minGapSeconds: number;
  fps?: number | null;
  maxCuts?: number;
}): LocalDetectionFilterResult {
  const { candidates, segmentStartSeconds, segmentEndSeconds, minGapSeconds, fps } = params;
  const maxCuts = params.maxCuts ?? MAX_LOCAL_CUTS;

  const finiteCandidates = candidates.filter((c) => Number.isFinite(c.timestampSeconds));
  let deduped: LocalCandidate[] = [];

  if (isReliableFps(fps)) {
    const startFrame = secondsToFrame(segmentStartSeconds, fps);
    const endFrame = secondsToFrame(segmentEndSeconds, fps);
    const gapFrames = secondsToFrame(minGapSeconds, fps);

    const inRangeFrames = finiteCandidates
      .map((c) => ({ ...c, frame: secondsToFrame(c.timestampSeconds, fps) }))
      .filter((c) => c.frame >= startFrame + gapFrames && c.frame <= endFrame - gapFrames)
      .sort((a, b) => a.frame - b.frame);

    const dedupedFrames: { frame: number; score: number | null }[] = [];
    for (const c of inRangeFrames) {
      const last = dedupedFrames[dedupedFrames.length - 1];
      if (!last || c.frame - last.frame >= gapFrames) {
        dedupedFrames.push({ frame: c.frame, score: c.score });
      }
    }
    deduped = dedupedFrames.map((c) => ({ timestampSeconds: frameToSeconds(c.frame, fps), score: c.score }));
  } else {
    const inRange = finiteCandidates
      .filter((c) => c.timestampSeconds >= segmentStartSeconds + minGapSeconds && c.timestampSeconds <= segmentEndSeconds - minGapSeconds)
      .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
    for (const c of inRange) {
      const last = deduped[deduped.length - 1];
      if (!last || c.timestampSeconds - last.timestampSeconds >= minGapSeconds) {
        deduped.push(c);
      }
    }
  }

  if (deduped.length === 0) {
    return { ok: false, reason: "no-candidates" };
  }
  if (deduped.length > maxCuts) {
    return { ok: false, reason: "too-many-candidates", rejectedCount: deduped.length };
  }
  return { ok: true, candidates: deduped };
}
