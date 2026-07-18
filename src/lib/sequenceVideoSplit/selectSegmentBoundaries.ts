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
import { roundBoundarySeconds, resolveMinGapSeconds, isReliableFps, secondsToFrame, frameToSeconds } from "./frameTime";

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

export function selectSegmentBoundaries(params: {
  videoDurationSeconds: number;
  /** One entry per expected Shot, in Shot order. Missing/non-positive durations are treated defensively (see below) — never cause a crash or a NaN boundary. */
  expectedShotDurations: (number | null | undefined)[];
  /** Raw, unfiltered candidates — already deduplicated/sorted is NOT assumed; this function sorts and dedupes defensively. */
  candidates: SceneCandidate[];
  /**
   * The user's REQUESTED minimum separation — never used directly. Passed
   * through `resolveMinGapSeconds(minSegmentDurationSeconds, sourceFps)`
   * (SEQGEN.SPLIT.MINFRAMES.1, Lot A) to get the actually-enforced minimum:
   * `0` means "exactly 1 source frame" on CFR (never a bigger fixed
   * constant), or a high-precision epsilon on VFR/unknown; a positive value
   * still imposes a deliberately larger minimum.
   */
  minSegmentDurationSeconds: number;
  /**
   * REVISE (SEQGEN.SPLIT.WORKSPACE.1, Lot D) — the run's probed source FPS,
   * when reliable (see `isReliableFps` in frameTime.ts). Every final
   * boundary is quantized to the EXACT seconds-value of its nearest frame
   * at this FPS instead of the old destructive fixed 2-decimal `round2`
   * (which could shift a boundary by up to ±0.005s — more than a full
   * frame at high FPS or for a very short Shot). When FPS is missing/
   * unreliable (VFR source), a high-precision (6-decimal) fallback is used
   * instead — never a frame-snap the source cannot actually honor.
   */
  sourceFps?: number | null;
  /** Fraction of the average expected Shot duration used as the search tolerance around each target boundary position when looking for a matching candidate — bounded to a sane range internally. */
  candidateSearchToleranceFraction?: number;
}): ProposedSegment[] {
  const { videoDurationSeconds, expectedShotDurations, minSegmentDurationSeconds, sourceFps } = params;
  const n = expectedShotDurations.length;
  const round = (seconds: number) => roundBoundarySeconds(seconds, sourceFps);

  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0 || n === 0) {
    return [];
  }

  // Single Shot — the whole video is one segment, never an invented cut.
  // REVISE (SEQGEN.SPLIT.WORKSPACE.1-FIX1) — the END here is the video's
  // own EOF, not a cut: it must stay exactly `videoDurationSeconds` (the
  // high-precision FFprobe duration), never passed through `round()`.
  // Quantizing it to the nearest frame (e.g. 15.104s @ 24fps -> 15.083333s)
  // was the exact bug this fix closes — the container's real duration is
  // frequently not an integer multiple of the frame duration, and rounding
  // the EOF down created a plan that could never validate against its own
  // source duration.
  if (n === 1) {
    return [
      {
        orderIndex: 0,
        startSeconds: 0,
        endSeconds: videoDurationSeconds,
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

  // REVISE (SEQGEN.SPLIT.MINFRAMES.1, Lot B) — on CFR, every raw candidate is
  // quantized to its nearest frame FIRST, before any matching/clamping ever
  // reads its timestamp. Filtering first and quantizing survivors afterward
  // (the old order) could silently move a boundary onto the same frame as a
  // neighbor or an edge, a collision the raw-timestamp matching never saw —
  // exactly the same reasoning already applied to local re-detection
  // (`detectSplitsInSegment`). On VFR/unknown, `round` is the unchanged
  // high-precision fallback and candidates are left as-is.
  const reliable = isReliableFps(sourceFps);
  const quantizedCandidates = params.candidates
    .filter((c) => Number.isFinite(c.timestampSeconds) && c.timestampSeconds >= 0 && c.timestampSeconds <= videoDurationSeconds)
    .map((c) => (reliable ? { ...c, timestampSeconds: round(c.timestampSeconds) } : c));

  let sortedCandidates: SceneCandidate[];
  if (reliable) {
    // REVISE (Codex round 1) — two distinct raw FFmpeg timestamps quantizing
    // onto the SAME frame must become exactly one candidate here, before
    // matching ever runs — otherwise both could independently "win" two
    // different target boundaries as fabricated, duplicate `scene`
    // detections. Deterministic keep rule: highest `score` for that frame,
    // then first-in-input-order on a tie (never an arbitrary/unstable pick).
    const fps = sourceFps as number;
    const byFrame = new Map<number, SceneCandidate>();
    for (const c of quantizedCandidates) {
      const frame = secondsToFrame(c.timestampSeconds, fps);
      const existing = byFrame.get(frame);
      if (!existing || (c.score ?? -Infinity) > (existing.score ?? -Infinity)) {
        byFrame.set(frame, c);
      }
    }
    sortedCandidates = [...byFrame.values()].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  } else {
    sortedCandidates = [...quantizedCandidates].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  }

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
  // at the effective minimum, the result may compress below it rather than
  // ever crash or go out of bounds — the caller/UI surfaces the resulting
  // low segment count as a mismatch for the user to resolve, exactly as the
  // ticket requires ("un ecart... n'est pas une erreur fatale").
  //
  // REVISE (SEQGEN.SPLIT.MINFRAMES.1, Lot A/B) — the enforced minimum is
  // `resolveMinGapSeconds(minSegmentDurationSeconds, sourceFps)`, never the
  // raw requested value: on CFR this floors at exactly 1 frame and every
  // comparison below happens in integer frame-index space (never
  // approximate floats), so a cut that legitimately leaves exactly 1 frame
  // on a side is preserved rather than squeezed away by float rounding.
  const effectiveMinGapSeconds = resolveMinGapSeconds(minSegmentDurationSeconds, reliable ? sourceFps : null);
  const positions = chosenBoundaries.map((b) => b.position);

  if (reliable) {
    const fps = sourceFps as number;
    const gapFrames = secondsToFrame(effectiveMinGapSeconds, fps);
    const durationFrame = secondsToFrame(videoDurationSeconds, fps);
    const posFrames = positions.map((p) => secondsToFrame(p, fps));
    for (let i = 0; i < posFrames.length; i++) {
      const prev = i === 0 ? 0 : posFrames[i - 1];
      posFrames[i] = Math.max(posFrames[i], prev + gapFrames);
    }
    for (let i = posFrames.length - 1; i >= 0; i--) {
      const next = i === posFrames.length - 1 ? durationFrame : posFrames[i + 1];
      posFrames[i] = Math.min(posFrames[i], next - gapFrames);
    }
    for (let i = 0; i < posFrames.length; i++) {
      posFrames[i] = Math.max(0, Math.min(posFrames[i], durationFrame));
    }
    for (let i = 1; i < posFrames.length; i++) {
      if (posFrames[i] < posFrames[i - 1]) posFrames[i] = posFrames[i - 1];
    }
    for (let i = 0; i < positions.length; i++) {
      positions[i] = frameToSeconds(posFrames[i], fps);
    }
  } else {
    for (let i = 0; i < positions.length; i++) {
      const prev = i === 0 ? 0 : positions[i - 1];
      positions[i] = Math.max(positions[i], prev + effectiveMinGapSeconds);
    }
    for (let i = positions.length - 1; i >= 0; i--) {
      const next = i === positions.length - 1 ? videoDurationSeconds : positions[i + 1];
      positions[i] = Math.min(positions[i], next - effectiveMinGapSeconds);
    }
    // Final safety clamp into [0, videoDurationSeconds] and re-enforce
    // monotonicity forward once more (the backward pass above can only
    // ever shrink values, so this cannot undo the forward pass's ordering,
    // but a pathologically short video can still push a position below 0).
    for (let i = 0; i < positions.length; i++) {
      positions[i] = Math.max(0, Math.min(positions[i], videoDurationSeconds));
    }
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) positions[i] = positions[i - 1];
    }
  }

  // REVISE (SEQGEN.SPLIT.WORKSPACE.1-FIX1) — only the INTERNAL cut
  // boundaries (`positions`) are frame-quantized; the absolute start (0,
  // never a cut) and the absolute end (the video's own EOF, never a cut
  // either) stay exactly `videoDurationSeconds` — see the `n === 1` branch
  // above for the full reasoning.
  const boundaries = [0, ...positions.map(round), videoDurationSeconds];
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
