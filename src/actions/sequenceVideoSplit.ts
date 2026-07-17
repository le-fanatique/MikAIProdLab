"use server";

// ---------------------------------------------------------------------------
// sequenceVideoSplit.ts — SEQGEN.SPLIT.1
//
// Detects, reviews, corrects, and validates a "Split Plan" for an explicitly
// chosen `sequence_video_drafts` row: proposed cut segments mapped to the
// Sequence's existing Shots. Mirrors storyboardExtraction.ts's versioned-run
// + editable-child-rows architecture and its exact conventions (errRedirectTo/
// okRedirectTo URL flash feedback, re-SELECT-status-first anti-race
// transactions, path containment).
//
// STRICT scope: no clip is ever physically cut, no Shot row is ever mutated,
// no Sequence Result/Film Result/Editorial state is touched. `Validate Split
// Plan` is the ONLY transition to `status: "validated"`; a validated run is
// immutable in this ticket. The future SEQGEN.PUSH.1 will consume only a
// validated run.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import {
  resolveSequenceVideoDraftAbsolutePath,
  detectVideoSplits,
  cleanupRunThumbnails,
  deleteSegmentThumbnail,
  generateSegmentThumbnail,
  runFfmpegSceneDetectionInRange,
  parseFrameRateModeFromParamsJson,
  DetectVideoSplitsError,
} from "@/lib/sequenceVideoSplit/detectVideoSplits";
import { parseFfmpegSceneOutput } from "@/lib/sequenceVideoSplit/parseFfmpegSceneOutput";
import { filterLocalCandidates } from "@/lib/sequenceVideoSplit/localDetectionFilter";
import type { BoundaryProvenance } from "@/lib/sequenceVideoSplit/selectSegmentBoundaries";
import {
  DEFAULT_SCENE_THRESHOLD,
  MIN_SCENE_THRESHOLD,
  MAX_SCENE_THRESHOLD,
  DEFAULT_MIN_SEGMENT_DURATION,
  MIN_MIN_SEGMENT_DURATION,
  MAX_MIN_SEGMENT_DURATION,
  parseStrictBoundedFloat,
} from "@/lib/sequenceVideoSplit/detectionParams";
import { validateFrameSplit, roundBoundarySeconds, isReliableFps } from "@/lib/sequenceVideoSplit/frameTime";

function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

/**
 * `warning`, when present, is a non-fatal problem that happened alongside an
 * otherwise-successful action (e.g. an orphaned thumbnail failed to delete
 * after a Merge) — appended as its own query param so the review page can
 * show it distinctly from the primary success feedback, never silently
 * dropped.
 */
function okRedirectTo(returnTo: string, param: string, warning?: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  let url = `${returnTo}${sep}${param}=1`;
  if (warning) url += `&splitWarning=${encodeURIComponent(warning)}`;
  redirect(url);
}

// ---------------------------------------------------------------------------
// Lot A / Lot B — start a new detection run (always a NEW versioned row,
// never overwriting a previous run for the same draft)
// ---------------------------------------------------------------------------

