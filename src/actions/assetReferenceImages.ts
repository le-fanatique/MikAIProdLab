"use server";
import { db } from "@/db";
import { assets, assetReferenceImages } from "@/db/schema";
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

async function verifyAsset(assetId: number, projectId: number) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== projectId) return null;
  return asset;
}

export async function createAssetReferenceImage(
  assetId: number,
  projectId: number,
  formData: FormData
) {
  const asset = await verifyAsset(assetId, projectId);
  if (!asset) redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);

  const imageFile = formData.get("imageFile");
  const label = normalizeOptionalString(getString(formData, "label"));
  const imageRoleRaw = getString(formData, "imageRole");
  const imageRole = imageRoleRaw && isImageRole(imageRoleRaw) ? imageRoleRaw : null;
  const notes = normalizeOptionalString(getString(formData, "notes"));

  let imagePath: string;
  let sourceFilename: string | null;

  try {
    const result = await saveReferenceImage(imageFile, `asset-${assetId}`);
    imagePath = result.imagePath;
    sourceFilename = result.sourceFilename;
  } catch (err) {
    redirect(
      `/projects/${projectId}/assets/${assetId}/reference-images/new?error=${mapUploadError(err)}`
    );
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, assetId));

  try {
    await db.insert(assetReferenceImages).values({
      assetId,
      orderIndex: maxOrder + 1,
      imagePath,
      sourceFilename,
      label,
      imageRole,
      notes,
    });
  } catch {
    await deleteStoredReferenceImage(imagePath);
    redirect(`/projects/${projectId}/assets/${assetId}/reference-images/new?error=upload_failed`);
  }

  redirect(`/projects/${projectId}/assets/${assetId}`);
}

export async function updateAssetReferenceImage(
  imageId: number,
  assetId: number,
  projectId: number,
  formData: FormData
) {
  const [existing] = await db
    .select()
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.id, imageId));

  if (!existing || existing.assetId !== assetId) {
    redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);
  }

  const asset = await verifyAsset(assetId, projectId);
  if (!asset) redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);

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
      const result = await saveReferenceImage(imageFile, `asset-${assetId}`);
      newImagePath = result.imagePath;
      newSourceFilename = result.sourceFilename;
    } catch (err) {
      redirect(
        `/projects/${projectId}/assets/${assetId}/reference-images/${imageId}/edit?error=${mapUploadError(err)}`
      );
    }
  }

  try {
    await db
      .update(assetReferenceImages)
      .set({
        label,
        imageRole,
        notes,
        imagePath: newImagePath,
        sourceFilename: newSourceFilename,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(assetReferenceImages.id, imageId));
  } catch {
    if (hasNewFile) await deleteStoredReferenceImage(newImagePath);
    redirect(
      `/projects/${projectId}/assets/${assetId}/reference-images/${imageId}/edit?error=upload_failed`
    );
  }

  if (hasNewFile) await deleteStoredReferenceImage(existing.imagePath);

  redirect(`/projects/${projectId}/assets/${assetId}`);
}

export async function deleteAssetReferenceImage(
  imageId: number,
  assetId: number,
  projectId: number
) {
  const [existing] = await db
    .select()
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.id, imageId));

  if (!existing || existing.assetId !== assetId) {
    redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);
  }

  const asset = await verifyAsset(assetId, projectId);
  if (!asset) redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);

  await db.delete(assetReferenceImages).where(eq(assetReferenceImages.id, imageId));

  await deleteStoredReferenceImage(existing.imagePath);

  redirect(`/projects/${projectId}/assets/${assetId}`);
}
