"use server";

import { db } from "@/db";
import { shots, sequences, assets, shotAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function assignAssetToShot(
  shotId: number,
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const assetIdRaw = formData.get("assetId")?.toString();
  const assetId = assetIdRaw ? parseInt(assetIdRaw, 10) : NaN;
  if (isNaN(assetId)) return;

  const [shot] = await db
    .select({ id: shots.id, sequenceId: shots.sequenceId })
    .from(shots)
    .where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return;

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  const [asset] = await db
    .select({ id: assets.id, projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== projectId) return;

  try {
    await db.insert(shotAssets).values({ shotId, assetId });
  } catch {
    // Duplicate — unique constraint protects silently
  }

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}

export async function removeAssetFromShot(
  assignmentId: number,
  shotId: number,
  sequenceId: number,
  projectId: number
) {
  const [assignment] = await db
    .select({ id: shotAssets.id, shotId: shotAssets.shotId })
    .from(shotAssets)
    .where(eq(shotAssets.id, assignmentId));
  if (!assignment || assignment.shotId !== shotId) return;

  const [shot] = await db
    .select({ id: shots.id, sequenceId: shots.sequenceId })
    .from(shots)
    .where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sequenceId) return;

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  await db.delete(shotAssets).where(eq(shotAssets.id, assignmentId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`);
}
