"use server";

// ---------------------------------------------------------------------------
// sequenceVideoSplitSegments.ts — SEQGEN.SPLIT.1
//
// Lot C — review and correction, pure DB + thumbnail regeneration, no clip
// cutting, no Shot mutation. Split from the former
// `src/actions/sequenceVideoSplit.ts` by IND.SPLIT.1 — see
// `src/actions/sequenceVideoSplitDetection.ts`,
// `src/actions/sequenceVideoSplitCleanup.ts`, and
// `src/actions/sequenceVideoSplitValidate.ts` for the rest.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import {
  resolveSequenceVideoDraftAbsolutePath,
  deleteSegmentThumbnail,
  generateSegmentThumbnail,
  runFfmpegSceneDetectionInRange,
  parseFrameRateModeFromParamsJson,
  type ThumbnailFrameStrategy,
} from "@/lib/sequenceVideoSplit/detectVideoSplits";
import { parseFfmpegSceneOutput } from "@/lib/sequenceVideoSplit/parseFfmpegSceneOutput";
import { filterLocalCandidates } from "@/lib/sequenceVideoSplit/localDetectionFilter";
import type { BoundaryProvenance } from "@/lib/sequenceVideoSplit/selectSegmentBoundaries";
import {
  DEFAULT_SCENE_THRESHOLD,
  MIN_SCENE_THRESHOLD,
  MAX_SCENE_THRESHOLD,
  MIN_MIN_SEGMENT_DURATION,
  MAX_MIN_SEGMENT_DURATION,
  parseStrictBoundedFloat,
} from "@/lib/sequenceVideoSplit/detectionParams";
import { validateFrameSplit, roundBoundarySeconds, resolveMinGapSeconds, resolveBoundaryValue } from "@/lib/sequenceVideoSplit/frameTime";
import { resolveRunFps, errRedirectTo, okRedirectTo, splitOkRedirectTo, renumber } from "@/lib/sequenceVideoSplit/actionHelpers";

async function loadEditableRun(runId: number, sequenceId: number) {
  const [run] = await db.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId));
  if (!run) throw new Error("Split run not found.");
  if (run.sequenceId !== sequenceId) throw new Error("Split run does not belong to this Sequence.");
  if (run.status !== "ready") throw new Error("This Split Plan can no longer be edited (not in a ready state, or already validated).");
  return run;
}

async function loadRunSegments(runId: number) {
  return db.select().from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.splitRunId, runId)).orderBy(asc(sequenceVideoSplitSegments.orderIndex));
}

/**
 * Regenerates a segment's thumbnail, writes the new path to the DB, and
 * ONLY THEN cleans up the OLD thumbnail file the segment used to reference
 * — used by every action that changes a segment's boundaries in place
 * (Adjust, Split, the retained side of Merge). Generating with the
 * segment's stable DB id as the key overwrites the same filename on every
 * SUBSEQUENT edit, but the very FIRST edit after detection switches the key
 * from the initial batch's `initial-<orderIndex>` to `<segment.id>` — a
 * genuinely different filename — which is exactly the orphan Codex
 * reproduced on the real dev run.
 *
 * REVISE (round 3) — strict ordering, because the DB row and the
 * filesystem are two independent systems that can each fail independently:
 *   1. keep the OLD path (already have it, from the caller's fresh SELECT);
 *   2. generate the NEW file (old file/pointer untouched so far);
 *   3. write the NEW path to the DB — ONLY if this succeeds do we proceed;
 *   4. only AFTER the DB write commits, delete the OLD file (if different).
 * If the DB write fails (network/lock/disk), the newly-generated file (not
 * yet referenced by anything) is removed instead — the OLD pointer and OLD
 * file are left completely intact, so the segment never ends up with a
 * broken reference.
 *
 * REVISE (round 4) — a GENERATION failure is handled differently from a
 * round-3 DB-write failure: by the time this helper runs, the calling
 * action's own transaction has ALREADY committed the new start/end
 * boundaries. The OLD thumbnail file is therefore not just "still working"
 * — it was rendered from boundaries that no longer exist and is now
 * semantically stale, exactly the "never display a known-stale thumbnail"
 * case the ticket calls out. So on a generation failure the pointer is
 * explicitly invalidated to `null` (DB write first, old file deleted only
 * after that succeeds — same DB-before-filesystem ordering as the nominal
 * path) rather than left pointing at outdated content.
 *
 * Every failure (generation, either DB write, or either cleanup) is
 * returned as an actionable `warning`, never silently dropped.
 */
