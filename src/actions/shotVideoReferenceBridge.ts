"use server";

// ---------------------------------------------------------------------------
// shotVideoReferenceBridge.ts — SHOT.VIDEO.REFERENCES.1
//
// The two explicit, physical-copy bridges between `shot_videos` (durable
// generation/split OUTPUTS) and `shot_reference_videos` (user-imported
// creative SOURCES). Neither direction shares a file or a DB row with the
// other collection — each copies the media into its OWN destination root
// with a fresh UUID name and inserts a brand-new row, so a later deletion of
// either side can never damage the other (the product decision this ticket
// implements verbatim).
//
// Idempotency note: unlike `ensureVideoOutputSavedToLibrary` (which has a
// natural DB-level dedup key — one `generation_jobs.id` can only ever be
// saved once, enforced by a UNIQUE constraint), a plain "duplicate this
// file" action has no equivalent natural key — every successful call is
// legitimately a NEW, distinct copy. "A double click never creates two
// copies" is therefore enforced at the UI layer, via a real per-form
// `useRef` lock acquired synchronously (see `LockedActionForm.tsx`) — a
// `useFormStatus().pending` flag alone is NOT synchronous enough (it only
// flips after React has started the submission), which is why Retake Round 1
// replaced the earlier `useFormStatus`-only button with that lock.
//
// Retake Round 1 (Codex P1/P2):
//   - Both directions now re-read the EXACT source row (identity + owner +
//     stored path) a SECOND time, inside the SAME transaction that writes
//     the destination row — a concurrent delete/path-change/owner-change of
//     the source between the pre-copy snapshot and the commit now rolls the
//     whole write back instead of durably publishing a copy of a source that
//     no longer matches what the user actually saw.
//   - Every cleanup of an orphaned copied file (source went stale, or the
//     destination write itself failed) now goes through
//     `removeOrphanedPublishedFile` (mediaPublish.ts), which reports whether
//     the file was actually removed — the redirect message is built from
//     that honest boolean, never a silently-discarded cleanup outcome.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shots, sequences, shotVideos, shotReferenceVideos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import path from "node:path";
import { access } from "node:fs/promises";
import { publishCopiedVideoFile, removeOrphanedPublishedFile } from "@/lib/shotReferenceVideos/mediaPublish";
import { isEligibleShotTargetDuration } from "@/lib/shotReferenceVideos/videoValidation";
import { SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE, shotReferenceVideoPathFor, isWithinShotReferenceVideosRoot } from "@/lib/shotReferenceVideos/paths";
import { SHOT_VIDEOS_ROOT_RELATIVE, shotVideoLibraryPathFor, isWithinShotVideosRoot } from "@/lib/shotVideoLibrary/paths";
import { isOwnershipChainCurrent } from "@/lib/shotReferenceVideos/ownershipChain";
// Retake Round 3 (Codex P1) — moved to a plain (non-`"use server"`) module:
// exporting a sync function directly from this file would silently void its
// whole export surface at build time. See failureMessages.ts's own header
// comment.
import { BRIDGE_SOURCE_CHANGED as SOURCE_CHANGED, BRIDGE_CHAIN_CHANGED as CHAIN_CHANGED, bridgeFailureMessage } from "@/lib/shotReferenceVideos/failureMessages";

function errRedirectTo(returnTo: string, param: string, msg: string): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${encodeURIComponent(msg)}`);
}

function okRedirectTo(returnTo: string, param: string, value = "1"): never {
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}${param}=${value}`);
}