export async function startSequenceVideoSplitDetection(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const sequenceVideoDraftId = parseInt(formData.get("sequenceVideoDraftId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid request.");
  }
  if (!Number.isInteger(sequenceVideoDraftId) || sequenceVideoDraftId <= 0) {
    errRedirectTo(returnTo, "splitError", "Please choose a Sequence Video draft.");
  }

  const rawThreshold = (formData.get("sceneThreshold") as string | null)?.trim() ?? "";
  const sceneThreshold =
    rawThreshold === "" ? DEFAULT_SCENE_THRESHOLD : parseStrictBoundedFloat(rawThreshold, MIN_SCENE_THRESHOLD, MAX_SCENE_THRESHOLD);
  if (sceneThreshold === null) {
    errRedirectTo(returnTo, "splitError", `Scene threshold must be a number between ${MIN_SCENE_THRESHOLD} and ${MAX_SCENE_THRESHOLD}.`);
  }

  const rawMinDuration = (formData.get("minSegmentDurationSeconds") as string | null)?.trim() ?? "";
  const minSegmentDurationSeconds =
    rawMinDuration === "" ? DEFAULT_MIN_SEGMENT_DURATION : parseStrictBoundedFloat(rawMinDuration, MIN_MIN_SEGMENT_DURATION, MAX_MIN_SEGMENT_DURATION);
  if (minSegmentDurationSeconds === null) {
    errRedirectTo(
      returnTo,
      "splitError",
      `Minimum segment duration must be a number between ${MIN_MIN_SEGMENT_DURATION} and ${MAX_MIN_SEGMENT_DURATION} seconds.`
    );
  }

  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirectTo(returnTo, "splitError", "Sequence not found.");

  const [draft] = await db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, sequenceVideoDraftId));
  if (!draft) errRedirectTo(returnTo, "splitError", "Sequence Video draft not found.");
  if (draft.sequenceId !== sequenceId) errRedirectTo(returnTo, "splitError", "This draft does not belong to this Sequence.");

  const sequenceShots = await db.select().from(shots).where(eq(shots.sequenceId, sequenceId)).orderBy(asc(shots.orderIndex));
  if (sequenceShots.length === 0) {
    errRedirectTo(returnTo, "splitError", "This Sequence has no Shots yet — Split detection needs an existing Shot structure to propose a mapping for.");
  }

  let absoluteInputPath: string;
  try {
    absoluteInputPath = await resolveSequenceVideoDraftAbsolutePath(draft.videoPath);
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Invalid source video.");
  }

  const expectedShotOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));
  const paramsJson = JSON.stringify({ sceneThreshold, minSegmentDurationSeconds });

  const [run] = await db
    .insert(sequenceVideoSplitRuns)
    .values({
      sequenceId,
      sequenceVideoDraftId,
      sourceVideoPathSnapshot: draft.videoPath,
      sourceDurationSeconds: 0,
      engineVersion: "ffmpeg-scene-detect-v1",
      sceneThreshold,
      minSegmentDurationSeconds,
      paramsJson,
      expectedShotCount: sequenceShots.length,
      expectedShotOrderSnapshot,
      status: "detecting",
    })
    .returning();

  // REVISE (SEQGEN.SPLIT.WORKSPACE.1) — the unified workspace lives at ONE
  // route (`splitsBase`, same as `returnTo`'s own path now — no more
  // `/splits/[splitRunId]` sub-route); "Run Detection Again" stays on that
  // exact route and selects the freshly created run via `splitRunId`.
  const splitsBase = returnTo.split("?")[0];

  try {
    const result = await detectVideoSplits({
      sourceAbsolutePath: absoluteInputPath,
      expectedShotDurations: sequenceShots.map((s) => s.durationSeconds),
      sceneThreshold,
      minSegmentDurationSeconds,
      splitRunUuid: String(run.id),
    });

    db.transaction((tx) => {
      // REVISE (round 3) — a thumbnail-generation failure in the initial
      // batch must never be silently discarded: the run still becomes
      // "ready" (a missing thumbnail is degraded-but-recoverable, not a
      // reason to fail detection), but `errorMessage` carries the exact
      // diagnostic so it's visible on the review page — reusing this
      // column (rather than a new one, which would need a schema change
      // outside this ticket's authorization) is safe because it is a plain
      // nullable text field never constrained to only mean "status=failed".
      const thumbnailWarning = result.thumbnailWarnings.length > 0 ? result.thumbnailWarnings.join(" ") : null;
      // REVISE (round 2, finding 2) — the CFR/VFR/unknown classification is
      // only known once probing completes, so it's folded into `paramsJson`
      // here (reusing the same free-text JSON extension point as
      // `sceneThreshold`/`minSegmentDurationSeconds` — no schema change) —
      // `sourceFps` alone already gates frame-exact behavior everywhere it
      // matters, but the mode is kept visible/auditable for diagnostics.
      const finalParamsJson = JSON.stringify({ sceneThreshold, minSegmentDurationSeconds, frameRateMode: result.probed.frameRateMode });
      tx.update(sequenceVideoSplitRuns)
        .set({
          status: "ready",
          sourceDurationSeconds: result.probed.durationSeconds,
          sourceFps: result.probed.fps,
          sourceWidth: result.probed.width,
          sourceHeight: result.probed.height,
          rawCandidatesJson: JSON.stringify(result.rawCandidates),
          paramsJson: finalParamsJson,
          errorMessage: thumbnailWarning,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sequenceVideoSplitRuns.id, run.id))
        .run();

      for (const segment of result.segments) {
        tx.insert(sequenceVideoSplitSegments)
          .values({
            splitRunId: run.id,
            orderIndex: segment.orderIndex,
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
            confidence: segment.confidence,
            boundaryProvenance: segment.boundaryProvenance,
            status: "pending",
            thumbnailPath: segment.thumbnailPath,
          })
          .run();
      }
    });
  } catch (e) {
    const message = e instanceof DetectVideoSplitsError ? e.message : e instanceof Error ? e.message : "Detection failed.";
    const cleanup = await cleanupRunThumbnails(String(run.id));
    // Never announce a clean failure state if cleanup itself failed — the
    // errorMessage must say so explicitly rather than silently leaving a
    // possibly-orphaned thumbnail directory unexplained.
    const finalErrorMessage = cleanup.ok ? message : `${message} Additionally: ${cleanup.error}`;
    await db
      .update(sequenceVideoSplitRuns)
      .set({ status: "failed", errorMessage: finalErrorMessage, updatedAt: new Date().toISOString() })
      .where(eq(sequenceVideoSplitRuns.id, run.id));
  }

  redirect(`${splitsBase}?sequenceVideoDraftId=${sequenceVideoDraftId}&splitRunId=${run.id}`);
}

