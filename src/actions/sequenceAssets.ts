"use server";

import { db } from "@/db";
import { sequences, assets, sequenceAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function assignAssetToSequence(
  sequenceId: number,
  projectId: number,
  formData: FormData
) {
  const assetIdRaw = formData.get("assetId")?.toString();
  const assetId = assetIdRaw ? parseInt(assetIdRaw, 10) : NaN;
  if (isNaN(assetId)) return;

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
    await db.insert(sequenceAssets).values({ sequenceId, assetId });
  } catch {
    // Duplicate — unique constraint protects silently
  }

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}

export async function removeAssetFromSequence(
  assignmentId: number,
  sequenceId: number,
  projectId: number
) {
  const [assignment] = await db
    .select({ id: sequenceAssets.id, sequenceId: sequenceAssets.sequenceId })
    .from(sequenceAssets)
    .where(eq(sequenceAssets.id, assignmentId));
  if (!assignment || assignment.sequenceId !== sequenceId) return;

  const [sequence] = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) return;

  await db.delete(sequenceAssets).where(eq(sequenceAssets.id, assignmentId));

  redirect(`/projects/${projectId}/sequences/${sequenceId}`);
}