async function verifyOwnershipChain(shotId: number, sequenceId: number, projectId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) return { ok: false, error: "Shot not found." };
  if (shot.sequenceId !== sequenceId) return { ok: false, error: "Shot does not belong to this Sequence." };
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) return { ok: false, error: "Sequence not found." };
  if (sequence.projectId !== projectId) return { ok: false, error: "Sequence does not belong to this Project." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shot Video -> Video Reference ("Duplicate as Video Reference")
// ---------------------------------------------------------------------------

export async function duplicateShotVideoAsReference(formData: FormData): Promise<void> {
  const shotVideoId = parseInt(formData.get("shotVideoId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![shotVideoId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "refVideoError", "Invalid request.");
  }

  const ownership = await verifyOwnershipChain(shotId, sequenceId, projectId);
  if (!ownership.ok) errRedirectTo(returnTo, "refVideoError", ownership.error);

  const [source] = await db.select().from(shotVideos).where(eq(shotVideos.id, shotVideoId));
  if (!source) errRedirectTo(returnTo, "refVideoError", "Shot Video not found.");
  if (source.shotId !== shotId) errRedirectTo(returnTo, "refVideoError", "Shot Video does not belong to this Shot.");

  const publicRoot = path.resolve(process.cwd(), "public");
  const sourceAbsolute = path.resolve(publicRoot, source.videoPath);
  const ownedByThisShot = source.videoPath.startsWith(`${SHOT_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/`);
  if (!isWithinShotVideosRoot(sourceAbsolute) || !ownedByThisShot) {
    errRedirectTo(returnTo, "refVideoError", "This video's file path is not in the expected location and cannot be duplicated.");
  }
  try {
    await access(sourceAbsolute);
  } catch {
    errRedirectTo(returnTo, "refVideoError", "The source video file is missing on disk and cannot be duplicated.");
  }

  const ext = path.extname(source.videoPath).toLowerCase();
  const published = await publishCopiedVideoFile(sourceAbsolute, ext, (uuid, extension) => shotReferenceVideoPathFor(shotId, uuid, extension));
  if (!published.ok) errRedirectTo(returnTo, "refVideoError", published.error);

  const destAbsolute = path.resolve(publicRoot, published.relative);

  try {
    db.transaction((tx) => {
      // Retake Round 2 (Codex P1) — re-verify Shot -> Sequence -> Project a
      // SECOND time, synchronously inside this transaction: the Shot could
      // have been moved to a different Sequence (or that Sequence to a
      // different Project) while the copy/probe was in flight, after
      // `verifyOwnershipChain()` already passed above.
      if (!isOwnershipChainCurrent(tx, shotId, sequenceId, projectId)) {
        throw new Error(CHAIN_CHANGED);
      }

      // Retake Round 1 (Codex P1) — re-read the EXACT source row inside this
      // transaction, after the copy but before the destination write. A
      // concurrent delete, re-path, or Shot re-parent of the source between
      // the pre-copy snapshot above and this commit must roll the whole
      // write back — the copy already sitting at `published.relative` is
      // cleaned up by the catch block below, never left durably referenced
      // by a fresh row.
      const [freshSource] = tx.select().from(shotVideos).where(eq(shotVideos.id, shotVideoId)).all();
      if (!freshSource || freshSource.shotId !== shotId || freshSource.videoPath !== source.videoPath) {
        throw new Error(SOURCE_CHANGED);
      }

      const nextOrderIndex = tx
        .select({ orderIndex: shotReferenceVideos.orderIndex })
        .from(shotReferenceVideos)
        .where(eq(shotReferenceVideos.shotId, shotId))
        .all()
        .reduce((max, r) => Math.max(max, r.orderIndex), -1) + 1;

      tx.insert(shotReferenceVideos)
        .values({
          shotId,
          orderIndex: nextOrderIndex,
          videoPath: published.relative,
          sourceFilename: null,
          label: null,
          notes: `Duplicated from Shot Video #${source.id}.`,
          durationSeconds: published.metadata.durationSeconds,
          width: published.metadata.width,
          height: published.metadata.height,
        })
        .run();
    });
  } catch (e) {
    const fileRemoved = await removeOrphanedPublishedFile(destAbsolute, `duplicateShotVideoAsReference(shotVideoId=${shotVideoId})`);
    errRedirectTo(returnTo, "refVideoError", bridgeFailureMessage(e, fileRemoved));
  }

  okRedirectTo(returnTo, "refVideoDuplicated");
}

// ---------------------------------------------------------------------------
// Video Reference -> Shot Videos ("Add to Shot Videos")
// ---------------------------------------------------------------------------

export async function addReferenceVideoToShotVideos(formData: FormData): Promise<void> {
  const referenceVideoId = parseInt(formData.get("referenceVideoId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const updateTargetDuration = formData.get("updateTargetDuration") === "1";
  const returnTo = (formData.get("returnTo") as string | null)?.trim() || "/";

  if (![referenceVideoId, shotId, sequenceId, projectId].every((n) => Number.isInteger(n))) {
    errRedirectTo(returnTo, "libraryError", "Invalid request.");
  }

  const ownership = await verifyOwnershipChain(shotId, sequenceId, projectId);
  if (!ownership.ok) errRedirectTo(returnTo, "libraryError", ownership.error);

  const [source] = await db.select().from(shotReferenceVideos).where(eq(shotReferenceVideos.id, referenceVideoId));
  if (!source) errRedirectTo(returnTo, "libraryError", "Video Reference not found.");
  if (source.shotId !== shotId) errRedirectTo(returnTo, "libraryError", "Video Reference does not belong to this Shot.");

  const publicRoot = path.resolve(process.cwd(), "public");
  const sourceAbsolute = path.resolve(publicRoot, source.videoPath);
  const ownedByThisShot = source.videoPath.startsWith(`${SHOT_REFERENCE_VIDEOS_ROOT_RELATIVE}/shot-${shotId}/`);
  if (!isWithinShotReferenceVideosRoot(sourceAbsolute) || !ownedByThisShot) {
    errRedirectTo(returnTo, "libraryError", "This Video Reference's file path is not in the expected location and cannot be added.");
  }
  try {
    await access(sourceAbsolute);
  } catch {
    errRedirectTo(returnTo, "libraryError", "The source Video Reference file is missing on disk and cannot be added.");
  }

  const ext = path.extname(source.videoPath).toLowerCase();
  const published = await publishCopiedVideoFile(sourceAbsolute, ext, (uuid, extension) => shotVideoLibraryPathFor(shotId, uuid, extension));
  if (!published.ok) errRedirectTo(returnTo, "libraryError", published.error);

  const willUpdateDuration = updateTargetDuration && isEligibleShotTargetDuration(published.metadata.durationSeconds);
  const destAbsolute = path.resolve(publicRoot, published.relative);

  try {
    db.transaction((tx) => {
      // Retake Round 2 (Codex P1) — same second, synchronous chain re-check
      // as the other bridge direction (see its own comment above).
      if (!isOwnershipChainCurrent(tx, shotId, sequenceId, projectId)) {
        throw new Error(CHAIN_CHANGED);
      }

      // Retake Round 1 (Codex P1) — re-read the EXACT Video Reference source
      // row inside this same transaction, covering the identity/owner/path
      // metadata this write (including the optional duration update, which
      // is always derived from the freshly re-probed COPY, never a stored
      // value) depends on. A concurrent delete or path change of the source
      // rolls the whole write back.
      const [freshSource] = tx.select().from(shotReferenceVideos).where(eq(shotReferenceVideos.id, referenceVideoId)).all();
      if (!freshSource || freshSource.shotId !== shotId || freshSource.videoPath !== source.videoPath) {
        throw new Error(SOURCE_CHANGED);
      }

      tx.insert(shotVideos)
        .values({
          shotId,
          source: "reference_copy",
          videoPath: published.relative,
          durationSeconds: published.metadata.durationSeconds,
        })
        .run();

      if (willUpdateDuration) {
        tx.update(shots)
          .set({ durationSeconds: published.metadata.durationSeconds, updatedAt: new Date().toISOString() })
          .where(eq(shots.id, shotId))
          .run();
      }
    });
  } catch (e) {
    const fileRemoved = await removeOrphanedPublishedFile(destAbsolute, `addReferenceVideoToShotVideos(referenceVideoId=${referenceVideoId})`);
    errRedirectTo(returnTo, "libraryError", bridgeFailureMessage(e, fileRemoved));
  }

  if (willUpdateDuration) {
    // Only the target-duration write changes anything a cached parent
    // surface might display; a plain library insert needs no revalidation,
    // exactly mirroring `saveVideoOutputToLibrary`'s own reasoning.
    revalidatePath(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
  }
  okRedirectTo(returnTo, "libraryAddedFromReference", willUpdateDuration ? "duration" : "1");
}
