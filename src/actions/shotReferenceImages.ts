"use server";
import { db } from "@/db";
import { shots, sequences, shotReferenceImages, assets, assetReferenceImages, storyboardImages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import {
  saveReferenceImage,
  deleteStoredReferenceImage,
  SaveReferenceImageError,
} from "@/lib/uploadImage";
import { isReferenceImageRoleAvailableFor } from "@/lib/referenceImageRoles";

// REFROLE.MVP.1 — validated against the shared catalogue
// (src/lib/referenceImageRoles.ts) instead of a locally duplicated
// whitelist. The literal type still comes from the schema's own inferred
// insert type (single source of truth for typing); the catalogue is the
// single source of truth for which values are actually accepted.
type ImageRole = NonNullable<typeof shotReferenceImages.$inferInsert.imageRole>;

function isImageRole(value: string): value is ImageRole {
  return isReferenceImageRoleAvailableFor(value, "shot");
}

function getString(formData: FormData, key: string): string {
  return formData.get(key)?.toString().trim() ?? "";
}

function normalizeOptionalString(value: string): string | null {
  return value.length > 0 ? value : null;
}

function mapUploadError(error: unknown): string {
  if (error instanceof SaveReferenceImageError) {
    switch (error.code) {
      case "missing_file": return "missing_file";
      case "invalid_file": return "invalid_file";
      case "file_too_large": return "file_too_large";
      case "invalid_file_type": return "invalid_file_type";
    }
  }
  return "invalid_file";
}

async function verifyChain(
  shotId: number,
  sequenceId: number,
  projectId: number
): Promise<boolean> {
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return false;

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return false;

  return true;
}

function shotDetailPath(projectId: number, sequenceId: number, shotId: number) {
  return `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;
}

export async function createShotReferenceImage(
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  const imageFile = formData.get("imageFile");
  const label = normalizeOptionalString(getString(formData, "label"));
  const imageRoleRaw = getString(formData, "imageRole");
  const imageRole = imageRoleRaw && isImageRole(imageRoleRaw) ? imageRoleRaw : null;
  const notes = normalizeOptionalString(getString(formData, "notes"));

  let imagePath: string;
  let sourceFilename: string | null;

  try {
    const result = await saveReferenceImage(imageFile, `shot-${shotId}`);
    imagePath = result.imagePath;
    sourceFilename = result.sourceFilename;
  } catch (err) {
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/new?error=${mapUploadError(err)}`
    );
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shotId));

  try {
    await db.insert(shotReferenceImages).values({
      shotId,
      orderIndex: maxOrder + 1,
      imagePath,
      sourceFilename,
      label,
      imageRole,
      notes,
    });
  } catch {
    await deleteStoredReferenceImage(imagePath);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/new?error=upload_failed`
    );
  }

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}

export async function updateShotReferenceImage(
  imageId: number,
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const [existing] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, imageId));

  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  const label = normalizeOptionalString(getString(formData, "label"));
  const imageRoleRaw = getString(formData, "imageRole");
  const imageRole = imageRoleRaw && isImageRole(imageRoleRaw) ? imageRoleRaw : null;
  const notes = normalizeOptionalString(getString(formData, "notes"));

  const imageFile = formData.get("imageFile");
  const hasNewFile =
    imageFile !== null &&
    typeof imageFile === "object" &&
    "size" in imageFile &&
    (imageFile as { size: number }).size > 0;

  let newImagePath = existing.imagePath;
  let newSourceFilename = existing.sourceFilename;

  if (hasNewFile) {
    try {
      const result = await saveReferenceImage(imageFile, `shot-${shotId}`);
      newImagePath = result.imagePath;
      newSourceFilename = result.sourceFilename;
    } catch (err) {
      redirect(
        `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/${imageId}/edit?error=${mapUploadError(err)}`
      );
    }
  }

  try {
    await db
      .update(shotReferenceImages)
      .set({
        label,
        imageRole,
        notes,
        imagePath: newImagePath,
        sourceFilename: newSourceFilename,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(shotReferenceImages.id, imageId));
  } catch {
    if (hasNewFile) await deleteStoredReferenceImage(newImagePath);
    redirect(
      `${shotDetailPath(projectId, sequenceId, shotId)}/reference-images/${imageId}/edit?error=upload_failed`
    );
  }

  if (hasNewFile) await deleteStoredReferenceImage(existing.imagePath);

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}

export async function captureVideoFrame(input: {
  projectId: number;
  sourceShotId: number;
  sourceSequenceId: number;
  imageFile: File;
  frameNumber: number;
  destination:
    | { type: "shot"; shotId: number; sequenceId: number }
    | { type: "asset"; assetId: number };
}): Promise<
  | { ok: true; imagePath: string; referenceId: number; destinationLabel: string }
  | { ok: false; error: string }
> {
  const { projectId, sourceShotId, sourceSequenceId, imageFile, frameNumber, destination } = input;

  // Verify source shot belongs to project
  const sourceValid = await verifyChain(sourceShotId, sourceSequenceId, projectId);
  if (!sourceValid) return { ok: false, error: "Source shot not found." };

  // Verify destination ownership
  if (destination.type === "shot") {
    const targetValid = await verifyChain(destination.shotId, destination.sequenceId, projectId);
    if (!targetValid) return { ok: false, error: "Target shot not found." };
  } else {
    const [targetAsset] = await db
      .select({ id: assets.id, projectId: assets.projectId })
      .from(assets)
      .where(eq(assets.id, destination.assetId));
    if (!targetAsset || targetAsset.projectId !== projectId) {
      return { ok: false, error: "Target asset not found." };
    }
  }

  // Save image to appropriate subfolder
  const subfolder =
    destination.type === "shot"
      ? `shot-${destination.shotId}`
      : `asset-${destination.assetId}`;

  let imagePath: string;
  let sourceFilename: string | null;

  try {
    const result = await saveReferenceImage(imageFile, subfolder);
    imagePath = result.imagePath;
    sourceFilename = result.sourceFilename;
  } catch (err) {
    if (err instanceof SaveReferenceImageError) {
      return { ok: false, error: `Upload failed: ${err.message}` };
    }
    return { ok: false, error: "Unable to save captured frame." };
  }

  // Insert reference into the correct table
  if (destination.type === "shot") {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, destination.shotId));

    const [inserted] = await db
      .insert(shotReferenceImages)
      .values({
        shotId: destination.shotId,
        orderIndex: maxOrder + 1,
        imagePath,
        sourceFilename,
        label: "Captured Frame",
        imageRole: "keyframe",
        notes: `Captured from frame ${frameNumber} of approved shot video.`,
      })
      .returning({ id: shotReferenceImages.id });

    return { ok: true, imagePath, referenceId: inserted.id, destinationLabel: "Shot Reference" };
  } else {
    const [{ maxOrder }] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
      .from(assetReferenceImages)
      .where(eq(assetReferenceImages.assetId, destination.assetId));

    const [inserted] = await db
      .insert(assetReferenceImages)
      .values({
        assetId: destination.assetId,
        orderIndex: maxOrder + 1,
        imagePath,
        sourceFilename,
        label: "Captured Frame",
        imageRole: "keyframe",
        notes: `Captured from frame ${frameNumber} of shot video.`,
      })
      .returning({ id: assetReferenceImages.id });

    return { ok: true, imagePath, referenceId: inserted.id, destinationLabel: "Asset Reference" };
  }
}

/**
 * SEQGEN.STORYBOARD.EXTRACT.1-FIX2 — mirrors deleteStoredReferenceImage's
 * exact safety pattern (path-traversal rejection, root containment check,
 * best-effort/silent failure), scoped to `uploads/storyboard-images/`
 * instead of `uploads/reference-images/`: a reference sharing a Storyboard
 * extraction's file lives under the former root, which the generic helper
 * deliberately never touches. Callers MUST already have confirmed no other
 * `storyboard_images` draft or `shot_reference_images` row still needs this
 * exact path before calling this — see deleteShotReferenceImage below.
 */
async function deleteSharedStoryboardImageFile(imagePath: string): Promise<void> {
  try {
    if (!imagePath.startsWith("uploads/storyboard-images/")) return;
    if (imagePath.includes("..") || imagePath.includes("\\") || path.isAbsolute(imagePath)) return;

    const absolutePath = path.join(process.cwd(), "public", imagePath);
    const safeBase = path.join(process.cwd(), "public", "uploads", "storyboard-images");
    if (!absolutePath.startsWith(safeBase + path.sep) && absolutePath !== safeBase) return;

    await fs.unlink(absolutePath);
  } catch {
    // best-effort — silent failure, matches deleteStoredReferenceImage's convention
  }
}

export async function deleteShotReferenceImage(
  imageId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [existing] = await db
    .select()
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.id, imageId));

  if (!existing || existing.shotId !== shotId) {
    redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);
  }

  const valid = await verifyChain(shotId, sequenceId, projectId);
  if (!valid) redirect(`${shotDetailPath(projectId, sequenceId, shotId)}?error=not_found`);

  await db.delete(shotReferenceImages).where(eq(shotReferenceImages.id, imageId));

  // SEQGEN.STORYBOARD.EXTRACT.1-FIX2 — a reference created by sharing an
  // extracted panel's file (imageRole "storyboard_frame",
  // sourceStoryboardImageId set) never owns that file exclusively: the
  // storyboard_images draft it was copied from — or any other reference row
  // — may still point at the exact same path. Never unlink while a live row
  // still needs it, regardless of how this deletion was reached.
  const [stillNeededByDraft] = await db
    .select({ id: storyboardImages.id })
    .from(storyboardImages)
    .where(eq(storyboardImages.imagePath, existing.imagePath));
  const [stillNeededByOtherReference] = await db
    .select({ id: shotReferenceImages.id })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.imagePath, existing.imagePath));

  if (!stillNeededByDraft && !stillNeededByOtherReference) {
    if (existing.imagePath.startsWith("uploads/storyboard-images/")) {
      await deleteSharedStoryboardImageFile(existing.imagePath);
    } else {
      await deleteStoredReferenceImage(existing.imagePath);
    }
  }

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}
