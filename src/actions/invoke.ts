"use server";

import { db } from "@/db";
import { sequences, shots, assets, shotReferenceImages, assetReferenceImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { pushImageToInvokeBoard } from "@/lib/invoke/invokePush";

// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.1, ticket §1.5. Two
// entry points, one per owner kind this lot supports (shot, asset — lot 3
// widens this). Both verify the image's ownership chain up to the project
// before doing anything (mikai-method §7; precedent:
// `attachOutputAsAssetReference` in src/actions/generation.ts) — never on a
// bare id.

export async function pushShotReferenceImageToInvoke(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const imageId = parseInt(formData.get("imageId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}invokeError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(shotId) || shotId <= 0 ||
    !Number.isInteger(imageId) || imageId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirect("Sequence not found.");
  if (sequence.projectId !== projectId) errRedirect("Sequence does not belong to this project.");

  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) errRedirect("Shot not found.");
  if (shot.sequenceId !== sequenceId) errRedirect("Shot does not belong to this sequence.");

  const [image] = await db.select().from(shotReferenceImages).where(eq(shotReferenceImages.id, imageId));
  if (!image) errRedirect("Reference image not found.");
  if (image.shotId !== shotId) errRedirect("Reference image does not belong to this shot.");

  const result = await pushImageToInvokeBoard({
    ownerType: "shot",
    ownerId: shotId,
    boardNameInput: { ownerType: "shot", id: shotId, shotCode: shot.shotCode, title: shot.title },
    imagePath: image.imagePath,
    metadata: {
      mikai_project_id: projectId,
      mikai_owner_type: "shot",
      mikai_owner_id: shotId,
      mikai_source_image_path: image.imagePath,
    },
  });

  if (!result.ok) errRedirect(result.error);

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(
    `${returnTo}${sep}invokePushed=1&invokeBoardName=${encodeURIComponent(result.boardName)}&invokeUrl=${encodeURIComponent(result.invokeUrl)}`
  );
}

export async function pushAssetReferenceImageToInvoke(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const assetId = parseInt(formData.get("assetId") as string, 10);
  const imageId = parseInt(formData.get("imageId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() || `/projects/${projectId}/assets/${assetId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}invokeError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(assetId) || assetId <= 0 ||
    !Number.isInteger(imageId) || imageId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) errRedirect("Asset not found.");
  if (asset.projectId !== projectId) errRedirect("Asset does not belong to this project.");

  const [image] = await db.select().from(assetReferenceImages).where(eq(assetReferenceImages.id, imageId));
  if (!image) errRedirect("Reference image not found.");
  if (image.assetId !== assetId) errRedirect("Reference image does not belong to this asset.");

  const result = await pushImageToInvokeBoard({
    ownerType: "asset",
    ownerId: assetId,
    boardNameInput: { ownerType: "asset", id: assetId, name: asset.name },
    imagePath: image.imagePath,
    metadata: {
      mikai_project_id: projectId,
      mikai_owner_type: "asset",
      mikai_owner_id: assetId,
      mikai_source_image_path: image.imagePath,
    },
  });

  if (!result.ok) errRedirect(result.error);

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(
    `${returnTo}${sep}invokePushed=1&invokeBoardName=${encodeURIComponent(result.boardName)}&invokeUrl=${encodeURIComponent(result.invokeUrl)}`
  );
}
