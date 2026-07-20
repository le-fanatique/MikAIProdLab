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

import path from "node:path";
import fsPromises from "node:fs/promises";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots, shotVideoCandidates } from "@/db/schema";
import { eq, asc, inArray, or } from "drizzle-orm";
import {
  resolveSequenceVideoDraftAbsolutePath,
  detectVideoSplits,
  probeVideoInfo,
  cleanupRunThumbnails,
  deleteSegmentThumbnail,
  generateSegmentThumbnail,
  runFfmpegSceneDetectionInRange,
  parseFrameRateModeFromParamsJson,
  THUMBNAIL_ROOT_RELATIVE,
  DetectVideoSplitsError,
  type ThumbnailFrameStrategy,
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
import { validateFrameSplit, roundBoundarySeconds, isReliableFps, resolveMinGapSeconds, resolveBoundaryValue } from "@/lib/sequenceVideoSplit/frameTime";

/**
 * SEQGEN.SPLIT.MINFRAMES.1 — the run's own FPS, but only when explicitly
 * proven CFR via `paramsJson.frameRateMode` (never `run.sourceFps` alone,
 * which is only meaningfully non-null for CFR sources by construction but
 * is re-verified here anyway — mirrors the same authoritative re-check
 * `splitSegmentAtFrame` already performed before this ticket). Every
 * frame-exact code path in this file derives its FPS through this one
 * function, never `run.sourceFps` directly.
 */
function resolveRunFps(run: { sourceFps: number | null; paramsJson: string | null }): number | null {
  return parseFrameRateModeFromParamsJson(run.paramsJson) === "cfr" ? run.sourceFps : null;
}

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

function cleanupRedirectTo(returnTo: string, message: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}splitCleanupMessage=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// SEQGEN.SPLIT.CLEANUP.1, Lot B — Clear unused past runs: deletes only runs
// of the currently-open draft that are neither the currently displayed run,
// `detecting`, nor referenced (directly or through one of their segments)
// by any `shot_video_candidates` row. Deletability is re-verified inside
// the SAME transaction that performs the delete for each run — never
// trusted from an earlier count or from the button being shown — closing
// the race with a concurrent Push. The FK on `shot_video_candidates` (no
// `onDelete` action, i.e. RESTRICT) is the last-resort guard if that race
// is somehow still lost; recognized explicitly by its exact SQLite error
// code, never by catching every possible failure.
//
// REVISE (round 2) — quarantine/transaction/compensation discipline
// mirroring `deleteShotVideo`'s file-owning branch in
// `shotVideoLibrary.ts`: the thumbnail directory is renamed out of the way
// BEFORE the DB row is ever touched, restored if the transaction fails for
// any reason, and only permanently removed once the transaction has
// actually committed — never DB-delete-then-best-effort-cleanup, which
// could leave an orphaned directory with zero DB provenance pointing back
// at it.
//
// REVISE (round 3) — the round-2 version still returned `kind: "deleted"`
// when the FINAL quarantine removal failed after commit, leaving a
// `.trash-*` directory with zero DB provenance and no retry path: exactly
// the orphan this discipline exists to prevent. This round captures a full
// snapshot of the run row AND every one of its segments (not just ids)
// BEFORE the delete, so that a final-cleanup failure can restore the
// directory AND re-insert the run plus every segment with their original
// ids/values — the multi-row extension of the same compensation shape
// already proven for a single row in `deleteShotVideo`
// (`shotVideoLibrary.ts:214-260`), `deleteShotVideoCandidate`
// (`sequenceVideoPush.ts:548-600`) and `deleteSequenceStoryboardImage`
// (`sequenceStoryboard.ts:272-321`). `kind: "deleted"` is now returned ONLY
// when the final cleanup actually succeeds; any other outcome is `kind:
// "error"` with the exact, granular compensation state.
// ---------------------------------------------------------------------------

type ClearRunOutcome =
  | { kind: "already-gone" }
  | { kind: "protected" }
  | { kind: "deleted"; cleanupWarning: string | null }
  | { kind: "error"; error: string };

// REVISE (round 5) — widened from a single 150ms retry to a bounded,
// backing-off sequence (4 attempts total, ~850ms of retrying at worst)
// before a removal failure is treated as final. Still strictly bounded —
// never unbounded polling — but generous enough to absorb the transient
// locks (AV scanner, search indexer, a still-open handle from the rename
// that just happened) that a single 150ms retry could still lose to.
const QUARANTINE_REMOVAL_RETRY_DELAYS_MS = [100, 250, 500];

/**
 * Never gives up silently: attempts the removal, then retries with the
 * bounded backoff above. `ok: false` only after every attempt has failed.
 */
async function removeQuarantineDir(quarantineDir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError: unknown;
  const attempts = QUARANTINE_REMOVAL_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fsPromises.rm(quarantineDir, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      lastError = e;
      if (attempt < QUARANTINE_REMOVAL_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, QUARANTINE_REMOVAL_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  return {
    ok: false,
    error: `Failed to remove quarantined thumbnail directory "${quarantineDir}" (retried ${attempts - 1} time(s)): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  };
}

/** The exact, documented SQLite error for a RESTRICT foreign key violation — never inferred from a generic message match. */
function isForeignKeyRestrictError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}

/**
 * Deletes exactly one run if — and only if — it is genuinely unused,
 * following the quarantine/transaction/compensation discipline described
 * above. Never throws: every outcome, including a real DB failure, is
 * returned as an explicit `ClearRunOutcome` for the caller to tally and
 * report honestly.
 */
async function deleteOneUnusedRun(runId: number, currentRunId: number, sequenceVideoDraftId: number): Promise<ClearRunOutcome> {
  const liveDir = path.resolve(process.cwd(), "public", THUMBNAIL_ROOT_RELATIVE, `run-${runId}`);
  const quarantineDir = `${liveDir}.trash-${Date.now()}-${runId}`;

  let quarantined = false;
  try {
    await fsPromises.rename(liveDir, quarantineDir);
    quarantined = true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // ENOENT — this run never produced a thumbnail directory (e.g. a
    // Manual Detection run whose single thumbnail generation itself
    // failed). Nothing to quarantine; proceed exactly as if quarantine had
    // succeeded on an empty directory.
    if (err.code !== "ENOENT") {
      return { kind: "error", error: `Could not prepare this run's thumbnails for deletion: ${err.message}` };
    }
  }

  // REVISE (round 2) — widened via an explicit type alias and read back
  // through it below: `let` reassigned only from inside the `db.transaction`
  // closure otherwise narrows unpredictably under TS control-flow analysis
  // (the exact same quirk already documented and sidestepped for
  // `didNormalize`/`normalizedOldThumbnailPath` in `validateSplitPlan`
  // above).
  type DeleteResult = "deleted" | "already-gone" | "protected" | null;
  let deleteResult: DeleteResult = null;
  let transactionError: string | null = null;
  // Captured ONLY on the actual delete path, from the exact rows the
  // transaction is about to remove — the sole source of truth for
  // compensation if the final quarantine cleanup fails after commit.
  let runSnapshot: typeof sequenceVideoSplitRuns.$inferSelect | null = null;
  let segmentsSnapshot: (typeof sequenceVideoSplitSegments.$inferSelect)[] = [];

  try {
    db.transaction((tx) => {
      const [freshRun] = tx.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all() as unknown as (typeof sequenceVideoSplitRuns.$inferSelect)[];
      // Already gone — a concurrent cleanup (or this same action retried)
      // already removed it. Not this call's doing, not a failure either.
      if (!freshRun) {
        deleteResult = "already-gone";
        return;
      }
      if (freshRun.id === currentRunId || freshRun.status === "detecting" || freshRun.sequenceVideoDraftId !== sequenceVideoDraftId) {
        deleteResult = "protected";
        return;
      }

      const segments = tx
        .select()
        .from(sequenceVideoSplitSegments)
        .where(eq(sequenceVideoSplitSegments.splitRunId, runId))
        .orderBy(asc(sequenceVideoSplitSegments.orderIndex))
        .all() as unknown as (typeof sequenceVideoSplitSegments.$inferSelect)[];
      const segmentIds = segments.map((s) => s.id);

      const candidateHits = tx
        .select({ id: shotVideoCandidates.id })
        .from(shotVideoCandidates)
        .where(
          segmentIds.length > 0
            ? or(eq(shotVideoCandidates.splitRunId, runId), inArray(shotVideoCandidates.splitSegmentId, segmentIds))
            : eq(shotVideoCandidates.splitRunId, runId)
        )
        .all() as unknown as { id: number }[];

      if (candidateHits.length > 0) {
        deleteResult = "protected";
        return;
      }

      runSnapshot = freshRun;
      segmentsSnapshot = segments;

      // Cascades to this run's own segments (`onDelete: "cascade"` on
      // `sequenceVideoSplitSegments.splitRunId`) — no separate delete
      // needed, no migration involved, same cascade the schema already
      // establishes for every other consumer of this table.
      tx.delete(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).run();
      deleteResult = "deleted";
    });
  } catch (e) {
    if (isForeignKeyRestrictError(e)) {
      deleteResult = "protected";
    } else {
      // A real DB failure (lock contention, corruption, programming error,
      // etc.) — never silently reclassified as "protected." The directory
      // is still sitting safely in quarantine; restored below.
      transactionError = e instanceof Error ? e.message : String(e);
    }
  }

  if (transactionError !== null) {
    if (quarantined) {
      try {
        await fsPromises.rename(quarantineDir, liveDir);
      } catch (restoreErr) {
        return {
          kind: "error",
          error: `${transactionError} Additionally, its thumbnail directory could not be restored from quarantine ("${quarantineDir}"): ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }.`,
        };
      }
    }
    return { kind: "error", error: transactionError };
  }

  const finalDeleteResult = deleteResult as DeleteResult;

  if (finalDeleteResult === "already-gone") {
    if (quarantined) {
      // The DB row vanished (a concurrent cleanup already won) but this
      // call had already quarantined the directory that, by construction,
      // belonged to THIS run and nothing else — finish removing it rather
      // than leaving a `.trash-*` directory behind forever.
      //
      // REVISE (round 5, Codex finding) — `removeQuarantineDir`'s bounded
      // retry sequence (see above) already absorbs the transient-lock
      // case. If it STILL fails after every attempt, there is nothing to
      // compensate on the DB side (the row is genuinely, correctly gone —
      // deleted by whichever concurrent call actually won that race), but
      // the directory itself must never be abandoned under its disposable,
      // effectively unfindable `.trash-<timestamp>-<id>` name — that is
      // exactly the untracked orphan this finding forbids. Instead it is
      // moved BACK to its own plain, predictable path (`run-<id>`, the
      // exact location anything inspecting this run's thumbnails would
      // already look at) — never a compensation that resurrects the run
      // row itself (a concurrent caller legitimately deleted it; reviving
      // it here would be its own kind of incorrect state), but a stable,
      // addressable location a later pass (this same code path run again
      // for a stray directory of a nonexistent run, or a manual sweep)
      // can still find and finish removing once whatever held the lock
      // releases it.
      const cleanup = await removeQuarantineDir(quarantineDir);
      if (!cleanup.ok) {
        try {
          await fsPromises.rename(quarantineDir, liveDir);
          return {
            kind: "error",
            error: `Run already removed by a concurrent request. Its thumbnail directory could not be deleted after extended retries, so it was moved back to its normal location ("${liveDir}") instead of being left as an untracked quarantine copy — no DB row references it, but it remains discoverable at that path for a later cleanup pass or manual removal. ${cleanup.error}`,
          };
        } catch (restoreErr) {
          // Worst case: even moving it back failed. It remains at the
          // KNOWN quarantine path — still identifiable by the run id in
          // its own name, still explicitly reported, never silently
          // dropped as a bare "success."
          return {
            kind: "error",
            error: `Run already removed by a concurrent request. Its thumbnail directory could not be deleted after extended retries, and could also not be moved back to its normal location ("${liveDir}"): ${
              restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
            }. It remains at "${quarantineDir}" — still identifiable by this run's id — and requires manual removal. ${cleanup.error}`,
          };
        }
      }
    }
    return { kind: "already-gone" };
  }

  if (finalDeleteResult === "protected") {
    if (quarantined) {
      try {
        await fsPromises.rename(quarantineDir, liveDir);
      } catch (restoreErr) {
        return {
          kind: "error",
          error: `This run is protected, but its thumbnail directory could not be restored from quarantine ("${quarantineDir}"): ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }.`,
        };
      }
    }
    return { kind: "protected" };
  }

  // deleteResult === "deleted" — the DB row and its segments are committed
  // gone. Only now attempt to permanently remove the quarantined directory.
  if (!quarantined) return { kind: "deleted", cleanupWarning: null };
  const finalCleanup = await removeQuarantineDir(quarantineDir);
  if (finalCleanup.ok) return { kind: "deleted", cleanupWarning: null };

  // REVISE (round 3, then round 4 finding 1) — final cleanup failed AFTER
  // the DB commit: a `.trash-*` directory now exists with zero DB
  // provenance. NEVER report "deleted" here. Compensate on BOTH sides —
  // restore the directory to its live path AND re-insert the run plus
  // EVERY segment, each with its exact original id/values (from the
  // snapshot captured inside the transaction, before the delete ran) —
  // then report failure so the user can retry.
  //
  // The DB side is now ONE synchronous transaction (`db.transaction`),
  // never independent inserts: better-sqlite3 transactions are ACID —
  // a failure on ANY insert (run or any one segment) throws and the
  // transaction driver rolls back everything already written inside it,
  // so the DB can only ever end up in exactly one of two states — fully
  // restored or fully NOT restored — never a partially-restored run with
  // some but not all of its segments (the round-3 gap this closes).
  let dirRestored = false;
  try {
    await fsPromises.rename(quarantineDir, liveDir);
    dirRestored = true;
  } catch {
    /* directory stuck under quarantineDir — reported explicitly below, never silently */
  }

  let dbRestored = false;
  let dbRestoreError: string | null = null;
  if (runSnapshot) {
    const run = runSnapshot as typeof sequenceVideoSplitRuns.$inferSelect;
    const segs = segmentsSnapshot;
    try {
      db.transaction((tx) => {
        tx.insert(sequenceVideoSplitRuns)
          .values({
            id: run.id,
            sequenceId: run.sequenceId,
            sequenceVideoDraftId: run.sequenceVideoDraftId,
            sourceVideoPathSnapshot: run.sourceVideoPathSnapshot,
            sourceDurationSeconds: run.sourceDurationSeconds,
            sourceFps: run.sourceFps,
            sourceWidth: run.sourceWidth,
            sourceHeight: run.sourceHeight,
            engineVersion: run.engineVersion,
            sceneThreshold: run.sceneThreshold,
            minSegmentDurationSeconds: run.minSegmentDurationSeconds,
            paramsJson: run.paramsJson,
            rawCandidatesJson: run.rawCandidatesJson,
            expectedShotCount: run.expectedShotCount,
            expectedShotOrderSnapshot: run.expectedShotOrderSnapshot,
            status: run.status,
            errorMessage: run.errorMessage,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            validatedAt: run.validatedAt,
          })
          .run();

        for (const seg of segs) {
          tx.insert(sequenceVideoSplitSegments)
            .values({
              id: seg.id,
              splitRunId: seg.splitRunId,
              orderIndex: seg.orderIndex,
              startSeconds: seg.startSeconds,
              endSeconds: seg.endSeconds,
              confidence: seg.confidence,
              boundaryProvenance: seg.boundaryProvenance,
              targetShotId: seg.targetShotId,
              status: seg.status,
              thumbnailPath: seg.thumbnailPath,
              createdAt: seg.createdAt,
              updatedAt: seg.updatedAt,
            })
            .run();
        }
      });
      dbRestored = true;
    } catch (e) {
      // Transaction threw — better-sqlite3 has already rolled back every
      // insert attempted inside it. Nothing partial survives; `dbRestored`
      // stays false and the exact DB error is reported below.
      dbRestoreError = e instanceof Error ? e.message : String(e);
    }
  }

  const totalSegments = segmentsSnapshot.length;
  if (dirRestored && dbRestored) {
    return {
      kind: "error",
      error: `Final thumbnail cleanup failed, but this run was fully restored (directory, run row, and all ${totalSegments} segment(s)) — nothing was lost. Please retry.`,
    };
  }
  return {
    kind: "error",
    error: `Final thumbnail cleanup failed and automatic recovery was incomplete (directory ${
      dirRestored ? "restored" : "NOT restored"
    }, database rows ${dbRestored ? "restored" : `NOT restored — rolled back atomically, no partial Split Plan${dbRestoreError ? `: ${dbRestoreError}` : ""}`}). Please check this run manually before retrying.`,
  };
}

export async function clearUnusedSplitRuns(formData: FormData): Promise<void> {
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const sequenceVideoDraftId = parseInt(formData.get("sequenceVideoDraftId") as string, 10);
  const currentRunIdRaw = (formData.get("currentRunId") as string | null)?.trim() ?? "";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid request.");
  }
  if (!Number.isInteger(sequenceVideoDraftId) || sequenceVideoDraftId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid Sequence Video draft.");
  }
  // REVISE (round 2, finding 2) — `currentRunId` must be a genuine,
  // strictly-positive integer. A malformed value (`NaN`, blank, non-digit)
  // must be REFUSED outright, never silently treated as "nothing is
  // protected" — `NaN !== id` is true for every id, which would have
  // exposed the actually-displayed run to deletion.
  if (!/^\d+$/.test(currentRunIdRaw)) {
    errRedirectTo(returnTo, "splitError", "Invalid current run reference.");
  }
  const currentRunId = parseInt(currentRunIdRaw, 10);
  if (!Number.isInteger(currentRunId) || currentRunId <= 0) {
    errRedirectTo(returnTo, "splitError", "Invalid current run reference.");
  }

  const [draft] = await db
    .select({ id: sequenceVideoDrafts.id, sequenceId: sequenceVideoDrafts.sequenceId })
    .from(sequenceVideoDrafts)
    .where(eq(sequenceVideoDrafts.id, sequenceVideoDraftId));
  if (!draft || draft.sequenceId !== sequenceId) {
    errRedirectTo(returnTo, "splitError", "Sequence Video draft not found or does not belong to this Sequence.");
  }

  // REVISE (round 2, finding 2) — `currentRunId` is trusted as "the
  // protected run" only after confirming server-side that it actually
  // belongs to this exact draft and Sequence. An id for a different draft,
  // a different Sequence, or a run that doesn't exist at all is refused
  // outright — never silently treated as "no run is protected," which
  // would let the genuinely-displayed run become a deletion candidate.
  const [currentRun] = await db
    .select({ id: sequenceVideoSplitRuns.id, sequenceVideoDraftId: sequenceVideoSplitRuns.sequenceVideoDraftId, sequenceId: sequenceVideoSplitRuns.sequenceId })
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.id, currentRunId));
  if (!currentRun || currentRun.sequenceVideoDraftId !== sequenceVideoDraftId || currentRun.sequenceId !== sequenceId) {
    errRedirectTo(returnTo, "splitError", "The currently displayed run could not be confirmed for this draft — refusing to clean up.");
  }

  const runsForDraft = await db
    .select({ id: sequenceVideoSplitRuns.id })
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.sequenceVideoDraftId, sequenceVideoDraftId));
  const candidateIds = runsForDraft.map((r) => r.id).filter((id) => id !== currentRunId);

  let deletedCount = 0;
  let protectedCount = 0;
  const cleanupWarnings: string[] = [];
  const hardErrors: string[] = [];

  for (const runId of candidateIds) {
    const outcome = await deleteOneUnusedRun(runId, currentRunId, sequenceVideoDraftId);
    if (outcome.kind === "already-gone") continue;
    if (outcome.kind === "protected") {
      protectedCount++;
    } else if (outcome.kind === "deleted") {
      deletedCount++;
      if (outcome.cleanupWarning) cleanupWarnings.push(`Run #${runId}: ${outcome.cleanupWarning}`);
    } else {
      // REVISE (round 2, finding 3) — a real transactional/filesystem
      // failure is surfaced with its own context, never folded into
      // "protected/skipped."
      hardErrors.push(`Run #${runId}: ${outcome.error}`);
    }
  }

  if (deletedCount === 0 && protectedCount === 0 && hardErrors.length === 0) {
    cleanupRedirectTo(returnTo, "No unused past runs to clean up.");
  }

  let message = `${deletedCount} run(s) deleted`;
  if (protectedCount > 0) message += `, ${protectedCount} run(s) protected/skipped`;
  message += ".";
  if (cleanupWarnings.length > 0) {
    message += ` Warning: some thumbnail directories could not be fully removed — ${cleanupWarnings.join(" ")}`;
  }
  if (hardErrors.length > 0) {
    message += ` Error: some runs could not be evaluated and were left untouched — ${hardErrors.join(" ")}`;
  }
  cleanupRedirectTo(returnTo, message);
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

/**
 * REVISE (SEQGEN.SPLIT.CLEANUP.1 retake, `FB-20260719-002`) — dedicated to
 * the two Split actions only (`okRedirectTo`'s existing signature/behavior
 * is untouched for every other caller). Carries the server-certain
 * `newSegmentId` (from `performSplitAtSeconds`'s own `.returning()`) so the
 * client can select and seek to the exact newly-inserted second half —
 * never guessing it client-side via a float `startSeconds` match or "the
 * last segment in the list."
 */
function splitOkRedirectTo(returnTo: string, newSegmentId: number, warning?: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  let url = `${returnTo}${sep}splitEdited=1&newSegmentId=${newSegmentId}`;
  if (warning) url += `&splitWarning=${encodeURIComponent(warning)}`;
  redirect(url);
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

  splitOkRedirectTo(returnTo, newSegmentId, warning ?? undefined);
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

  splitOkRedirectTo(returnTo, newSegmentId, warning ?? undefined);
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
