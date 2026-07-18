"use server";

// ---------------------------------------------------------------------------
// sequenceVideoPush.ts — SEQGEN.PUSH.1
//
// Consumes an explicitly `validated` Split Plan: cuts each active segment
// into a permanent clip and attaches it to its mapped Shot as a durable
// video candidate — never an auto-approved Shot output. Also owns the two
// Shot Detail lifecycle actions for those candidates (`Approve as Shot
// Output`, `Delete Candidate`), since both operate on the same
// `shot_video_candidates` row this file introduces and share its ownership-
// chain checks.
//
// STRICT scope: never mutates `sequence_editorial_items`, never
// creates/publishes a Sequence/Film Result, never touches OpenReel or the
// ComfyUI generation runtime, never changes a validated Split Plan's own
// segments/boundaries. `approveShotVideoCandidate` is the ONLY action in
// this file that ever writes `shots.approvedVideoPath` or outdates
// dependent Results — the push itself never does.
// ---------------------------------------------------------------------------

import { unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots, shotVideoCandidates, sequenceResults, filmResults } from "@/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { resolveSequenceVideoDraftAbsolutePath, DetectVideoSplitsError } from "@/lib/sequenceVideoSplit/detectVideoSplits";
import { cutSegmentClip, sourceHasAudioStream, deleteShotVideoCandidateFile, SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE } from "@/lib/sequenceVideoPush/cutSegmentClip";

function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

function okRedirectTo(returnTo: string, param: string, extra?: Record<string, string>): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  let url = `${returnTo}${sep}${param}=1`;
  if (extra) for (const [k, v] of Object.entries(extra)) url += `&${k}=${encodeURIComponent(v)}`;
  redirect(url);
}

// ---------------------------------------------------------------------------
// Push Clips to Shots
// ---------------------------------------------------------------------------

