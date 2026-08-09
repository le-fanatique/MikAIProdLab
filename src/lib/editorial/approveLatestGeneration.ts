// ---------------------------------------------------------------------------
// approveLatestGeneration.ts — EDITORIAL.LATEST.APPROVAL.1
//
// Pure, Node-free classification only (no `@/db`, no filesystem) so it stays
// unit-testable with plain fixtures, exactly like
// `videoSourceModeShared.ts`'s own pure resolvers. Turns an already-resolved
// `ResolvedShotSource` map (`resolveVideoSourcesForShotList`, the ONE
// canonical resolver — never reproduced here) into the eligible
// (shotId, videoPath) pairs a batch approval may write, plus a skipped
// count for Shots with no usable "latest generation" source. Never decides
// WHETHER a candidate is usable — that judgment already happened inside
// `resolveVideoSourcesForShotList` (ownership confinement + on-disk
// verification); this module only classifies the outcome.
// ---------------------------------------------------------------------------

import type { ResolvedShotSource } from "./videoSourceModeShared";

/**
 * `shotVideoId` is carried alongside `videoPath` (not just the path) so a
 * caller can re-verify, inside its own write transaction, that this
 * candidate is STILL the current deterministic `shot_videos` winner for the
 * Shot — closing the concurrent-mutation window between this (async, DB +
 * filesystem) resolution and a later (synchronous) commit. See
 * `approveLatestGenerationForSequence` (Codex retake P1).
 */
export type EligibleLatestApproval = { shotId: number; videoPath: string; shotVideoId: number };

export type LatestApprovalClassification = {
  eligible: EligibleLatestApproval[];
  skippedCount: number;
};

/**
 * `shotIds` drives iteration order (the Sequence's own ordered Shot list) —
 * `resolved` is looked up per id, never iterated on its own, so an id with
 * no entry (or a rejected/absent candidate) is counted as skipped rather
 * than silently ignored. "latest-generation" mode never resolves an
 * `"approved"` provenance (only `"shot-video"`, or none) — a usable
 * `videoPath` with no `"shot-video"` provenance would be an internal
 * resolver contract violation, not a legitimate candidate, so it is also
 * counted as skipped rather than trusted without a `shotVideoId` to
 * re-verify later.
 */
export function classifyLatestGenerationEligibility(
  shotIds: readonly number[],
  resolved: ReadonlyMap<number, ResolvedShotSource>
): LatestApprovalClassification {
  const eligible: EligibleLatestApproval[] = [];
  let skippedCount = 0;

  for (const shotId of shotIds) {
    const source = resolved.get(shotId);
    const shotVideoId = source?.provenance?.kind === "shot-video" ? source.provenance.shotVideoId : null;
    if (source && source.videoPath !== null && shotVideoId !== null) {
      eligible.push({ shotId, videoPath: source.videoPath, shotVideoId });
    } else {
      skippedCount++;
    }
  }

  return { eligible, skippedCount };
}