// ---------------------------------------------------------------------------
// Lot C — review and correction, pure DB + thumbnail regeneration, no clip
// cutting, no Shot mutation
// ---------------------------------------------------------------------------

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

/** Renumbers `orderIndex` 0..n-1 in-place, in-memory, for a segment list already sorted by desired order — used after Split/Merge change the segment count. */
function renumber<T extends { orderIndex: number }>(list: T[]): T[] {
  return list.map((item, i) => ({ ...item, orderIndex: i }));
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
  runId: number
): Promise<{ warning: string | null }> {
  const oldPath = segment.thumbnailPath;
  const result = await generateSegmentThumbnail(sourceAbsolutePath, segment, String(runId), String(segment.id));

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

    const MIN_GAP = 0.05; // sub-frame tolerance floor, never a true zero/negative segment

    if (field === "start") {
      if (index === 0) throw new Error("The first segment always starts at 0 and cannot be moved.");
      const prev = segments[index - 1];
      const current = segments[index];
      if (!(value > prev.startSeconds + MIN_GAP && value < current.endSeconds - MIN_GAP)) {
        throw new Error("The new boundary would create a zero-length or overlapping segment.");
      }
      db.transaction((tx) => {
        const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
        if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
        tx.update(sequenceVideoSplitSegments).set({ endSeconds: value, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, prev.id)).run();
        tx.update(sequenceVideoSplitSegments).set({ startSeconds: value, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, current.id)).run();
      });
    } else {
      if (index === segments.length - 1) throw new Error("The last segment always ends at the source duration and cannot be moved.");
      const current = segments[index];
      const next = segments[index + 1];
      if (!(value > current.startSeconds + MIN_GAP && value < next.endSeconds - MIN_GAP)) {
        throw new Error("The new boundary would create a zero-length or overlapping segment.");
      }
      db.transaction((tx) => {
        const [freshRun] = tx.select({ status: sequenceVideoSplitRuns.status }).from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as { status: string }[];
        if (!freshRun || freshRun.status !== "ready") throw new Error("This Split Plan can no longer be edited.");
        tx.update(sequenceVideoSplitSegments).set({ endSeconds: value, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, current.id)).run();
        tx.update(sequenceVideoSplitSegments).set({ startSeconds: value, boundaryProvenance: "manual" as BoundaryProvenance, updatedAt: new Date().toISOString() }).where(eq(sequenceVideoSplitSegments.id, next.id)).run();
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

/** Sub-frame tolerance floor shared by every split entry point (numeric and frame-exact) — never a true zero/negative segment on either side. */
const SPLIT_MIN_GAP_SECONDS = 0.05;

/**
 * Shared core for both `splitSegmentAt` (raw seconds, manual/VFR-safe) and
 * `splitSegmentAtFrame` (frame-exact, SEQGEN.SPLIT.WORKSPACE.1 Lot B) — both
 * ultimately insert a cut at a server-validated `splitAtSeconds` inside one
 * segment. Kept as one implementation so the two entry points can never
 * silently diverge in DB/thumbnail behavior.
 */
async function performSplitAtSeconds(runId: number, sequenceId: number, segmentId: number, splitAtSeconds: number): Promise<{ warning: string | null }> {
  const run = await loadEditableRun(runId, sequenceId);
  const segments = await loadRunSegments(runId);
  const target = segments.find((s) => s.id === segmentId);
  if (!target) throw new Error("Segment not found in this run.");

  if (!(splitAtSeconds > target.startSeconds + SPLIT_MIN_GAP_SECONDS && splitAtSeconds < target.endSeconds - SPLIT_MIN_GAP_SECONDS)) {
    throw new Error("Split point must be strictly inside the segment (not touching either edge).");
  }

  const after = segments.filter((s) => s.orderIndex > target.orderIndex);

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
    // ordering conflict inside the same transaction.
    tx.insert(sequenceVideoSplitSegments)
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
      .run();

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
  const sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
  const refreshed = await loadRunSegments(runId);
  const firstHalf = refreshed.find((s) => s.id === target.id)!;
  const secondHalf = refreshed.find((s) => s.startSeconds === splitAtSeconds && s.id !== target.id);
  const segmentWarnings: string[] = [];
  for (const seg of [firstHalf, secondHalf].filter((s): s is NonNullable<typeof s> => !!s)) {
    const { warning: segWarning } = await regenerateThumbnailAndCleanup(sourceAbsolutePath, seg, runId);
    if (segWarning) segmentWarnings.push(segWarning);
  }
  return { warning: segmentWarnings.length > 0 ? segmentWarnings.join(" ") : null };
}

export async function splitSegmentAt(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const rawAt = (formData.get("splitAtSeconds") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;

  try {
    const segments = await loadRunSegments(runId);
    const target = segments.find((s) => s.id === segmentId);
    if (!target) throw new Error("Segment not found in this run.");
    const splitAt = parseStrictBoundedFloat(rawAt, target.startSeconds + SPLIT_MIN_GAP_SECONDS, target.endSeconds - SPLIT_MIN_GAP_SECONDS);
    if (splitAt === null) throw new Error("Split point must be strictly inside the segment (not touching either edge).");

    const result = await performSplitAtSeconds(runId, sequenceId, segmentId, splitAt);
    warning = result.warning;
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to split segment.");
  }

  okRedirectTo(returnTo, "splitEdited", warning ?? undefined);
}

// ---- Split at Current Frame (SEQGEN.SPLIT.WORKSPACE.1, Lot B) — frame-exact, server-derived from the run's own FPS snapshot ----

export async function splitSegmentAtFrame(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const segmentId = parseInt(formData.get("segmentId") as string, 10);
  const rawFrame = (formData.get("frame") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  let warning: string | null = null;

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
    const validation = validateFrameSplit({
      frame,
      fps: run.sourceFps ?? NaN,
      segmentStartSeconds: target.startSeconds,
      segmentEndSeconds: target.endSeconds,
      minGapSeconds: SPLIT_MIN_GAP_SECONDS,
    });
    if (!validation.ok) throw new Error(validation.error);

    const result = await performSplitAtSeconds(runId, sequenceId, segmentId, validation.splitAtSeconds);
    warning = result.warning;
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to split at the current frame.");
  }

  okRedirectTo(returnTo, "splitEdited", warning ?? undefined);
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
    const absoluteCandidates = localCandidates.map((c) => ({
      ...c,
      timestampSeconds: roundBoundarySeconds(c.timestampSeconds + target.startSeconds, run.sourceFps),
    }));

    const filtered = filterLocalCandidates({
      candidates: absoluteCandidates,
      segmentStartSeconds: target.startSeconds,
      segmentEndSeconds: target.endSeconds,
      minGapSeconds: localMinSegmentDuration,
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

// ---------------------------------------------------------------------------
// Lot D — Validate Split Plan: the ONLY transition to "validated"
// ---------------------------------------------------------------------------

export async function validateSplitPlan(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";
  // Set inside the transaction ONLY when the bounded EOF normalization
  // (SEQGEN.SPLIT.WORKSPACE.1-FIX1, Lot B) actually commits — used after
  // the transaction to honestly clean up the now-orphaned old thumbnail
  // file. Never touched if validation fails or normalization didn't apply.
  // Two plain primitives (rather than one nullable object) to sidestep a
  // TS control-flow narrowing quirk observed with an object-typed `let`
  // reassigned only from inside the `db.transaction` closure.
  let normalizedOldThumbnailPath: string | null = null;
  let didNormalize = false;
  let warning: string | undefined;

  try {
    // Every decisive read (run status, live Shots, live segments) AND the
    // full diagnostics computation AND the status transition itself all
    // happen inside ONE synchronous transaction (no `await` anywhere in
    // this callback — better-sqlite3 requires that for `db.transaction` to
    // actually serialize against concurrent writers). This closes a real
    // race: an earlier version read the run/Shots/segments OUTSIDE the
    // transaction and only re-checked `status` inside it, so a Skip/
    // Reassign/Split committed between the read and the status-transition
    // could leave a `validated` plan that was never actually re-diagnosed
    // against what just changed. Now, whichever transaction — this
    // validation, or a concurrent edit — commits first is exactly what the
    // other one sees when it does its own fresh read, because SQLite
    // serializes writers.
    db.transaction((tx) => {
      const [fresh] = tx.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as (typeof sequenceVideoSplitRuns.$inferSelect)[];
      if (!fresh) throw new Error("Split run not found.");
      if (fresh.sequenceId !== sequenceId) throw new Error("Split run does not belong to this Sequence.");
      if (fresh.status !== "ready") throw new Error("This Split Plan was already validated or is no longer editable.");

      const sequenceShots = tx
        .select({ id: shots.id })
        .from(shots)
        .where(eq(shots.sequenceId, sequenceId))
        .orderBy(asc(shots.orderIndex))
        .all() as unknown as { id: number }[];
      const segments = tx
        .select()
        .from(sequenceVideoSplitSegments)
        .where(eq(sequenceVideoSplitSegments.splitRunId, runId))
        .orderBy(asc(sequenceVideoSplitSegments.orderIndex))
        .all() as unknown as (typeof sequenceVideoSplitSegments.$inferSelect)[];

      const diagnostics: string[] = [];

      // Staleness: the Sequence's Shot list/order must be exactly what this
      // run was created against.
      const liveOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));
      if (liveOrderSnapshot !== fresh.expectedShotOrderSnapshot) {
        diagnostics.push(
          "The Sequence's Shot list or order has changed since this Split Plan was detected. Run detection again to get an up-to-date plan."
        );
      }

      // Boundary validity: strictly increasing, contiguous, within [0, duration].
      const sorted = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);

      // REVISE (SEQGEN.SPLIT.WORKSPACE.1-FIX1, Lot B) — bounded, one-shot
      // compatibility normalization for plans generated by the exact
      // legacy bug (EOF quantized to the nearest frame instead of kept as
      // the source's own high-precision duration). Diagnostics below run
      // against `effectiveSorted` — `sorted` with ONLY the last segment's
      // `endSeconds` replaced — so a plan is validated (and only then
      // persisted, atomically, in this same transaction) exactly as if the
      // fix had produced it originally. Applies ONLY when ALL of:
      //   1. the run is explicitly proven CFR (`frameRateMode === "cfr"`)
      //      with a numerically reliable `sourceFps` — never for VFR/
      //      unknown/legacy-unmarked runs, which get zero auto-repair;
      //   2. the last segment's CURRENT `endSeconds` matches, to strict
      //      floating-point epsilon, the EXACT legacy signature
      //      `roundBoundarySeconds(sourceDurationSeconds, sourceFps)` — an
      //      arbitrary/different endpoint (a real user edit, or a genuine
      //      gap) is NEVER touched;
      //   3. normalizing would still leave the last segment's own duration
      //      strictly positive.
      // If normalization doesn't apply, `effectiveSorted === sorted` and
      // behavior is byte-identical to before this fix.
      let normalizedLastSegmentCandidate: typeof sequenceVideoSplitSegments.$inferSelect | null = null;
      if (sorted.length > 0 && parseFrameRateModeFromParamsJson(fresh.paramsJson) === "cfr" && isReliableFps(fresh.sourceFps)) {
        const last = sorted[sorted.length - 1];
        const legacySignature = roundBoundarySeconds(fresh.sourceDurationSeconds, fresh.sourceFps);
        const EPSILON = 1e-9;
        // REVISE (Codex, SEQGEN.SPLIT.WORKSPACE.1-FIX1) — when the source
        // duration is itself already frame-aligned, the legacy signature
        // equals the exact EOF: matching the signature alone is not enough
        // to prove this run is actually broken. Require a REAL gap between
        // the current endpoint and the exact source duration before ever
        // selecting the normalization candidate — an already-exact plan
        // must never be touched (no rewrite, no thumbnail invalidation).
        if (
          Math.abs(last.endSeconds - legacySignature) < EPSILON &&
          Math.abs(last.endSeconds - fresh.sourceDurationSeconds) > EPSILON &&
          fresh.sourceDurationSeconds - last.startSeconds > 0
        ) {
          normalizedLastSegmentCandidate = last;
        }
      }
      const effectiveSorted = normalizedLastSegmentCandidate
        ? sorted.map((s, i) => (i === sorted.length - 1 ? { ...s, endSeconds: fresh.sourceDurationSeconds } : s))
        : sorted;

      if (effectiveSorted.length === 0) {
        diagnostics.push("This Split Plan has no segments.");
      } else {
        if (effectiveSorted[0].startSeconds !== 0) diagnostics.push("The first segment does not start at 0.");
        if (Math.abs(effectiveSorted[effectiveSorted.length - 1].endSeconds - fresh.sourceDurationSeconds) > 0.01) {
          diagnostics.push("The last segment does not end at the source video's duration.");
        }
        for (let i = 0; i < effectiveSorted.length; i++) {
          const s = effectiveSorted[i];
          if (s.endSeconds <= s.startSeconds) diagnostics.push(`Segment #${i + 1} has a zero or negative duration.`);
          if (i > 0 && Math.abs(effectiveSorted[i - 1].endSeconds - s.startSeconds) > 0.01) {
            diagnostics.push(`There is a gap or overlap between segment #${i} and segment #${i + 1}.`);
          }
        }
      }

      // Mapping completeness: every current Shot mapped exactly once among
      // non-skipped segments; every active segment has a Shot; no duplicate
      // target.
      const active = effectiveSorted.filter((s) => s.status !== "skipped");
      const unmappedActive = active.filter((s) => s.targetShotId === null);
      if (unmappedActive.length > 0) {
        diagnostics.push(`${unmappedActive.length} active segment(s) have no target Shot assigned.`);
      }
      const targetCounts = new Map<number, number>();
      for (const s of active) {
        if (s.targetShotId === null) continue;
        targetCounts.set(s.targetShotId, (targetCounts.get(s.targetShotId) ?? 0) + 1);
      }
      const duplicated = [...targetCounts.entries()].filter(([, count]) => count > 1);
      if (duplicated.length > 0) {
        diagnostics.push(`${duplicated.length} Shot(s) are targeted by more than one active segment.`);
      }
      const mappedShotIds = new Set([...targetCounts.keys()]);
      const missingShots = sequenceShots.filter((s) => !mappedShotIds.has(s.id));
      if (missingShots.length > 0) {
        diagnostics.push(`${missingShots.length} of this Sequence's Shot(s) are not mapped to any segment.`);
      }

      if (diagnostics.length > 0) {
        // Throwing rolls back the transaction — nothing is written when
        // validation is refused, whether or not normalization was
        // attempted: a plan that's invalid even AFTER the compatibility
        // view is applied is left completely untouched.
        throw new Error(diagnostics.join(" "));
      }

      // All diagnostics passed on the (possibly normalized) view — write
      // the normalization itself (if any) and the `validated` transition
      // together, atomically, in this same transaction.
      if (normalizedLastSegmentCandidate) {
        // The last segment's thumbnail was rendered from its OLD (frame-
        // quantized) end boundary — now genuinely stale. Invalidate the
        // pointer to `null` in the SAME transaction (DB before filesystem,
        // same discipline as every other thumbnail-affecting mutation in
        // this ticket); the actual file is deleted AFTER commit, honestly,
        // never silently.
        tx.update(sequenceVideoSplitSegments)
          .set({ endSeconds: fresh.sourceDurationSeconds, thumbnailPath: null, updatedAt: new Date().toISOString() })
          .where(eq(sequenceVideoSplitSegments.id, normalizedLastSegmentCandidate.id))
          .run();
        didNormalize = true;
        normalizedOldThumbnailPath = normalizedLastSegmentCandidate.thumbnailPath;
      }

      tx.update(sequenceVideoSplitRuns)
        .set({ status: "validated", validatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(sequenceVideoSplitRuns.id, runId))
        .run();
    });

    // REVISE (Lot B) — the normalization committed above; now honestly
    // clean up the old (now provably orphaned) thumbnail file. Never
    // regenerates a NEW thumbnail here: the run is already `validated`
    // (immutable) by the time this runs, and this ticket explicitly
    // forbids regenerating a thumbnail post-validation.
    if (didNormalize && normalizedOldThumbnailPath) {
      const cleanup = await deleteSegmentThumbnail(normalizedOldThumbnailPath);
      if (!cleanup.ok) warning = cleanup.error;
    }
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Failed to validate Split Plan.");
  }

  okRedirectTo(returnTo, "splitValidated", warning);
}