export async function pushSplitPlanToShots(formData: FormData): Promise<void> {
  const runId = parseInt(formData.get("runId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(runId) || !Number.isInteger(sequenceId) || !Number.isInteger(projectId)) {
    errRedirectTo(returnTo, "pushError", "Invalid request.");
  }

  const [run] = db.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all();
  if (!run) errRedirectTo(returnTo, "pushError", "Split run not found.");
  if (run.sequenceId !== sequenceId) errRedirectTo(returnTo, "pushError", "Split run does not belong to this Sequence.");

  const [sequence] = db.select().from(sequences).where(eq(sequences.id, sequenceId)).all();
  if (!sequence) errRedirectTo(returnTo, "pushError", "Sequence not found.");
  if (sequence.projectId !== projectId) errRedirectTo(returnTo, "pushError", "Sequence does not belong to this Project.");

  const [draft] = db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, run.sequenceVideoDraftId)).all();
  if (!draft || draft.sequenceId !== sequenceId) errRedirectTo(returnTo, "pushError", "Source Sequence Video Draft not found or inconsistent.");

  if (run.status !== "validated") {
    errRedirectTo(returnTo, "pushError", "Only a validated Split Plan can be pushed.");
  }

  const sequenceShots = db.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, sequenceId)).orderBy(asc(shots.orderIndex)).all();
  const liveOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));
  if (liveOrderSnapshot !== run.expectedShotOrderSnapshot) {
    errRedirectTo(returnTo, "pushError", "The Sequence's Shot list or order has changed since this Split Plan was validated. This plan can no longer be pushed safely.");
  }

  const segments = db.select().from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.splitRunId, runId)).orderBy(asc(sequenceVideoSplitSegments.orderIndex)).all();
  const active = segments.filter((s) => s.status !== "skipped");

  if (active.length === 0) {
    errRedirectTo(returnTo, "pushError", "This Split Plan has no active segments to push.");
  }
  const unmapped = active.filter((s) => s.targetShotId === null);
  if (unmapped.length > 0) {
    errRedirectTo(returnTo, "pushError", "Every active segment must be mapped to a Shot before pushing.");
  }
  const targetCounts = new Map<number, number>();
  for (const s of active) {
    targetCounts.set(s.targetShotId!, (targetCounts.get(s.targetShotId!) ?? 0) + 1);
  }
  const duplicated = [...targetCounts.entries()].filter(([, count]) => count > 1);
  if (duplicated.length > 0) {
    errRedirectTo(returnTo, "pushError", "More than one active segment targets the same Shot — this plan is inconsistent.");
  }
  const mappedShotIds = new Set(targetCounts.keys());
  const missingShots = sequenceShots.filter((s) => !mappedShotIds.has(s.id));
  if (missingShots.length > 0) {
    errRedirectTo(returnTo, "pushError", "Not every current Shot is covered by an active segment — this plan is inconsistent.");
  }

  let sourceAbsolutePath: string;
  try {
    sourceAbsolutePath = await resolveSequenceVideoDraftAbsolutePath(run.sourceVideoPathSnapshot);
  } catch (e) {
    errRedirectTo(returnTo, "pushError", e instanceof DetectVideoSplitsError ? e.message : "Failed to resolve the source video.");
  }

  const activeSegmentIds = active.map((s) => s.id);
  const existingCandidates = db.select().from(shotVideoCandidates).where(inArray(shotVideoCandidates.splitSegmentId, activeSegmentIds)).all();

  if (existingCandidates.length === active.length) {
    // Idempotent no-op — every active segment already has its candidate.
    okRedirectTo(returnTo, "pushNoop", { pushCount: String(existingCandidates.length) });
  }
  if (existingCandidates.length > 0) {
    errRedirectTo(
      returnTo,
      "pushError",
      `This plan is in a partial pushed state (${existingCandidates.length} of ${active.length} segments already have a candidate) — this is treated as inconsistent and was never completed automatically. Contact an administrator if this needs manual repair.`
    );
  }

  let hasAudio: boolean;
  try {
    hasAudio = await sourceHasAudioStream(sourceAbsolutePath);
  } catch (e) {
    errRedirectTo(returnTo, "pushError", `Failed to probe the source video: ${e instanceof Error ? e.message : String(e)}`);
  }

  // The exact manifest the clips below are cut from — re-derived and
  // compared byte-for-byte inside the final transaction (see below) so a
  // concurrent Shot/segment mutation during the multi-second cutting batch
  // can never publish a stale mapping.
  const manifestSignature = JSON.stringify(active.map((s) => ({ id: s.id, orderIndex: s.orderIndex, targetShotId: s.targetShotId, startSeconds: s.startSeconds, endSeconds: s.endSeconds, status: s.status })));

  // Lot B — batch all-or-nothing: cut+probe every clip WITHOUT any DB write
  // first. A mid-batch failure cleans up every file this attempt produced
  // and creates zero rows.
  const produced: { segmentId: number; shotId: number; relativePath: string; startSeconds: number; endSeconds: number }[] = [];
  for (const segment of active) {
    const result = await cutSegmentClip({
      sourceAbsolutePath,
      shotId: segment.targetShotId!,
      splitSegmentId: segment.id,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      sourceFps: run.sourceFps,
      hasAudio,
    });
    if (!result.ok) {
      const cleanupWarnings: string[] = [];
      for (const p of produced) {
        const cleanup = await deleteShotVideoCandidateFile(p.relativePath);
        if (!cleanup.ok) cleanupWarnings.push(cleanup.error);
      }
      errRedirectTo(returnTo, "pushError", cleanupWarnings.length > 0 ? `${result.error} Additionally, cleanup failed for: ${cleanupWarnings.join("; ")}` : result.error);
    }
    produced.push({ segmentId: segment.id, shotId: segment.targetShotId!, relativePath: result.relativePath, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds });
  }

  // Atomic write: re-verify inside the transaction (closes both the
  // concurrent-push race window AND any Shot/segment mutation that landed
  // during the multi-second cutting batch above) before inserting the whole
  // batch. Every element of the manifest that produced `produced` above is
  // re-read and compared byte-for-byte to `manifestSignature` — a stale
  // Shot order, mapping, boundary, or segment status can never be published.
  let raceLost = false;
  let manifestDrifted = false;
  try {
    db.transaction((tx) => {
      const [freshRun] = tx.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId)).all();
      if (!freshRun || freshRun.status !== "validated") {
        throw new Error("This Split Plan is no longer in a pushable state.");
      }

      const freshShots = tx.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, sequenceId)).orderBy(asc(shots.orderIndex)).all();
      const freshOrderSnapshot = JSON.stringify(freshShots.map((s) => s.id));
      if (freshOrderSnapshot !== freshRun.expectedShotOrderSnapshot) {
        manifestDrifted = true;
        throw new Error("SEQGEN_PUSH_MANIFEST_DRIFTED");
      }

      const freshSegments = tx.select().from(sequenceVideoSplitSegments).where(eq(sequenceVideoSplitSegments.splitRunId, runId)).orderBy(asc(sequenceVideoSplitSegments.orderIndex)).all();
      const freshActive = freshSegments.filter((s) => s.status !== "skipped");
      const freshManifestSignature = JSON.stringify(freshActive.map((s) => ({ id: s.id, orderIndex: s.orderIndex, targetShotId: s.targetShotId, startSeconds: s.startSeconds, endSeconds: s.endSeconds, status: s.status })));
      if (freshManifestSignature !== manifestSignature) {
        manifestDrifted = true;
        throw new Error("SEQGEN_PUSH_MANIFEST_DRIFTED");
      }

      const stillExisting = tx.select({ id: shotVideoCandidates.id }).from(shotVideoCandidates).where(inArray(shotVideoCandidates.splitSegmentId, activeSegmentIds)).all();
      if (stillExisting.length > 0) {
        raceLost = true;
        throw new Error("SEQGEN_PUSH_RACE_LOST");
      }
      const now = new Date().toISOString();
      tx.insert(shotVideoCandidates)
        .values(
          produced.map((p) => ({
            shotId: p.shotId,
            splitRunId: runId,
            splitSegmentId: p.segmentId,
            clipPath: p.relativePath,
            sourceStartSeconds: p.startSeconds,
            sourceEndSeconds: p.endSeconds,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .run();
    });
  } catch (e) {
    // Transaction failed (lost the race to a concurrent push, or the
    // manifest drifted) — clean up ONLY this attempt's own uniquely-named
    // files, never a concurrent winner's. A cleanup failure is NEVER
    // dropped — it is always appended to whichever message is redirected.
    const cleanupWarnings: string[] = [];
    for (const p of produced) {
      const cleanup = await deleteShotVideoCandidateFile(p.relativePath);
      if (!cleanup.ok) cleanupWarnings.push(cleanup.error);
    }
    const cleanupSuffix = cleanupWarnings.length > 0 ? ` Additionally, cleanup failed for: ${cleanupWarnings.join("; ")}` : "";
    if (raceLost) {
      errRedirectTo(returnTo, "pushError", `This Split Plan was already pushed by a concurrent request.${cleanupSuffix}`);
    }
    if (manifestDrifted) {
      errRedirectTo(returnTo, "pushError", `The Sequence's Shots or this plan's segments changed while the clips were being cut — nothing was published. Re-open this plan and push again.${cleanupSuffix}`);
    }
    const base = e instanceof Error ? e.message : "Failed to record the pushed clips.";
    errRedirectTo(returnTo, "pushError", `${base}${cleanupSuffix}`);
  }

  revalidatePath(returnTo.split("?")[0]);
  for (const p of produced) {
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${p.shotId}`);
  }
  okRedirectTo(returnTo, "pushed", { pushCount: String(produced.length) });
}

// ---------------------------------------------------------------------------
// Approve as Shot Output
// ---------------------------------------------------------------------------

export async function approveShotVideoCandidate(formData: FormData): Promise<void> {
  const candidateId = parseInt(formData.get("candidateId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![candidateId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "candidateError", "Invalid request.");
  }

  const [candidate] = db.select().from(shotVideoCandidates).where(eq(shotVideoCandidates.id, candidateId)).all();
  if (!candidate) errRedirectTo(returnTo, "candidateError", "Candidate not found.");
  if (candidate.shotId !== shotId) errRedirectTo(returnTo, "candidateError", "Candidate does not belong to this Shot.");

  const [shot] = db.select().from(shots).where(eq(shots.id, shotId)).all();
  if (!shot) errRedirectTo(returnTo, "candidateError", "Shot not found.");
  if (shot.sequenceId !== sequenceId) errRedirectTo(returnTo, "candidateError", "Shot does not belong to this Sequence.");

  const [sequence] = db.select().from(sequences).where(eq(sequences.id, sequenceId)).all();
  if (!sequence) errRedirectTo(returnTo, "candidateError", "Sequence not found.");
  if (sequence.projectId !== projectId) errRedirectTo(returnTo, "candidateError", "Sequence does not belong to this Project.");

  // Single synchronous transaction: the new approved pointer and the
  // outdating of dependent Sequence/Film Results commit together or not at
  // all — inlines the same status-flip logic as
  // `outdateSequenceResultsForSequence`/`outdateFilmResultsForProject`
  // (src/actions/sequenceResults.ts, src/actions/filmResults.ts) rather
  // than calling those async helpers, since a `db.transaction` callback
  // must be synchronous. The old approved file is intentionally NEVER
  // deleted here — an explicit product rule ("never silently delete the
  // previous Approved Output").
  try {
    db.transaction((tx) => {
      const [freshCandidate] = tx.select().from(shotVideoCandidates).where(eq(shotVideoCandidates.id, candidateId)).all();
      if (!freshCandidate || freshCandidate.shotId !== shotId) {
        throw new Error("Candidate is no longer valid.");
      }
      const [freshShot] = tx.select().from(shots).where(eq(shots.id, shotId)).all();
      if (!freshShot) {
        throw new Error("Shot is no longer valid.");
      }
      // Idempotent no-op: re-approving the already-approved candidate (a
      // direct/replayed call) must never re-outdate Sequence/Film Results
      // for an output that hasn't actually changed.
      if (freshShot.approvedVideoPath === freshCandidate.clipPath) {
        return;
      }
      const now = new Date().toISOString();
      tx.update(shots).set({ approvedVideoPath: freshCandidate.clipPath, updatedAt: now }).where(eq(shots.id, shotId)).run();
      tx.update(sequenceResults)
        .set({ status: "outdated", updatedAt: now })
        .where(and(eq(sequenceResults.sequenceId, sequenceId), eq(sequenceResults.projectId, projectId), inArray(sequenceResults.status, ["active", "published"])))
        .run();
      tx.update(filmResults)
        .set({ status: "outdated", updatedAt: now })
        .where(and(eq(filmResults.projectId, projectId), inArray(filmResults.status, ["active", "published"])))
        .run();
    });
  } catch (e) {
    errRedirectTo(returnTo, "candidateError", e instanceof Error ? e.message : "Failed to approve this candidate.");
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}`);
  okRedirectTo(returnTo, "candidateApproved");
}

