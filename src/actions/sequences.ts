"use server";

import { db } from "@/db";
import { sequences, shots, shotReferenceVideos } from "@/db/schema";
import { eq, max, and, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";
import { rename, unlink } from "node:fs/promises";
import path from "node:path";
import { isConfinedNavigationBackgroundPathForOwner } from "@/lib/navigationBackground/legacyNavigationBackground";
import { quarantineReferenceVideoFiles, restoreQuarantinedReferenceVideoFiles, finalizeQuarantinedReferenceVideoFiles, type ShotReferenceVideoFileRef } from "@/lib/shotReferenceVideos/fileCleanup";

export async function createSequence(projectId: number, formData: FormData) {
  const title = formData.get("title") as string;
  const summary = (formData.get("summary") as string) || null;
  const description = (formData.get("description") as string) || null;
  const narrativePurpose = (formData.get("narrative_purpose") as string) || null;
  const mood = (formData.get("mood") as string) || null;
  const locationHint = (formData.get("location_hint") as string) || null;
  const sequenceCodeRaw = (formData.get("sequence_code") as string)?.trim() || null;

  if (!title?.trim()) return;

  const [maxResult] = await db
    .select({ max: max(sequences.orderIndex) })
    .from(sequences)
    .where(eq(sequences.projectId, projectId));

  const orderIndex = (maxResult?.max ?? -1) + 1;

  // Auto-generate code if not provided
  let sequenceCode = sequenceCodeRaw;
  if (!sequenceCode) {
    const { sequenceTemplate } = await getNomenclatureSettings();
    const existingCodes = await db
      .select({ sequenceCode: sequences.sequenceCode })
      .from(sequences)
      .where(eq(sequences.projectId, projectId));
    sequenceCode = generateNextCode(sequenceTemplate, existingCodes.map((r) => r.sequenceCode));
  }

  const [seq] = await db
    .insert(sequences)
    .values({
      projectId,
      sequenceCode,
      title: title.trim(),
      summary,
      description,
      narrativePurpose,
      mood,
      locationHint,
      orderIndex,
    })
    .returning({ id: sequences.id });

  redirect(`/projects/${projectId}/sequences/${seq.id}`);
}

export async function updateSequence(
  id: number,
  projectId: number,
  formData: FormData
) {
  const title = formData.get("title") as string;
  const summary = (formData.get("summary") as string) || null;
  const description = (formData.get("description") as string) || null;
  const narrativePurpose = (formData.get("narrative_purpose") as string) || null;
  const mood = (formData.get("mood") as string) || null;
  const locationHint = (formData.get("location_hint") as string) || null;

  if (!title?.trim()) return;

  await db
    .update(sequences)
    .set({
      title: title.trim(),
      summary,
      description,
      narrativePurpose,
      mood,
      locationHint,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sequences.id, id));

  redirect(`/projects/${projectId}/sequences/${id}`);
}

/**
 * UX.MEDIA.PREVIEW.1 (Retake Round 1) — a Sequence's row background is
 * file-backed under uploads/navigation-backgrounds/. `db.delete(sequences)`
 * removes the row (and cascades any child rows), but never touches the
 * filesystem, so the file is quarantined BEFORE the DB delete and only
 * permanently removed AFTER it commits — a DB failure restores the file
 * untouched, mirroring the discipline in
 * deleteProject/deleteProjectStyleReferenceAction.
 *
 * Round 1 fix (Codex P1): `projectId` is now actually verified — both at
 * collection time and again, synchronously, inside the SAME transaction
 * that deletes the row, alongside a recheck of the exact background path
 * collected. A background published/replaced (or a Sequence reassigned to
 * a different Project) between collection and delete rolls the whole
 * transaction back — the quarantined file is then restored and nothing is
 * lost, rather than being cascade-deleted from the DB while surviving,
 * orphaned, on disk. The DELETE itself is conditioned on BOTH ids, so an
 * `id` belonging to a different Project can never be deleted here.
 */
async function deleteSequenceRow(id: number, projectId: number): Promise<void> {
  const [row] = await db
    .select({ rowBackgroundImagePath: sequences.rowBackgroundImagePath, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, id));
  if (!row || row.projectId !== projectId) {
    throw new Error(`deleteSequence(${id}): Sequence not found in Project ${projectId}.`);
  }

  // SHOT.VIDEO.REFERENCES.1 — `shot_reference_videos.shotId` is `onDelete:
  // "cascade"`, so deleting this Sequence's Shots (cascaded from
  // `shots.sequenceId -> sequences.id`, also cascade) transitively cascades
  // every Video Reference row this Sequence owns. The cascade removes ROWS
  // only, never files — every such file is quarantined BEFORE the
  // transaction and permanently unlinked only AFTER it commits, same
  // discipline as `deleteProject`'s own quarantine lists.
  const sequenceShotIds = (await db.select({ id: shots.id }).from(shots).where(eq(shots.sequenceId, id))).map((s) => s.id);
  const referenceVideoRows: ShotReferenceVideoFileRef[] =
    sequenceShotIds.length > 0
      ? await db
          .select({ id: shotReferenceVideos.id, shotId: shotReferenceVideos.shotId, videoPath: shotReferenceVideos.videoPath })
          .from(shotReferenceVideos)
          .where(inArray(shotReferenceVideos.shotId, sequenceShotIds))
      : [];
  const quarantinedRefVideos = await quarantineReferenceVideoFiles(referenceVideoRows, `deleteSequence(${id})`);

  const imagePath = row.rowBackgroundImagePath;
  // Retake Round 2 (Codex P1) — owner-aware: must be confined to THIS
  // Sequence's own `sequence-<id>` subfolder, not just somewhere under the
  // shared navigation-backgrounds root.
  if (imagePath && !isConfinedNavigationBackgroundPathForOwner(imagePath, "sequence", id)) {
    throw new Error(
      `deleteSequence(${id}): refusing to delete — this Sequence's row background is not confined to this Sequence's own subfolder ("${imagePath}"). Fix this row manually before retrying.`
    );
  }

  const publicRoot = path.join(process.cwd(), "public");
  const absolute = imagePath ? path.join(publicRoot, imagePath) : null;
  const quarantineAbsolute = absolute ? `${absolute}.trash-${Date.now()}-${id}` : null;

  let quarantined = false;
  if (absolute && quarantineAbsolute) {
    try {
      await rename(absolute, quarantineAbsolute);
      quarantined = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw new Error(
          `deleteSequence(${id}): failed to prepare the row background for deletion — nothing was changed: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  }

  try {
    db.transaction((tx) => {
      const currentRows = tx
        .select({ rowBackgroundImagePath: sequences.rowBackgroundImagePath, projectId: sequences.projectId })
        .from(sequences)
        .where(eq(sequences.id, id))
        .all() as { rowBackgroundImagePath: string | null; projectId: number }[];
      const current = currentRows[0];
      if (!current) {
        throw new Error(`Sequence #${id} disappeared before delete.`);
      }
      if (current.projectId !== projectId) {
        throw new Error(`Sequence #${id} no longer belongs to Project ${projectId} (now Project ${current.projectId}).`);
      }
      if (current.rowBackgroundImagePath !== imagePath) {
        throw new Error(
          `Sequence #${id}'s row background changed after file collection began (was ${JSON.stringify(imagePath)}, now ${JSON.stringify(current.rowBackgroundImagePath)}). Rollback — quarantine the new file and retry.`
        );
      }
      // Anti-race for Video References — the same set of rows/paths
      // collected above, re-verified inside this same transaction.
      const currentRefVideos = sequenceShotIds.length > 0 ? tx.select({ id: shotReferenceVideos.id, videoPath: shotReferenceVideos.videoPath }).from(shotReferenceVideos).where(inArray(shotReferenceVideos.shotId, sequenceShotIds)).all() : [];
      if (currentRefVideos.length !== referenceVideoRows.length || currentRefVideos.some((r) => referenceVideoRows.find((orig) => orig.id === r.id)?.videoPath !== r.videoPath)) {
        throw new Error(`Sequence #${id}'s Video References changed after file collection began. Rollback — retry.`);
      }
      const deleted = tx
        .delete(sequences)
        .where(and(eq(sequences.id, id), eq(sequences.projectId, projectId)))
        .run();
      if (deleted.changes === 0) {
        throw new Error(`Sequence #${id} delete affected 0 rows (concurrent change) — rollback.`);
      }
    });
  } catch (e) {
    const refVideoRestored = await restoreQuarantinedReferenceVideoFiles(quarantinedRefVideos);
    const refVideoSuffix = refVideoRestored ? "" : " Additionally, one or more Video Reference file(s) could not be automatically restored; please check this Sequence's Shots manually.";
    if (quarantined && quarantineAbsolute && absolute) {
      try {
        await rename(quarantineAbsolute, absolute);
      } catch (restoreErr) {
        throw new Error(
          `deleteSequence(${id}): DB delete failed (${e instanceof Error ? e.message : String(e)}), and the row background could not be restored from quarantine ("${quarantineAbsolute}"): ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }.${refVideoSuffix}`
        );
      }
    }
    throw new Error(`deleteSequence(${id}): DB delete failed — nothing was changed. ${e instanceof Error ? e.message : String(e)}${refVideoSuffix}`);
  }

  const refVideoAllRemoved = await finalizeQuarantinedReferenceVideoFiles(quarantinedRefVideos);
  if (!refVideoAllRemoved) {
    throw new Error(
      `deleteSequence(${id}): the Sequence was deleted successfully, but one or more of its Shots' Video Reference files could not be fully removed from the server. This does not affect data integrity — retry removing them manually later.`
    );
  }

  if (quarantined && quarantineAbsolute) {
    try {
      await unlink(quarantineAbsolute);
    } catch (e) {
      // The Sequence and its DB rows are already gone; a leftover quarantined
      // file is unreferenced but must be reported, not silently swallowed.
      throw new Error(
        `deleteSequence(${id}): the Sequence was deleted successfully, but its row background file could not be fully removed and remains at "${quarantineAbsolute}": ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }
}

export async function deleteSequence(id: number, projectId: number) {
  await deleteSequenceRow(id, projectId);
  redirect(`/projects/${projectId}`);
}

export async function deleteSequenceAndReturn(sequenceId: number, projectId: number, returnTo: string) {
  await deleteSequenceRow(sequenceId, projectId);
  redirect(returnTo);
}

export async function updateSequenceContext(
  sequenceId: number,
  projectId: number,
  data: {
    summary: string | null;
    description: string | null;
    narrativePurpose: string | null;
    mood: string | null;
    locationHint: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const [seq] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
    if (!seq) return { ok: false, error: "Sequence not found." };
    await db
      .update(sequences)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(sequences.id, sequenceId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save. Please try again." };
  }
}

export async function updateSequencePrompt(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const rawPrompt = formData.get("sequencePrompt");
  const sequencePromptValue = typeof rawPrompt === "string" ? rawPrompt : "";
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}sequencePromptError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found or does not belong to this project.");
  }

  const value = sequencePromptValue.trim() === "" ? null : sequencePromptValue;

  await db
    .update(sequences)
    .set({ sequencePrompt: value, updatedAt: new Date().toISOString() })
    .where(eq(sequences.id, sequenceId));

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}sequencePromptSaved=1`);
}
