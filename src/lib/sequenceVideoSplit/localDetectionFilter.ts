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
 *      isn't a new boundary — it's noise around the existing one);
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
 */
export function filterLocalCandidates(params: {
  candidates: LocalCandidate[];
  segmentStartSeconds: number;
  segmentEndSeconds: number;
  minGapSeconds: number;
  maxCuts?: number;
}): LocalDetectionFilterResult {
  const { candidates, segmentStartSeconds, segmentEndSeconds, minGapSeconds } = params;
  const maxCuts = params.maxCuts ?? MAX_LOCAL_CUTS;

  const inRange = candidates
    .filter((c) => Number.isFinite(c.timestampSeconds))
    .filter((c) => c.timestampSeconds > segmentStartSeconds + minGapSeconds && c.timestampSeconds < segmentEndSeconds - minGapSeconds)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  const deduped: LocalCandidate[] = [];
  for (const c of inRange) {
    const last = deduped[deduped.length - 1];
    if (!last || c.timestampSeconds - last.timestampSeconds >= minGapSeconds) {
      deduped.push(c);
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
