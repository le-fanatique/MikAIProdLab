"use server";

// ---------------------------------------------------------------------------
// sequenceVideoSplitDetection.ts — SEQGEN.SPLIT.1
//
// Lot A / Lot B — starts a new detection run (always a NEW versioned row,
// never overwriting a previous run for the same draft), and Manual
// Detection (SEQGEN.SPLIT.CLEANUP.1, Lot A). Split from the former
// `src/actions/sequenceVideoSplit.ts` by IND.SPLIT.1 — see
// `src/actions/sequenceVideoSplitCleanup.ts`,
// `src/actions/sequenceVideoSplitSegments.ts`, and
// `src/actions/sequenceVideoSplitValidate.ts` for the rest.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  resolveSequenceVideoDraftAbsolutePath,
  detectVideoSplits,
  probeVideoInfo,
  cleanupRunThumbnails,
  generateSegmentThumbnail,
  DetectVideoSplitsError,
} from "@/lib/sequenceVideoSplit/detectVideoSplits";
import {
  DEFAULT_SCENE_THRESHOLD,
  MIN_SCENE_THRESHOLD,
  MAX_SCENE_THRESHOLD,
  DEFAULT_MIN_SEGMENT_DURATION,
  MIN_MIN_SEGMENT_DURATION,
  MAX_MIN_SEGMENT_DURATION,
  parseStrictBoundedFloat,
} from "@/lib/sequenceVideoSplit/detectionParams";
import { resolveMinGapSeconds } from "@/lib/sequenceVideoSplit/frameTime";
import { errRedirectTo } from "@/lib/sequenceVideoSplit/actionHelpers";

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
      // SEQGEN.SPLIT.MINFRAMES.1, Lot B — the EFFECTIVE minimum (after
      // `resolveMinGapSeconds`) is only knowable once probing resolves
      // `frameRateMode`/`fps`, so it is computed here and persisted
      // alongside the raw requested value — "explique le minimum demande et
      // le minimum effectif," never silently only one or the other.
      const minSegmentDurationEffectiveSeconds = resolveMinGapSeconds(
        minSegmentDurationSeconds,
        result.probed.frameRateMode === "cfr" ? result.probed.fps : null
      );
      const finalParamsJson = JSON.stringify({
        sceneThreshold,
        minSegmentDurationSeconds,
        frameRateMode: result.probed.frameRateMode,
        minSegmentDurationEffectiveSeconds,
      });
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
// SEQGEN.SPLIT.CLEANUP.1, Lot A — Manual Detection: creates a new versioned
// run containing exactly one full-source-length `pending` segment, with NO
// scene detection ever invoked (structurally guaranteed — this function
// never imports/calls `runFfmpegSceneDetection`/`parseFfmpegSceneOutput`/
// `selectSegmentBoundaries`, only `probeVideoInfo`). The resulting run has
// the exact same shape a detected run has (same columns, same segment
// table, same statuses), so every existing tool — player, Split/Merge/
// Assign/Validate/Push — operates on it without any special branch.
// ---------------------------------------------------------------------------

