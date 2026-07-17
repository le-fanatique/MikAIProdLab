// ---------------------------------------------------------------------------
// selectSegmentBoundaries.ts — SEQGEN.SPLIT.1
//
// Pure function: no process spawning, no filesystem, no Date.now(). Turns
// raw FFmpeg scene-cut candidates into a proposed N-segment split for N
// expected Shots, by matching each of the N-1 expected boundary positions
// (the Shots' own durations, normalized to the video's REAL duration) to
// the nearest unused detected candidate within a tolerance window. A
// boundary with no reliable nearby candidate falls back to its computed
// expected position — always clearly marked low-confidence
// ("timing-fallback"), never silently presented as a real detection.
//
// Never guarantees exactly N-1 real cuts (FFmpeg's own known limitation,
// documented in claude_report.md) — this is a PROPOSAL the caller persists
// as editable segments; a count/position mismatch is expected to happen and
// is corrected by the user in review (Lot C), never treated as fatal here.
// ---------------------------------------------------------------------------

import type { SceneCandidate } from "./parseFfmpegSceneOutput";

export type BoundaryProvenance = "scene" | "timing-fallback" | "manual";

export type ProposedSegment = {
  orderIndex: number;
  startSeconds: number;
  endSeconds: number;
  /** Null only when the segment's END boundary is the fixed end of the video for a single-Shot Sequence (no cut decision was made at all). */
  confidence: number | null;
  boundaryProvenance: BoundaryProvenance;
};

