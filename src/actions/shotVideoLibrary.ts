"use server";

// ---------------------------------------------------------------------------
// shotVideoLibrary.ts — SHOT.VIDEO.LIBRARY.1
//
// The unified, source-agnostic actions for a Shot's durable video library
// (`shot_videos`): save a generation output into the library (never
// approves), approve any library entry as the Shot's output (works
// identically for a "generation" or "sequence_split" entry — the single
// source of truth stays `shots.approvedVideoPath`, exactly mirroring
// `approveShotVideoCandidate`'s own established convention), and delete a
// library entry.
//
// STRICT scope: never mutates `sequence_editorial_items`, never
// creates/publishes a Sequence/Film Result on its own, never touches
// OpenReel or the ComfyUI generation runtime/job runner/polling.
// ---------------------------------------------------------------------------

import { unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { shots, sequences, shotVideos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isWithinShotVideosRoot } from "@/lib/shotVideoLibrary/paths";
import { ensureVideoOutputSavedToLibrary } from "@/lib/shotVideoLibrary/ensureSaved";
import { approveShotVideoPath } from "@/lib/shotVideoLibrary/approve";
import { deleteShotVideoCandidate } from "@/actions/sequenceVideoPush";

function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

function okRedirectTo(returnTo: string, param: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=1`);
}

// ---------------------------------------------------------------------------
// Save a generation job's output into the durable library — NEVER approves.
// ---------------------------------------------------------------------------

export async function saveVideoOutputToLibrary(formData: FormData): Promise<void> {
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const jobId = parseInt(formData.get("jobId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (!Number.isInteger(shotId) || shotId <= 0 || !Number.isInteger(jobId) || jobId <= 0) {
    errRedirectTo(returnTo, "libraryError", "Invalid request.");
  }

  const wasAlreadySaved = (await db.select({ id: shotVideos.id }).from(shotVideos).where(eq(shotVideos.generationJobId, jobId))).length > 0;

  const result = await ensureVideoOutputSavedToLibrary(jobId, shotId);
  if (!result.ok) {
    errRedirectTo(returnTo, "libraryError", result.error);
  }

  // No `revalidatePath` needed here: saving to the library never changes
  // `shots.approvedVideoPath`, so no Sequence/Project-level derived display
  // (which only ever reads the approved pointer, never the library) is
  // affected. The Shot Detail page itself is always freshly server-rendered
  // on the redirect below.
  okRedirectTo(returnTo, wasAlreadySaved ? "libraryAlreadySaved" : "librarySaved");
}

// ---------------------------------------------------------------------------
// Approve any library entry (either source) as the Shot's output.
// ---------------------------------------------------------------------------

export async function approveShotVideo(formData: FormData): Promise<void> {
  const shotVideoId = parseInt(formData.get("shotVideoId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![shotVideoId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "libraryError", "Invalid request.");
  }

  const [entry] = await db.select().from(shotVideos).where(eq(shotVideos.id, shotVideoId));
  if (!entry) errRedirectTo(returnTo, "libraryError", "Video not found.");
  if (entry.shotId !== shotId) errRedirectTo(returnTo, "libraryError", "Video does not belong to this Shot.");

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) errRedirectTo(returnTo, "libraryError", "Shot not found.");
  if (shot.sequenceId !== sequenceId) errRedirectTo(returnTo, "libraryError", "Shot does not belong to this Sequence.");

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirectTo(returnTo, "libraryError", "Sequence not found.");
  if (sequence.projectId !== projectId) errRedirectTo(returnTo, "libraryError", "Sequence does not belong to this Project.");

  // Shared with `approveVideoOutput` (src/actions/generation.ts) — the ONE
  // place that ever writes `shots.approvedVideoPath` and outdates dependent
  // Sequence/Film Results, so neither surface can silently bypass the
  // other's invalidation (REVISE round 1, finding 3). The old approved file
  // is intentionally NEVER deleted here, same explicit product rule as
  // before.
  const result = await approveShotVideoPath(shotId, entry.videoPath);
  if (!result.ok) {
    errRedirectTo(returnTo, "libraryError", result.error);
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}`);
  revalidatePath(`/projects/${projectId}`);
  okRedirectTo(returnTo, "libraryApproved");
}

// ---------------------------------------------------------------------------
// Delete a library entry. Refuses the currently-approved video. A
// "sequence_split" entry delegates to the existing, hardened
// `deleteShotVideoCandidate` (its file/provenance owner) — this function
// never duplicates that quarantine/restore machinery, it reuses it. A
// "generation" entry owns its file directly and is deleted with the exact
// same quarantine/synchronous-transaction/unlink-or-restore discipline.
// ---------------------------------------------------------------------------