export async function startManualSplit(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const sequenceVideoDraftId = parseInt(formData.get("sequenceVideoDraftId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid request.");
  }
  if (!Number.isInteger(sequenceVideoDraftId) || sequenceVideoDraftId <= 0) {
    errRedirectTo(returnTo, "splitError", "Please choose a Sequence Video draft.");
  }

  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirectTo(returnTo, "splitError", "Sequence not found.");

  const [draft] = await db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, sequenceVideoDraftId));
  if (!draft) errRedirectTo(returnTo, "splitError", "Sequence Video draft not found.");
  if (draft.sequenceId !== sequenceId) errRedirectTo(returnTo, "splitError", "This draft does not belong to this Sequence.");

  // Same requirement as automatic detection — Manual Detection still needs
  // an existing Shot structure to eventually map its segment(s) onto.
  const sequenceShots = await db.select().from(shots).where(eq(shots.sequenceId, sequenceId)).orderBy(asc(shots.orderIndex));
  if (sequenceShots.length === 0) {
    errRedirectTo(returnTo, "splitError", "This Sequence has no Shots yet — Manual Detection needs an existing Shot structure to propose a mapping for.");
  }

  let absoluteInputPath: string;
  try {
    absoluteInputPath = await resolveSequenceVideoDraftAbsolutePath(draft.videoPath);
  } catch (e) {
    errRedirectTo(returnTo, "splitError", e instanceof Error ? e.message : "Invalid source video.");
  }

  const expectedShotOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));

  // `sceneThreshold`/`minSegmentDurationSeconds` are NOT NULL columns on
  // this schema and are not going to be widened for this ticket (no
  // migration authorized) — valid defaults are stored for schema
  // compatibility only. `paramsJson.detectionMode: "manual"` is the actual
  // source of truth read everywhere that needs to know how this run was
  // produced; nothing in this codebase ever reads scene threshold/min
  // duration as if they had been applied to a manual run.
  const initialParamsJson = JSON.stringify({
    sceneThreshold: DEFAULT_SCENE_THRESHOLD,
    minSegmentDurationSeconds: DEFAULT_MIN_SEGMENT_DURATION,
    detectionMode: "manual",
  });

  const [run] = await db
    .insert(sequenceVideoSplitRuns)
    .values({
      sequenceId,
      sequenceVideoDraftId,
      sourceVideoPathSnapshot: draft.videoPath,
      sourceDurationSeconds: 0,
      engineVersion: "manual-split-v1",
      sceneThreshold: DEFAULT_SCENE_THRESHOLD,
      minSegmentDurationSeconds: DEFAULT_MIN_SEGMENT_DURATION,
      paramsJson: initialParamsJson,
      rawCandidatesJson: JSON.stringify([]),
      expectedShotCount: sequenceShots.length,
      expectedShotOrderSnapshot,
      status: "detecting",
    })
    .returning();

  const splitsBase = returnTo.split("?")[0];

  try {
    // FFprobe only — real duration, dimensions, FPS, and CFR/VFR/unknown
    // classification. Scene detection is never invoked on this path.
    const probed = await probeVideoInfo(absoluteInputPath);

    const finalParamsJson = JSON.stringify({
      sceneThreshold: DEFAULT_SCENE_THRESHOLD,
      minSegmentDurationSeconds: DEFAULT_MIN_SEGMENT_DURATION,
      frameRateMode: probed.frameRateMode,
      detectionMode: "manual",
    });

    // Thumbnail generation reuses the exact same helper/keying convention
    // as the initial detection batch (`initial-<orderIndex>`, orderIndex 0
    // here since there is exactly one segment) — a failure here is
    // degraded-but-recoverable (the run still becomes usable), never a
    // reason to fail the whole action, but the diagnostic is always kept
    // and persisted into `errorMessage`, exactly like automatic detection.
    const thumbnail = await generateSegmentThumbnail(absoluteInputPath, { startSeconds: 0, endSeconds: probed.durationSeconds }, String(run.id), "initial-0");

    db.transaction((tx) => {
      tx.update(sequenceVideoSplitRuns)
        .set({
          status: "ready",
          sourceDurationSeconds: probed.durationSeconds,
          sourceFps: probed.fps,
          sourceWidth: probed.width,
          sourceHeight: probed.height,
          rawCandidatesJson: JSON.stringify([]),
          paramsJson: finalParamsJson,
          errorMessage: thumbnail.ok ? null : `Segment #1: ${thumbnail.error}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sequenceVideoSplitRuns.id, run.id))
        .run();

      tx.insert(sequenceVideoSplitSegments)
        .values({
          splitRunId: run.id,
          orderIndex: 0,
          startSeconds: 0,
          endSeconds: probed.durationSeconds,
          confidence: null,
          boundaryProvenance: "manual",
          status: "pending",
          thumbnailPath: thumbnail.ok ? thumbnail.path : null,
        })
        .run();
    });
  } catch (e) {
    const message = e instanceof DetectVideoSplitsError ? e.message : e instanceof Error ? e.message : "Manual Detection failed.";
    const cleanup = await cleanupRunThumbnails(String(run.id));
    const finalErrorMessage = cleanup.ok ? message : `${message} Additionally: ${cleanup.error}`;
    await db
      .update(sequenceVideoSplitRuns)
      .set({ status: "failed", errorMessage: finalErrorMessage, updatedAt: new Date().toISOString() })
      .where(eq(sequenceVideoSplitRuns.id, run.id));
  }

  redirect(`${splitsBase}?sequenceVideoDraftId=${sequenceVideoDraftId}&splitRunId=${run.id}`);
}
