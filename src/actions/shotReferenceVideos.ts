"use server";

// ---------------------------------------------------------------------------
// shotReferenceVideos.ts — SHOT.VIDEO.REFERENCES.1
//
// Upload and delete for a Shot's own Video References collection
// (`shot_reference_videos`) — a separate, user-imported creative source,
// never `shot_videos`. Errors/success are reported via a redirect back to
// Shot Detail with a query param, exactly mirroring
// `shotReferenceImages.ts`'s own convention (no JSON, no phantom reload).
//
// Retake Round 1 (Codex P2) — every user-facing error string here is fixed
// and sanitized: no absolute path, no raw OS/DB error text. Concrete detail
// is always logged server-side first (via the helpers this module calls).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shots, sequences, shotReferenceVideos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import path from "node:path";
import { publishUploadedVideoBuffer, isFileLike, removeOrphanedPublishedFile } from "@/lib/shotReferenceVideos/mediaPublish";
import { shotReferenceVideoPathFor } from "@/lib/shotReferenceVideos/paths";
import { quarantineReferenceVideoFiles, restoreQuarantinedReferenceVideoFiles, finalizeQuarantinedReferenceVideoFiles } from "@/lib/shotReferenceVideos/fileCleanup";
import { isOwnershipChainCurrent } from "@/lib/shotReferenceVideos/ownershipChain";
// Retake Round 3 (Codex P1) — the sentinel error type and the pure
// failure-message classifiers live in a plain (non-`"use server"`) module:
// Next.js only allows async function exports from a `"use server"` file: a
// class or sync function exported directly from THIS file would silently
// void this whole module's exports at build time. See failureMessages.ts's
// own header comment for the full rationale.
import { StaleRequestError, classifyCreateFailureReason, classifyDeleteFailureReason } from "@/lib/shotReferenceVideos/failureMessages";

async function verifyChain(shotId: number, sequenceId: number, projectId: number): Promise<boolean> {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return false;
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return false;
  return true;
}

function shotDetailPath(projectId: number, sequenceId: number, shotId: number): string {
  return `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;
}

export async function createShotReferenceVideo(shotId: number, sequenceId: number, projectId: number, formData: FormData): Promise<void> {
  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent("Shot not found.")}`);

  const label = ((formData.get("label") as string | null)?.trim() || null);
  const notes = ((formData.get("notes") as string | null)?.trim() || null);
  const videoFile = formData.get("videoFile");

  const published = await publishUploadedVideoBuffer(videoFile, (uuid, ext) => shotReferenceVideoPathFor(shotId, uuid, ext));

  if ("validationError" in published) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent(published.validationError.message)}`);
  }
  if (!published.ok) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent(published.error)}`);
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const sourceFilename = isFileLike(videoFile) ? videoFile.name || null : null;

  try {
    db.transaction((tx) => {
      // Retake Round 2 (Codex P1) — re-verify Shot -> Sequence -> Project a
      // SECOND time, synchronously, inside the same transaction as the
      // insert: the Shot could have been moved to a different Sequence (or
      // that Sequence to a different Project) while the upload/probe was in
      // flight, after `verifyChain()` already passed above.
      if (!isOwnershipChainCurrent(tx, shotId, sequenceId, projectId)) {
        throw new StaleRequestError("chain");
      }

      const orderRows = tx.select({ orderIndex: shotReferenceVideos.orderIndex }).from(shotReferenceVideos).where(eq(shotReferenceVideos.shotId, shotId)).all();
      const nextOrderIndex = orderRows.reduce((max, r) => Math.max(max, r.orderIndex), -1) + 1;

      tx.insert(shotReferenceVideos)
        .values({
          shotId,
          orderIndex: nextOrderIndex,
          videoPath: published.relative,
          sourceFilename,
          label,
          notes,
          durationSeconds: published.metadata.durationSeconds,
          width: published.metadata.width,
          height: published.metadata.height,
        })
        .run();
    });
  } catch (e) {
    const cleaned = await removeOrphanedPublishedFile(path.resolve(publicRoot, published.relative), `createShotReferenceVideo(shot=${shotId})`);
    if (!(e instanceof StaleRequestError)) {
      console.error(`createShotReferenceVideo(shot=${shotId}): transaction failed:`, e);
    }
    const base = classifyCreateFailureReason(e);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent(
        cleaned ? base : `${base} A temporary file may remain on the server; please try again or contact support.`
      )}`
    );
  }

  redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoAdded=1`);
}

export async function deleteShotReferenceVideo(id: number, shotId: number, sequenceId: number, projectId: number): Promise<void> {
  const [existing] = await db.select().from(shotReferenceVideos).where(eq(shotReferenceVideos.id, id));
  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent("Video Reference not found.")}`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent("Shot not found.")}`);

  let quarantined;
  try {
    quarantined = await quarantineReferenceVideoFiles([{ id: existing.id, shotId: existing.shotId, videoPath: existing.videoPath }], `deleteShotReferenceVideo(${id})`);
  } catch (e) {
    // Retake Round 3 (Codex P1) — `quarantineReferenceVideoFiles` already
    // throws only its own fixed, sanitized messages (see fileCleanup.ts),
    // but this public boundary must not depend on that staying true forever
    // either: log the real error, always redirect with one fixed string.
    console.error(`deleteShotReferenceVideo(${id}): quarantine preparation failed:`, e);
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent("Failed to prepare this Video Reference for deletion — nothing was changed. Please try again.")}`);
  }

  try {
    db.transaction((tx) => {
      // Retake Round 2 (Codex P1) — same second, synchronous chain re-check
      // as the create/bridge paths: a concurrent Shot/Sequence re-parent
      // during the quarantine window must roll this delete back too.
      if (!isOwnershipChainCurrent(tx, shotId, sequenceId, projectId)) {
        throw new StaleRequestError("chain");
      }
      const [freshRow] = tx.select().from(shotReferenceVideos).where(eq(shotReferenceVideos.id, id)).all();
      if (!freshRow || freshRow.videoPath !== existing.videoPath) {
        throw new StaleRequestError("row");
      }
      tx.delete(shotReferenceVideos).where(eq(shotReferenceVideos.id, id)).run();
    });
  } catch (e) {
    const restored = await restoreQuarantinedReferenceVideoFiles(quarantined);
    if (!(e instanceof StaleRequestError)) {
      // Retake Round 3 (Codex P1) — never echo an arbitrary caught value;
      // log it server-side and fall back to one fixed generic message.
      console.error(`deleteShotReferenceVideo(${id}): transaction failed:`, e);
    }
    const base = classifyDeleteFailureReason(e);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent(restored ? base : `${base} Additionally, its file could not be automatically restored; please check this Shot's Video References manually.`)}`
    );
  }

  const allRemoved = await finalizeQuarantinedReferenceVideoFiles(quarantined);
  if (!allRemoved) {
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}?refVideoError=${encodeURIComponent(
        "This Video Reference was deleted, but its file could not be fully removed from the server. This does not affect other references — please retry cleanup later or contact support."
      )}`
    );
  }

  redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?refVideoDeleted=1`);
}
