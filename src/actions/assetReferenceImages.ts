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

// ASSET.BIBLE.2 — legacy values kept exactly as before (never rewritten),
// MVP roles added alongside. "lighting"/"style"/"other" are shared between
// the two lists, not duplicated.
const LEGACY_IMAGE_ROLES = ["reference", "keyframe", "character", "environment"] as const;
const MVP_IMAGE_ROLES = [
  "identity",
  "full_body",
  "expression",
  "pose",
  "costume",
  "environment_view",
  // GEN.SEEDANCE.3
  "first_frame",
  "last_frame",
  "lighting",
  "prop_state",
  "style",
  "other",
] as const;
const IMAGE_ROLES = [...LEGACY_IMAGE_ROLES, ...MVP_IMAGE_ROLES] as const;

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
  // ASSET.BIBLE.2 — additive metadata, independent of label/notes.
  const variantState = normalizeOptionalString(getString(formData, "variantState"));
  const usageNotes = normalizeOptionalString(getString(formData, "usageNotes"));
  // Never approved implicitly on upload — approval is always a separate,
  // explicit action (setAssetReferenceImageApproval or the edit form's
  // checkbox), never a side effect of adding an image.

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
      variantState,
      usageNotes,
      approvedForGeneration: false,
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
  // ASSET.BIBLE.2 — additive metadata, independent of label/notes.
  const variantState = normalizeOptionalString(getString(formData, "variantState"));
  const usageNotes = normalizeOptionalString(getString(formData, "usageNotes"));
  // Explicit checkbox on the edit form — an unchecked box submits nothing,
  // so its absence means false, exactly mirroring what the user sees. A
  // file replacement in this same submit never changes this value on its
  // own: it only changes if the user explicitly (un)checks the box.
  const approvedForGeneration = formData.get("approvedForGeneration") === "on";

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
        variantState,
        usageNotes,
        approvedForGeneration,
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

// ── Explicit approval toggle (ASSET.BIBLE.2) ──────────────────────────────
// The single dedicated entry point for changing approvedForGeneration from
// Asset Detail's reference image list — never touched implicitly by upload
// or by replacing a file. `approved` is the exact next value the user chose
// (a toggle button always sends the opposite of the currently-displayed
// state, never inferred).
export async function setAssetReferenceImageApproval(
  imageId: number,
  assetId: number,
  projectId: number,
  approved: boolean
) {
  const [existing] = await db
    .select({ assetId: assetReferenceImages.assetId })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.id, imageId));

  if (!existing || existing.assetId !== assetId) {
    redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);
  }

  const asset = await verifyAsset(assetId, projectId);
  if (!asset) redirect(`/projects/${projectId}/assets/${assetId}?error=not_found`);

  await db
    .update(assetReferenceImages)
    .set({ approvedForGeneration: approved, updatedAt: new Date().toISOString() })
    .where(eq(assetReferenceImages.id, imageId));

  redirect(`/projects/${projectId}/assets/${assetId}`);
}
