"use server";
import { db } from "@/db";
import { assets, shots, sequences, assetReferenceImages, shotReferenceImages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { saveReferenceImage, SaveReferenceImageError } from "@/lib/uploadImage";

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

function appendImageParam(returnTo: string, nodeId: string, runtimeId: string): string {
  const sep = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${sep}imageNode_${nodeId}=${encodeURIComponent(runtimeId)}`;
}

export async function uploadAssetSourceFromPanel(formData: FormData) {
  const assetId = parseInt(formData.get("assetId")?.toString() ?? "", 10);
  const projectId = parseInt(formData.get("projectId")?.toString() ?? "", 10);
  const nodeId = formData.get("nodeId")?.toString() ?? "";
  const returnTo = formData.get("returnTo")?.toString() ?? "/";
  const imageFile = formData.get("imageFile");

  if (!assetId || !projectId || !nodeId) redirect(returnTo);

  const [asset] = await db.select({ id: assets.id, projectId: assets.projectId })
    .from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== projectId) redirect(returnTo);

  const uploadResult = await (async () => {
    try {
      return await saveReferenceImage(imageFile, `asset-${assetId}`);
    } catch (err) {
      void mapUploadError(err);
      return null;
    }
  })();
  if (!uploadResult) redirect(returnTo);

  const { imagePath, sourceFilename } = uploadResult;

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, assetId));

  const inserted = await db
    .insert(assetReferenceImages)
    .values({
      assetId,
      orderIndex: maxOrder + 1,
      imagePath,
      sourceFilename,
      label: null,
      imageRole: null,
      notes: null,
    })
    .returning({ id: assetReferenceImages.id });

  const newDbId = inserted[0]?.id;
  if (!newDbId) redirect(returnTo);

  redirect(appendImageParam(returnTo, nodeId, `asset-${assetId}-${newDbId}`));
}

export async function uploadShotSourceFromPanel(formData: FormData) {
  const shotId = parseInt(formData.get("shotId")?.toString() ?? "", 10);
  const sequenceId = parseInt(formData.get("sequenceId")?.toString() ?? "", 10);
  const projectId = parseInt(formData.get("projectId")?.toString() ?? "", 10);
  const nodeId = formData.get("nodeId")?.toString() ?? "";
  const returnTo = formData.get("returnTo")?.toString() ?? "/";
  const imageFile = formData.get("imageFile");

  if (!shotId || !sequenceId || !projectId || !nodeId) redirect(returnTo);

  const [shot] = await db.select({ id: shots.id, sequenceId: shots.sequenceId })
    .from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) redirect(returnTo);

  const [sequence] = await db.select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) redirect(returnTo);

  const uploadResult = await (async () => {
    try {
      return await saveReferenceImage(imageFile, `shot-${shotId}`);
    } catch (err) {
      void mapUploadError(err);
      return null;
    }
  })();
  if (!uploadResult) redirect(returnTo);

  const { imagePath, sourceFilename } = uploadResult;

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shotId));

  const inserted = await db
    .insert(shotReferenceImages)
    .values({
      shotId,
      orderIndex: maxOrder + 1,
      imagePath,
      sourceFilename,
      label: null,
      imageRole: null,
      notes: null,
    })
    .returning({ id: shotReferenceImages.id });

  const newDbId = inserted[0]?.id;
  if (!newDbId) redirect(returnTo);

  redirect(appendImageParam(returnTo, nodeId, `shot-${newDbId}`));
}