export async function deleteShotVideo(formData: FormData): Promise<void> {
  const shotVideoId = parseInt(formData.get("shotVideoId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![shotVideoId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "libraryError", "Invalid request.");
  }

  const [entry] = await db.select().from(shotVideos).where(eq(shotVideos.id, shotVideoId));
  if (!entry) errRedirectTo(returnTo, "libraryError", "Video not found.");
  if (entry.shotId !== shotId) errRedirectTo(returnTo, "libraryError", "Video does not belong to this Shot.");

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) errRedirectTo(returnTo, "libraryError", "Shot not found.");
  if (shot.sequenceId !== sequenceId) errRedirectTo(returnTo, "libraryError", "Shot does not belong to this Sequence.");

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirectTo(returnTo, "libraryError", "Sequence not found.");
  if (sequence.projectId !== projectId) errRedirectTo(returnTo, "libraryError", "Sequence does not belong to this Project.");

  if (shot.approvedVideoPath === entry.videoPath) {
    errRedirectTo(returnTo, "libraryError", "This video is the currently approved Shot output and cannot be deleted. Approve a different video first.");
  }

  if (entry.source === "sequence_split") {
    if (entry.sourceCandidateId === null) {
      errRedirectTo(returnTo, "libraryError", "This Split-sourced video is missing its candidate link and cannot be safely deleted.");
    }
    // `deleteShotVideoCandidate` performs its own full ownership-chain
    // check, quarantine, transaction, and redirect — including deleting
    // this very `shot_videos` row via the `sourceCandidateId` FK's
    // `onDelete: "cascade"`. It always ends in a `redirect()` (thrown),
    // which propagates out of this function exactly as intended — this
    // function never catches it.
    const delegateFd = new FormData();
    delegateFd.set("candidateId", String(entry.sourceCandidateId));
    delegateFd.set("shotId", String(shotId));
    delegateFd.set("sequenceId", String(sequenceId));
    delegateFd.set("projectId", String(projectId));
    delegateFd.set("returnTo", returnTo);
    await deleteShotVideoCandidate(delegateFd);
    return; // unreachable — deleteShotVideoCandidate always redirects
  }

  // source === "generation" — this row owns its file directly.
  const publicRoot = path.resolve(process.cwd(), "public");
  const absolute = path.resolve(publicRoot, entry.videoPath);
  if (!isWithinShotVideosRoot(absolute)) {
    errRedirectTo(returnTo, "libraryError", "This video's file path is not in the expected location and cannot be safely deleted.");
  }

  const quarantinePath = `${absolute}.trash-${Date.now()}-${shotVideoId}`;
  let quarantined = false;
  try {
    renameSync(absolute, quarantinePath);
    quarantined = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      errRedirectTo(returnTo, "libraryError", "Failed to prepare the file for deletion — nothing was changed. Please try again.");
    }
  }

  let raceDetected = false;
  try {
    db.transaction((tx) => {
      const [freshShot] = tx.select().from(shots).where(eq(shots.id, shotId)).all();
      if (freshShot && freshShot.approvedVideoPath === entry.videoPath) {
        raceDetected = true;
        throw new Error("SHOT_VIDEO_APPROVED_RACE");
      }
      tx.delete(shotVideos).where(eq(shotVideos.id, shotVideoId)).run();
    });
  } catch (e) {
    let restoreFailure: string | null = null;
    if (quarantined) {
      try {
        renameSync(quarantinePath, absolute);
      } catch (restoreErr) {
        restoreFailure = `Additionally, failed to restore the file from quarantine ("${quarantinePath}"): ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`;
      }
    }
    const base = raceDetected
      ? "This video was just approved as the Shot output by another request and cannot be deleted."
      : e instanceof Error
        ? e.message
        : "Failed to delete this video — nothing was changed. Please try again.";
    errRedirectTo(returnTo, "libraryError", restoreFailure ? `${base} ${restoreFailure}` : base);
  }

  if (quarantined) {
    try {
      unlinkSync(quarantinePath);
    } catch {
      // Same non-best-effort discipline as `deleteShotVideoCandidate`: the
      // DB row is already gone, so a failed final cleanup would otherwise
      // leave an unreachable orphan file while still announcing success.
      // Compensate on both sides, report the exact partial state, never a
      // false success.
      let fileRestored = false;
      try {
        renameSync(quarantinePath, absolute);
        fileRestored = true;
      } catch {
        /* reported explicitly below */
      }

      let rowRestored = false;
      try {
        db.insert(shotVideos)
          .values({
            id: entry.id,
            shotId: entry.shotId,
            source: entry.source,
            videoPath: entry.videoPath,
            durationSeconds: entry.durationSeconds,
            generationJobId: entry.generationJobId,
            sourceCandidateId: entry.sourceCandidateId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          })
          .run();
        rowRestored = true;
      } catch {
        /* reported explicitly below */
      }

      if (fileRestored && rowRestored) {
        errRedirectTo(returnTo, "libraryError", "Failed to finish deleting this video — nothing was changed. Please try again.");
      }
      errRedirectTo(
        returnTo,
        "libraryError",
        `Failed to finish deleting this video, and automatic recovery was incomplete (file ${fileRestored ? "restored" : "NOT restored"}, database row ${rowRestored ? "restored" : "NOT restored"}). Please check this video manually before retrying.`
      );
    }
  }

  revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  okRedirectTo(returnTo, "libraryDeleted");
}