// ---------------------------------------------------------------------------
// Delete Candidate
// ---------------------------------------------------------------------------

export async function deleteShotVideoCandidate(formData: FormData): Promise<void> {
  const candidateId = parseInt(formData.get("candidateId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![candidateId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "candidateError", "Invalid request.");
  }

  const [candidate] = db.select().from(shotVideoCandidates).where(eq(shotVideoCandidates.id, candidateId)).all();
  if (!candidate) errRedirectTo(returnTo, "candidateError", "Candidate not found.");
  if (candidate.shotId !== shotId) errRedirectTo(returnTo, "candidateError", "Candidate does not belong to this Shot.");

  const [shot] = db.select().from(shots).where(eq(shots.id, shotId)).all();
  if (!shot) errRedirectTo(returnTo, "candidateError", "Shot not found.");
  if (shot.sequenceId !== sequenceId) errRedirectTo(returnTo, "candidateError", "Shot does not belong to this Sequence.");

  const [sequence] = db.select().from(sequences).where(eq(sequences.id, sequenceId)).all();
  if (!sequence) errRedirectTo(returnTo, "candidateError", "Sequence not found.");
  if (sequence.projectId !== projectId) errRedirectTo(returnTo, "candidateError", "Sequence does not belong to this Project.");

  if (shot.approvedVideoPath === candidate.clipPath) {
    errRedirectTo(returnTo, "candidateError", "This candidate is the currently approved Shot output and cannot be deleted. Approve a different candidate first.");
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const allowedRoot = path.join(publicRoot, SHOT_VIDEO_CANDIDATES_ROOT_RELATIVE);
  const absolute = path.resolve(publicRoot, candidate.clipPath);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    errRedirectTo(returnTo, "candidateError", "This candidate's file path is not in the expected location and cannot be safely deleted.");
  }

  // Same rename-to-quarantine / synchronous-transaction / unlink-or-restore
  // strategy as `deleteSequenceStoryboardImage` (src/actions/sequenceStoryboard.ts)
  // — a proven honest filesystem+DB delete with no orphaned file and no row
  // pointing at a missing file, even across a failure at any step.
  const quarantinePath = `${absolute}.trash-${Date.now()}-${candidateId}`;
  let quarantined = false;
  try {
    renameSync(absolute, quarantinePath);
    quarantined = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      errRedirectTo(returnTo, "candidateError", "Failed to prepare the file for deletion — nothing was changed. Please try again.");
    }
  }

  let raceDetected = false;
  try {
    db.transaction((tx) => {
      const [freshShot] = tx.select().from(shots).where(eq(shots.id, shotId)).all();
      if (freshShot && freshShot.approvedVideoPath === candidate.clipPath) {
        raceDetected = true;
        throw new Error("SHOT_VIDEO_CANDIDATE_APPROVED_RACE");
      }
      tx.delete(shotVideoCandidates).where(eq(shotVideoCandidates.id, candidateId)).run();
    });
  } catch (e) {
    let restoreFailure: string | null = null;
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute);
      } catch (restoreErr) {
        // Never silently dropped — appended to the error redirected below,
        // so a stuck quarantine file after a failed/raced delete is always
        // reported, exactly like `deleteSequenceStoryboardImage`'s own
        // hardened restore path.
        restoreFailure = `Additionally, failed to restore the file from quarantine ("${quarantinePath}"): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`;
      }
    }
    const base = raceDetected
      ? "This candidate was just approved as the Shot output by another request and cannot be deleted."
      : e instanceof Error
        ? e.message
        : "Failed to delete this candidate — nothing was changed. Please try again.";
    errRedirectTo(returnTo, "candidateError", restoreFailure ? `${base} ${restoreFailure}` : base);
  }

  if (quarantined) {
    try {
      unlinkSync(quarantinePath); // final cleanup — the row has already been committed as deleted
    } catch {
      // REVISE (round 2) — this is NOT best-effort: the DB row is already
      // gone at this point, so a failed final cleanup would otherwise leave
      // an unreachable `.trash-*` file (no row, no UI, no retry path) while
      // still announcing success — exactly the orphan the ticket forbids.
      // Compensate on BOTH sides instead, on the same hardened model as
      // `deleteSequenceStoryboardImage` (round 4): restore the file to its
      // original path AND re-insert the original row (captured from
      // `candidate` before any of this ran, including its own `id`, so the
      // restored row is indistinguishable from the one that existed before
      // this call) — then report failure so the user can retry, never
      // success. A partial compensation (only one side restored) is never
      // silently guessed at — reported as its own distinct, explicit state.
      let fileRestored = false;
      try {
        renameSync(quarantinePath, absolute);
        fileRestored = true;
      } catch {
        /* file stuck under quarantinePath — reported explicitly below, never silently */
      }

      let rowRestored = false;
      try {
        db.insert(shotVideoCandidates)
          .values({
            id: candidate.id,
            shotId: candidate.shotId,
            splitRunId: candidate.splitRunId,
            splitSegmentId: candidate.splitSegmentId,
            clipPath: candidate.clipPath,
            sourceStartSeconds: candidate.sourceStartSeconds,
            sourceEndSeconds: candidate.sourceEndSeconds,
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt,
          })
          .run();
        rowRestored = true;
      } catch {
        /* reported explicitly below */
      }

      if (fileRestored && rowRestored) {
        errRedirectTo(returnTo, "candidateError", "Failed to finish deleting this candidate — nothing was changed. Please try again.");
      }
      errRedirectTo(
        returnTo,
        "candidateError",
        `Failed to finish deleting this candidate, and automatic recovery was incomplete (file ${fileRestored ? "restored" : "NOT restored"}, database row ${rowRestored ? "restored" : "NOT restored"}). Please check this candidate manually before retrying.`
      );
    }
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  okRedirectTo(returnTo, "candidateDeleted");
}
