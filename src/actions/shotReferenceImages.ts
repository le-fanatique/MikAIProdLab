"use server";
import { db } from "@/db";
import { shots, sequences, shotReferenceImages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  saveReferenceImage,
  deleteStoredReferenceImage,
  SaveReferenceImageError,
} from "@/lib/uploadImage";

const IMAGE_ROLES = [
  "reference",
  "keyframe",
  "style",
  "lighting",
  "character",
  "environment",
  "other",
] as const;

type ImageRole = (typeof IMAGE_ROLES)[number];

function isImageRole(value: string): value is ImageRole {
  return (IMAGE_ROLES as readonly string[]).includes(value);
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

  await deleteStoredReferenceImage(existing.imagePath);

  redirect(shotDetailPath(projectId, sequenceId, shotId));
}