/** A fallback (non-detected) boundary is always reported at this fixed, clearly-low confidence — never a fabricated high score. */
export const TIMING_FALLBACK_CONFIDENCE = 0.1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function selectSegmentBoundaries(params: {
  videoDurationSeconds: number;
  /** One entry per expected Shot, in Shot order. Missing/non-positive durations are treated defensively (see below) — never cause a crash or a NaN boundary. */
  expectedShotDurations: (number | null | undefined)[];
  /** Raw, unfiltered candidates — already deduplicated/sorted is NOT assumed; this function sorts and dedupes defensively. */
  candidates: SceneCandidate[];
  minSegmentDurationSeconds: number;
  /** Fraction of the average expected Shot duration used as the search tolerance around each target boundary position when looking for a matching candidate — bounded to a sane range internally. */
  candidateSearchToleranceFraction?: number;
}): ProposedSegment[] {
  const { videoDurationSeconds, expectedShotDurations, minSegmentDurationSeconds } = params;
  const n = expectedShotDurations.length;

  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0 || n === 0) {
    return [];
  }

  // Single Shot — the whole video is one segment, never an invented cut.
  if (n === 1) {
    return [
      {
        orderIndex: 0,
        startSeconds: 0,
        endSeconds: round2(videoDurationSeconds),
        confidence: null,
        boundaryProvenance: "timing-fallback",
      },
    ];
  }

  // Defensive duration normalization: a missing/non-positive duration must
  // still receive a POSITIVE, deterministic share of the split — never a
  // zero weight, which would collapse its target boundary onto its
  // neighbor's before the clamping pass even runs. A missing duration is
  // estimated as the mean of the Shots that DO have a valid duration
  // (mirrors this ticket's own "defensive estimate" requirement); if every
  // duration is missing, every Shot falls back to an equal 1-unit share.
  const safeDurations = expectedShotDurations.map((d) => (typeof d === "number" && Number.isFinite(d) && d > 0 ? d : 0));
  const totalPositive = safeDurations.reduce((a, b) => a + b, 0);
  const validCount = safeDurations.filter((d) => d > 0).length;
  const meanValidDuration = validCount > 0 ? totalPositive / validCount : 0;
  const effectiveDurations = safeDurations.map((d) => (d > 0 ? d : meanValidDuration > 0 ? meanValidDuration : 1));
  const totalEffective = effectiveDurations.reduce((a, b) => a + b, 0) || n;

  // Target boundary positions: N-1 cumulative-fraction points, normalized
  // to the REAL video duration (never the sum of expected durations, which
  // will rarely match exactly).
  const targetBoundaries: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < n - 1; i++) {
    cumulative += effectiveDurations[i];
    targetBoundaries.push((cumulative / totalEffective) * videoDurationSeconds);
  }

  const avgShotDuration = totalEffective > 0 ? (totalEffective / n) * (videoDurationSeconds / (totalEffective || 1)) : videoDurationSeconds / n;
  const toleranceFraction = params.candidateSearchToleranceFraction ?? 0.35;
  const searchTolerance = Math.max(0.5, Math.min(avgShotDuration * toleranceFraction, videoDurationSeconds / 4));

  const sortedCandidates = [...params.candidates]
    .filter((c) => Number.isFinite(c.timestampSeconds) && c.timestampSeconds >= 0 && c.timestampSeconds <= videoDurationSeconds)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  const usedCandidateIndexes = new Set<number>();
  const chosenBoundaries: { position: number; confidence: number | null; provenance: BoundaryProvenance }[] = [];

  for (const target of targetBoundaries) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < sortedCandidates.length; i++) {
      if (usedCandidateIndexes.has(i)) continue;
      const distance = Math.abs(sortedCandidates[i].timestampSeconds - target);
      if (distance <= searchTolerance && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      usedCandidateIndexes.add(bestIndex);
      chosenBoundaries.push({ position: sortedCandidates[bestIndex].timestampSeconds, confidence: sortedCandidates[bestIndex].score, provenance: "scene" });
    } else {
      chosenBoundaries.push({ position: target, confidence: TIMING_FALLBACK_CONFIDENCE, provenance: "timing-fallback" });
    }
  }

  // Enforce strictly increasing boundaries within (0, videoDuration) and a
  // minimum segment duration between consecutive boundaries — a forward
  // pass followed by a backward pass, so a local squeeze never cascades
  // into an out-of-range or non-increasing final boundary. This is a
  // best-effort clamp: when the video is genuinely too short for N segments
  // at the requested minimum, the result may compress below
  // `minSegmentDurationSeconds` rather than ever crash or go out of bounds
  // — the caller/UI surfaces the resulting low segment count as a mismatch
  // for the user to resolve, exactly as the ticket requires ("un ecart...
  // n'est pas une erreur fatale").
  const positions = chosenBoundaries.map((b) => b.position);
  for (let i = 0; i < positions.length; i++) {
    const prev = i === 0 ? 0 : positions[i - 1];
    positions[i] = Math.max(positions[i], prev + minSegmentDurationSeconds);
  }
  for (let i = positions.length - 1; i >= 0; i--) {
    const next = i === positions.length - 1 ? videoDurationSeconds : positions[i + 1];
    positions[i] = Math.min(positions[i], next - minSegmentDurationSeconds);
  }
  // Final safety clamp into [0, videoDurationSeconds] and re-enforce
  // monotonicity forward once more (the backward pass above can only ever
  // shrink values, so this cannot undo the forward pass's ordering, but a
  // pathologically short video can still push a position below 0).
  for (let i = 0; i < positions.length; i++) {
    positions[i] = Math.max(0, Math.min(positions[i], videoDurationSeconds));
  }
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] < positions[i - 1]) positions[i] = positions[i - 1];
  }

  const boundaries = [0, ...positions.map(round2), round2(videoDurationSeconds)];
  const segments: ProposedSegment[] = [];
  for (let i = 0; i < n; i++) {
    const boundaryInfo = i === 0 ? null : chosenBoundaries[i - 1];
    segments.push({
      orderIndex: i,
      startSeconds: boundaries[i],
      endSeconds: boundaries[i + 1],
      confidence: boundaryInfo ? boundaryInfo.confidence : (chosenBoundaries[0]?.confidence ?? null),
      boundaryProvenance: boundaryInfo ? boundaryInfo.provenance : (chosenBoundaries[0]?.provenance ?? "timing-fallback"),
    });
  }
  return segments;
}