async function regenerateThumbnailAndCleanup(
  sourceAbsolutePath: string,
  segment: { id: number; startSeconds: number; endSeconds: number; thumbnailPath: string | null },
  runId: number,
  frameStrategy: ThumbnailFrameStrategy = "midpoint"
): Promise<{ warning: string | null }> {
  const oldPath = segment.thumbnailPath;
  const result = await generateSegmentThumbnail(sourceAbsolutePath, segment, String(runId), String(segment.id), frameStrategy);

  if (!result.ok) {
    const warnings: string[] = [result.error];
    try {
      // Invalidate FIRST — DB before filesystem, same ordering discipline
      // as the nominal path below — so a DB failure here never causes the
      // old (now-stale) file to be deleted while some other row/cache
      // might still reference it.
      await db.update(sequenceVideoSplitSegments).set({ thumbnailPath: null }).where(eq(sequenceVideoSplitSegments.id, segment.id));
    } catch (e) {
      warnings.push(
        `Failed to invalidate the now-stale thumbnail reference (it will keep showing outdated boundaries until the next edit): ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      return { warning: warnings.join(" ") };
    }
    if (oldPath) {
      const cleanup = await deleteSegmentThumbnail(oldPath);
      if (!cleanup.ok) warnings.push(cleanup.error);
    }
    return { warning: warnings.join(" ") };
  }

  const newPath = result.path;
  const warnings: string[] = [];

  try {
    await db.update(sequenceVideoSplitSegments).set({ thumbnailPath: newPath }).where(eq(sequenceVideoSplitSegments.id, segment.id));
  } catch (e) {
    // DB write failed — roll back the filesystem side instead: remove the
    // orphaned NEW file (never the old one, which the DB still points to).
    if (newPath !== oldPath) {
      const cleanup = await deleteSegmentThumbnail(newPath);
      if (!cleanup.ok) warnings.push(cleanup.error);
    }
    warnings.push(`Failed to save the new thumbnail reference: ${e instanceof Error ? e.message : String(e)}`);
    return { warning: warnings.join(" ") };
  }

  // DB write committed — now safe to delete the old file, if it's a
  // different, now-unreferenced path.
  if (oldPath && oldPath !== newPath) {
    const cleanup = await deleteSegmentThumbnail(oldPath);
    if (!cleanup.ok) warnings.push(cleanup.error);
  }

  return { warning: warnings.length > 0 ? warnings.join(" ") : null };
}

// ---- Adjust a shared boundary (numeric) — moving segment[i]'s end also moves segment[i+1]'s start, guaranteeing no gap/overlap can ever be created by construction. The very first start (0) and very last end (source duration) are fixed. ----

export async function adjustSegmentBoundary(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const field = (formData.get("field") as string | null) === "start" ? "start" : "end";
  const rawValue = (formData.get("valueSeconds") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;

  try {
    const run = await loadEditableRun(runId, sequenceId);
    const value = parseStrictBoundedFloat(rawValue, 0, run.sourceDurationSeconds);
    if (value === null) throw new Error(`Boundary must be a number between 0 and ${run.sourceDurationSeconds.toFixed(2)}.`);

    const segments = await loadRunSegments(runId);
    const index = segments.findIndex((s) => s.id === segmentId);
    if (index === -1) throw new Error("Segment not found in this run.");

    // SEQGEN.SPLIT.MINFRAMES.1, Lot A/C — the old fixed `MIN_GAP = 0.05`
    // could exceed a full frame at high FPS (12 frames at 240fps) or refuse
    // a legitimate 1-frame gap. `resolveBoundaryValue` replaces it: on CFR
    // it quantizes `value` to its nearest frame and compares in integer
    // frame-index space (a boundary exactly 1 frame from an edge is
    // accepted); on VFR/unknown it stays high-precision seconds. Either way
    // the value actually written to the DB is `resolution.valueSeconds`
    // (server-authoritative), never the raw client-parsed `value`.
    const fps = resolveRunFps(run);

    if (field === "start") {
      if (index === 0) throw new Error("The first segment always starts at 0 and cannot be moved.");
      const prev = segments[index - 1];
      const current = segments[index];
      const resolution = resolveBoundaryValue({ valueSeconds: value, lowerBoundSeconds: prev.startSeconds, upperBoundSeconds: current.endSeconds, fps });
      if (!resolution.ok) throw new Error("The new boundary would create a zero-length or overlapping segment.");
      const boundaryValue = resolution.valueSeconds;
      db.transaction((tx) => {
        const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
        if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
        tx.update(sequenceVideoSplitSegments).set({ endSeconds: boundaryValue, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, prev.id)).run();
        tx.update(sequenceVideoSplitSegments).set({ startSeconds: boundaryValue, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, current.id)).run();
      });
    } else {
      if (index === segments.length - 1) throw new Error("The last segment always ends at the source duration and cannot be moved.");
      const current = segments[index];
      const next = segments[index + 1];
      const resolution = resolveBoundaryValue({ valueSeconds: value, lowerBoundSeconds: current.startSeconds, upperBoundSeconds: next.endSeconds, fps });
      if (!resolution.ok) throw new Error("The new boundary would create a zero-length or overlapping segment.");
      const boundaryValue = resolution.valueSeconds;
      db.transaction((tx) => {
        const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
        if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
        tx.update(sequenceVideoSplitSegments).set({ endSeconds: boundaryValue, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, current.id)).run();
        tx.update(sequenceVideoSplitSegments).set({ startSeconds: boundaryValue, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, next.id)).run();
      });
    }

    // Thumbnails invalidated (regenerated) for every segment whose boundary
    // moved — best-effort, never blocks the edit itself if ffmpeg fails,
    // but any generation OR old-thumbnail-cleanup failure is surfaced as a
    // warning, never silently dropped.
    const sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
    const refreshed = await loadRunSegments(runId);
    const toRefresh = field === "start" ? [refreshed[index - 1], refreshed[index]] : [refreshed[index], refreshed[index + 1]];
    const segmentWarnings: string[] = [];
    for (const seg of toRefresh) {
      const { warning: segWarning } = await regenerateThumbnailAndCleanup(sourceAbsolutePath, seg, runId);
      if (segWarning) segmentWarnings.push(segWarning);
    }
    if (segmentWarnings.length > 0) warning = segmentWarnings.join(" ");
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to adjust boundary.");
  }

  okRedirectTo(returnTo, "splitEdited", warning ?? undefined);
}

// ---- Split: insert a cut at an explicit timestamp inside one segment ----

/**
 * Shared core for both `splitSegmentAt` (raw seconds, manual/VFR-safe) and
 * `splitSegmentAtFrame` (frame-exact, SEQGEN.SPLIT.WORKSPACE.1 Lot B) — both
 * ultimately insert a cut at a server-validated `splitAtSeconds` inside one
 * segment. Kept as one implementation so the two entry points can never
 * silently diverge in DB/thumbnail behavior.
 *
 * REVISE (SEQGEN.SPLIT.MINFRAMES.1, Lot A/C) — replaces the old fixed
 * `SPLIT_MIN_GAP_SECONDS = 0.05` universal guard (12 frames at 240fps) with
 * `resolveBoundaryValue`: on CFR the requested split point is quantized to
 * its nearest frame and validated in integer frame-index space, leaving a
 * cut that results in exactly 1 frame on either side; on VFR/unknown it
 * stays a strictly-positive high-precision check. `requestedSplitAtSeconds`
 * is never trusted directly — only `resolution.valueSeconds` (the
 * server-quantized value) is ever persisted.
 *
 * REVISE (SEQGEN.SPLIT.CLEANUP.1 retakes) — the newly-inserted second
 * half's id is now captured directly from the INSERT's own `.returning()`,
 * never re-derived afterward by matching `startSeconds === splitAtSeconds`
 * (`FB-20260719-002`: exactly the float-comparison guess the retake
 * forbids — the id is now known with certainty the instant the row is
 * created). Both halves' thumbnails are regenerated with
 * `frameStrategy: "segment-start"` (`FB-20260719-001`): each must show its
 * own real first frame, and the second half in particular must show
 * exactly the frame the cut created, not a re-averaged midpoint.
 */
async function performSplitAtSeconds(
  runId: number,
  sequenceId: number,
  segmentId: number,
  requestedSplitAtSeconds: number
): Promise<{ warning: string | null; newSegmentId: number }> {
  const run = await loadEditableRun(runId, sequenceId);
  const segments = await loadRunSegments(runId);
  const target = segments.find((s) => s.id === segmentId);
  if (!target) throw new Error("Segment not found in this run.");

  const fps = resolveRunFps(run);
  const resolution = resolveBoundaryValue({ valueSeconds: requestedSplitAtSeconds, lowerBoundSeconds: target.startSeconds, upperBoundSeconds: target.endSeconds, fps });
  if (!resolution.ok) {
    throw new Error("Split point must be strictly inside the segment (not touching either edge).");
  }
  const splitAtSeconds = resolution.valueSeconds;

  const after = segments.filter((s) => s.orderIndex > target.orderIndex);

  let newSegmentId!: number;

  db.transaction((tx) => {
    const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
    if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");

    // Shrink the original into the first half, unassign it (mapping is
    // now ambiguous — the user must explicitly re-map both halves).
    tx.update(sequenceVideoSplitSegments)
      .set({ endSeconds: splitAtSeconds, status: "pending", targetShotId: null, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() })
      .where(eq(sequenceVideoSplitSegments.id, target.id))
      .run();

    // Second half — new row, inserted right after, orderIndex/others
    // renumbered below (outside the transaction, via a fresh SELECT+bulk
    // update pass) to keep this insert simple and avoid a self-referential
    // ordering conflict inside the same transaction. `.returning({id})`
    // captures the exact new row's id — the only source of truth for which
    // segment is "the newly inserted second half," never a later lookup.
    const [inserted] = tx
      .insert(sequenceVideoSplitSegments)
      .values({
        splitRunId: runId,
        orderIndex: target.orderIndex + 1,
        startSeconds: splitAtSeconds,
        endSeconds: target.endSeconds,
        confidence: null,
        boundaryProvenance: "manual",
        status: "pending",
        thumbnailPath: null,
      })
      .returning({ id: sequenceVideoSplitSegments.id })
      .all() as unknown as { id: number }[];
    newSegmentId = inserted.id;

    // Shift every following segment's orderIndex up by one to make room.
    for (const seg of after) {
      tx.update(sequenceVideoSplitSegments).set({ orderIndex: seg.orderIndex + 1 }).where(eq(sequenceVideoSplitSegments.id, seg.id)).run();
    }
  });

  // firstHalf's `thumbnailPath` (from this fresh SELECT) is still the OLD
  // file — the transaction above never touched that column — so passing
  // it straight into the shared helper lets it detect and clean up the
  // stale file exactly like Adjust does. secondHalf is a brand-new row
  // with `thumbnailPath: null`, so there is nothing old to clean up for it.
  // Both are looked up by their own known, certain ids (`target.id` /
  // `newSegmentId`) — never by re-matching a boundary value.
  const sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
  const refreshed = await loadRunSegments(runId);
  const firstHalf = refreshed.find((s) => s.id === target.id)!;
  const secondHalf = refreshed.find((s) => s.id === newSegmentId)!;
  const segmentWarnings: string[] = [];
  for (const seg of [firstHalf, secondHalf]) {
    const { warning: segWarning } = await regenerateThumbnailAndCleanup(sourceAbsolutePath, seg, runId, "segment-start");
    if (segWarning) segmentWarnings.push(segWarning);
  }
  return { warning: segmentWarnings.length > 0 ? segmentWarnings.join(" ") : null, newSegmentId };
}

export async function splitSegmentAt(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const rawAt = (formData.get("splitAtSeconds") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;
  let newSegmentId: number;

  try {
    const segments = await loadRunSegments(runId);
    const target = segments.find((s) => s.id === segmentId);
    if (!target) throw new Error("Segment not found in this run.");
    // Only a loose sanity bound here — the actual minimum-gap/frame-exact
    // policy is applied authoritatively by `performSplitAtSeconds` below
    // (SEQGEN.SPLIT.MINFRAMES.1), which knows the run's real FPS.
    const splitAt = parseStrictBoundedFloat(rawAt, target.startSeconds, target.endSeconds);
    if (splitAt === null) throw new Error("Split point must be a number within the segment's own range.");

    const result = await performSplitAtSeconds(runId, sequenceId, segmentId, splitAt);
    warning = result.warning;
    newSegmentId = result.newSegmentId;
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to split segment.");
  }

  // REVISE (FIX3/FIX4) — numeric Split keeps its historical redirect: no
  // anchor here, only `splitSegmentAtFrame` gets one.
  splitOkRedirectTo(returnTo, newSegmentId, { warning: warning ?? undefined });
}

// ---- Split at Current Frame (SEQGEN.SPLIT.WORKSPACE.1, Lot B) — frame-exact, server-derived from the run's own FPS snapshot ----

export async function splitSegmentAtFrame(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const rawFrame = (formData.get("frame") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;
  let newSegmentId: number;

  try {
    if (!/^\d+$/.test(rawFrame)) throw new Error("Frame must be a non-negative whole number.");
    const frame = parseInt(rawFrame, 10);

    const run = await loadEditableRun(runId, sequenceId);
    const segments = await loadRunSegments(runId);
    const target = segments.find((s) => s.id === segmentId);
    if (!target) throw new Error("Segment not found in this run.");

    // REVISE (round 2, finding 2) — a numerically plausible `sourceFps` is
    // NOT sufficient proof of a constant frame rate: a run persisted before
    // `frameRateMode` existed, or whose source was later found to be VFR,
    // must still be refused here even if the UI's own gating were ever
    // bypassed (e.g. a stale form resubmission). This mirrors the UI's own
    // `frameSplitAvailable` check exactly, but is the authoritative one —
    // the UI hiding the button is only a courtesy.
    if (parseFrameRateModeFromParamsJson(run.paramsJson) !== "cfr") {
      throw new Error(
        "This run has no verified constant frame rate (missing, VFR, or predates frame-rate verification) — frame-exact splitting is not available. Run detection again, or use the numeric Split control instead."
      );
    }

    // The server NEVER trusts a client-supplied timestamp directly — only a
    // frame index, re-derived into seconds through the run's own
    // snapshotted FPS (never the player's/client's own notion of FPS).
    // SEQGEN.SPLIT.MINFRAMES.1, Lot A — the absolute floor (1 source frame),
    // never the old fixed `SPLIT_MIN_GAP_SECONDS = 0.05`. `validateFrameSplit`
    // itself already floors `Math.round(minGapSeconds * fps)` at 1, so
    // passing exactly 1 frame's worth of seconds here is a no-op on top of
    // that floor, not a second competing constant.
    const validation = validateFrameSplit({
      frame,
      fps: run.sourceFps ?? NaN,
      segmentStartSeconds: target.startSeconds,
      segmentEndSeconds: target.endSeconds,
      minGapSeconds: resolveMinGapSeconds(0, run.sourceFps),
    });
    if (!validation.ok) throw new Error(validation.error);

    const result = await performSplitAtSeconds(runId, sequenceId, segmentId, validation.splitAtSeconds);
    warning = result.warning;
    newSegmentId = result.newSegmentId;
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to split at the current frame.");
  }

  // REVISE (FIX4) — native URL anchor to the resizable player container
  // (was the segment bar in FIX3), so the browser itself scrolls there on
  // navigation — no scroll JavaScript of any kind.
  splitOkRedirectTo(returnTo, newSegmentId, { warning: warning ?? undefined, hashAnchor: "split-video-player" });
}

// ---- Refine Detection in This Segment (SEQGEN.SPLIT.WORKSPACE.1, Lot C) — local FFmpeg re-detection scoped to one segment's own [start, end] range ----

export async function detectSplitsInSegment(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  const rawThreshold = (formData.get("localSceneThreshold") as string | null)?.trim() ?? "";
  const localSceneThreshold =
    rawThreshold === "" ? DEFAULT_SCENE_THRESHOLD : parseStrictBoundedFloat(rawThreshold, MIN_SCENE_THRESHOLD, MAX_SCENE_THRESHOLD);
  const rawMinDuration = (formData.get("localMinSegmentDurationSeconds") as string | null)?.trim() ?? "";
  const localMinSegmentDuration =
    rawMinDuration === "" ? MIN_MIN_SEGMENT_DURATION : parseStrictBoundedFloat(rawMinDuration, MIN_MIN_SEGMENT_DURATION, MAX_MIN_SEGMENT_DURATION);
  let warning: string | undefined;

  try {
    if (localSceneThreshold === null) {
      throw new Error(`Local scene threshold must be a number between ${MIN_SCENE_THRESHOLD} and ${MAX_SCENE_THRESHOLD}.`);
    }
    if (localMinSegmentDuration === null) {
      throw new Error(`Local minimum segment duration must be a number between ${MIN_MIN_SEGMENT_DURATION} and ${MAX_MIN_SEGMENT_DURATION} seconds.`);
    }

    const run = await loadEditableRun(runId, sequenceId);
    const segments = await loadRunSegments(runId);
    const target = segments.find((s) => s.id === segmentId);
    if (!target) throw new Error("Segment not found in this run.");

    const sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
    const rangeDuration = target.endSeconds - target.startSeconds;

    // Local FFmpeg detection scoped ONLY to this segment's own range — no
    // other segment's frames are ever read or reanalyzed. `pts_time` values
    // are range-relative; converted to absolute video timestamps
    // immediately, in this one place, before anything else touches them.
    const stderrText = await runFfmpegSceneDetectionInRange(sourceAbsolutePath, localSceneThreshold, target.startSeconds, rangeDuration);
    const localCandidates = parseFfmpegSceneOutput(stderrText);

    // REVISE (round 2, finding 4) — quantize to the run's own frame
    // precision BEFORE filtering, never after: filtering on raw timestamps
    // and THEN snapping the survivors to the nearest frame can silently
    // move two distinct, validly-spaced candidates onto the SAME frame
    // (a collision the raw-timestamp check never saw), or push a candidate
    // that legitimately cleared `minGapSeconds` back under it once rounded.
    // Quantizing first and filtering the quantized values means the
    // dedupe/min-gap/edge checks below are evaluated against the EXACT
    // values that will actually be persisted.
    // SEQGEN.SPLIT.MINFRAMES.1 — `effectiveFps` is authoritative CFR (never
    // `run.sourceFps` alone); both the quantization above and the filter's
    // own frame-index comparisons below must agree on the exact same FPS.
    const effectiveFps = resolveRunFps(run);
    const absoluteCandidates = localCandidates.map((c) => ({
      ...c,
      timestampSeconds: roundBoundarySeconds(c.timestampSeconds + target.startSeconds, effectiveFps),
    }));

    const filtered = filterLocalCandidates({
      candidates: absoluteCandidates,
      segmentStartSeconds: target.startSeconds,
      segmentEndSeconds: target.endSeconds,
      minGapSeconds: resolveMinGapSeconds(localMinSegmentDuration, effectiveFps),
      fps: effectiveFps,
    });

    if (!filtered.ok) {
      if (filtered.reason === "no-candidates") {
        throw new Error(
          "No reliable cut was found inside this segment at the current local settings. Try lowering the local scene threshold, reducing the local minimum duration, or use Split at Current Frame instead."
        );
      }
      throw new Error(
        `This local threshold produced ${filtered.rejectedCount} candidate cuts inside one segment — refusing as noisy/unsafe. Raise the local scene threshold and try again.`
      );
    }

    const boundaries = [target.startSeconds, ...filtered.candidates.map((c) => c.timestampSeconds), target.endSeconds];
    const subSegmentCount = boundaries.length - 1;

    const after = segments.filter((s) => s.orderIndex > target.orderIndex);
    const orderShift = subSegmentCount - 1;

    let insertedIds: number[] = [];
    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");

      // Shift every following segment's orderIndex to make room for the
      // new sub-segments FIRST (descending order avoids any transient
      // collision with the still-present target row or with each other).
      for (const seg of [...after].sort((a, b) => b.orderIndex - a.orderIndex)) {
        tx.update(sequenceVideoSplitSegments).set({ orderIndex: seg.orderIndex + orderShift }).where(eq(sequenceVideoSplitSegments.id, seg.id)).run();
      }

      tx.delete(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, target.id)).run();

      const ids: number[] = [];
      for (let i = 0; i < subSegmentCount; i++) {
        const [inserted] = tx
          .insert(sequenceVideoSplitSegments)
          .values({
            splitRunId: runId,
            orderIndex: target.orderIndex + i,
            startSeconds: boundaries[i],
            endSeconds: boundaries[i + 1],
            confidence: i === 0 ? (filtered.candidates[0]?.score ?? null) : (filtered.candidates[i - 1]?.score ?? null),
            boundaryProvenance: "scene",
            status: "pending",
            thumbnailPath: null,
          })
          .returning({ id: sequenceVideoSplitSegments.id })
          .all() as unknown as { id: number }[];
        ids.push(inserted.id);
      }
      insertedIds = ids;
    });

    // Every OTHER segment (before/after the refined one) is guaranteed
    // untouched above: only `target` was deleted, only `after` had its
    // `orderIndex` shifted, nothing else was read from or written to.

    const warnings: string[] = [];

    // The original segment's own thumbnail is now referenced by nothing —
    // clean it up (never silently swallowed).
    const oldCleanup = await deleteSegmentThumbnail(target.thumbnailPath);
    if (!oldCleanup.ok) warnings.push(oldCleanup.error);

    // Generate a thumbnail for each brand-new sub-segment, keyed by its own
    // stable DB id (never orderIndex — same rule as every other edit path).
    // REVISE (round 2, finding 3) — reuses the already-hardened
    // `regenerateThumbnailAndCleanup` (generate -> DB write -> only-then
    // cleanup, in that order) instead of a bare generate-then-update: for a
    // brand-new row `seg.thumbnailPath` is `null`, so the helper's
    // "old path" branch is simply a no-op, but its DB-write-failure branch
    // still applies — a thrown DB update here removes the just-generated
    // (now-unreferenced) file instead of leaving it orphaned.
    const freshSubSegments = await db.select().from(sequenceVideoSplitSegments).where(inArray(sequenceVideoSplitSegments.id, insertedIds));
    for (const seg of freshSubSegments) {
      const { warning: segWarning } = await regenerateThumbnailAndCleanup(sourceAbsolutePath, seg, runId);
      if (segWarning) warnings.push(`Segment starting at ${seg.startSeconds.toFixed(2)}s: ${segWarning}`);
    }

    warning = warnings.length > 0 ? warnings.join(" ") : undefined;
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to detect splits in this segment.");
  }

  okRedirectTo(returnTo, "splitEdited", warning);
}

// ---- Merge with previous/next segment ----

export async function mergeSegment(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const direction = (formData.get("direction") as string | null) === "prev" ? "prev" : "next";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;

  try {
    const run = await loadEditableRun(runId, sequenceId);
    const segments = await loadRunSegments(runId);
    const index = segments.findIndex((s) => s.id === segmentId);
    if (index === -1) throw new Error("Segment not found in this run.");

    const otherIndex = direction === "prev" ? index - 1 : index + 1;
    if (otherIndex < 0 || otherIndex >= segments.length) {
      throw new Error(`No ${direction === "prev" ? "previous" : "next"} segment to merge with.`);
    }

    const a = segments[Math.min(index, otherIndex)];
    const b = segments[Math.max(index, otherIndex)];
    const mergedStart = a.startSeconds;
    const mergedEnd = b.endSeconds;
    const removedId = b.id;
    const remaining = segments.filter((s) => s.id !== removedId);

    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");

      tx.update(sequenceVideoSplitSegments)
        .set({
          startSeconds: mergedStart,
          endSeconds: mergedEnd,
          status: "pending",
          targetShotId: null,
          boundaryProvenance: "manual" as BoundaryProvenance,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sequenceVideoSplitSegments.id, a.id))
        .run();

      tx.delete(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, removedId)).run();

      const ordered = renumber(remaining.map((s) => (s.id === a.id ? { ...s, orderIndex: s.orderIndex } : s)).sort((x, y) => x.orderIndex - y.orderIndex));
      for (const seg of ordered) {
        tx.update(sequenceVideoSplitSegments).set({ orderIndex: seg.orderIndex }).where(eq(sequenceVideoSplitSegments.id, seg.id)).run();
      }
    });

    // `mergedFresh.thumbnailPath` (fresh SELECT, transaction above never
    // touched that column) is still `a`'s OLD file — the shared helper
    // detects and cleans it up exactly like Adjust/Split do.
    const sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
    const [mergedFresh] = await db.select().from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, a.id));
    const warnings: string[] = [];
    if (mergedFresh) {
      const { warning: segWarning } = await regenerateThumbnailAndCleanup(sourceAbsolutePath, mergedFresh, runId);
      if (segWarning) warnings.push(segWarning);
    }

    // `b`'s row is gone but its own thumbnail file is now referenced by
    // nothing — delete it so it doesn't become a permanent orphan. A
    // failure here is reported to the user (never silently swallowed), but
    // does not undo the merge itself, which already committed.
    const cleanup = await deleteSegmentThumbnail(b.thumbnailPath);
    if (!cleanup.ok) warnings.push(cleanup.error);

    if (warnings.length > 0) warning = warnings.join(" ");
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to merge segments.");
  }

  okRedirectTo(returnTo, "splitEdited", warning ?? undefined);
}

// ---- Skip / Restore ----

export async function skipSegment(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  try {
    await loadEditableRun(runId, sequenceId);
    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
      const [seg] = tx.select({ id: sequenceVideoSplitSegments.id, splitRunId: sequenceVideoSplitSegments.splitRunId }).from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, segmentId)).all() as unknown as { id: number; splitRunId: number }[];
      if (!seg || seg.splitRunId !== runId) throw new Error("Segment not found in this run.");
      tx.update(sequenceVideoSplitSegments).set({ status: "skipped", targetShotId: null, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, segmentId)).run();
    });
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to skip segment.");
  }

  okRedirectTo(returnTo, "splitEdited");
}

export async function restoreSegment(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  try {
    await loadEditableRun(runId, sequenceId);
    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
      const [seg] = tx.select({ id: sequenceVideoSplitSegments.id, splitRunId: sequenceVideoSplitSegments.splitRunId }).from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, segmentId)).all() as unknown as { id: number; splitRunId: number }[];
      if (!seg || seg.splitRunId !== runId) throw new Error("Segment not found in this run.");
      tx.update(sequenceVideoSplitSegments).set({ status: "pending", updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, segmentId)).run();
    });
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to restore segment.");
  }

  okRedirectTo(returnTo, "splitEdited");
}

// ---- Reassign target Shot ----

export async function reassignSegmentShot(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const rawShotId = (formData.get("targetShotId") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  try {
    await loadEditableRun(runId, sequenceId);
    const targetShotId = rawShotId === "" ? null : parseInt(rawShotId, 10);
    if (targetShotId !== null) {
      if (!Number.isInteger(targetShotId) || targetShotId <= 0) throw new Error("Invalid Shot.");
      const [shot] = await db.select({ id: shots.id, sequenceId: shots.sequenceId }).from(shots).where(eq(shots.id, targetShotId));
      if (!shot || shot.sequenceId !== sequenceId) throw new Error("That Shot does not belong to this Sequence.");
    }

    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
      const [seg] = tx.select().from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.id, segmentId)).all() as unknown as (typeof sequenceVideoSplitSegments.$inferSelect)[];
      if (!seg || seg.splitRunId !== runId) throw new Error("Segment not found in this run.");
      if (seg.status === "skipped") throw new Error("Restore this segment before assigning a Shot to it.");
      tx.update(sequenceVideoSplitSegments)
        .set({ targetShotId, status: targetShotId !== null ? "mapped" : "pending", updatedAt: new Date().toISOString() })
        .where(eq(sequenceVideoSplitSegments.id, segmentId))
        .run();
    });
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to reassign Shot.");
  }

  okRedirectTo(returnTo, "splitEdited");
}

// ---- Assign All — reproposes the reading-order -> Shot-order mapping on every active (non-skipped) segment ----

export async function assignAllSegments(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  try {
    await loadEditableRun(runId, sequenceId);
    const sequenceShots = await db.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, sequenceId)).orderBy(asc(shots.orderIndex));
    const segments = await loadRunSegments(runId);
    const active = segments.filter((s) => s.status !== "skipped");

    db.transaction((tx) => {
      const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
      if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");

      const n = Math.min(active.length, sequenceShots.length);
      for (let i = 0; i < n; i++) {
        tx.update(sequenceVideoSplitSegments)
          .set({ targetShotId: sequenceShots[i].id, status: "mapped", updatedAt: new Date().toISOString() })
          .where(eq(sequenceVideoSplitSegments.id, active[i].id))
          .run();
      }
      for (let i = n; i < active.length; i++) {
        tx.update(sequenceVideoSplitSegments)
          .set({ targetShotId: null, status: "pending", updatedAt: new Date().toISOString() })
          .where(eq(sequenceVideoSplitSegments.id, active[i].id))
          .run();
      }
    });
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to assign all.");
  }

  okRedirectTo(returnTo, "splitEdited");
}
