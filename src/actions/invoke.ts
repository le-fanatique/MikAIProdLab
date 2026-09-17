"use server";

import { db } from "@/db";
import {
  sequences,
  shots,
  assets,
  shotReferenceImages,
  assetReferenceImages,
  storyboardImages,
  sequenceStoryboardImages,
} from "@/db/schema";
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

// INVOKE.PUSH.2 — docs/INVOKE_ROUNDTRIP_SPEC.md §7 decision 6: a shot's
// storyboard draft (`storyboard_images`) belongs back to the shot, but gets
// its OWN board rather than sharing the shot's `shot_reference_images`
// board — the board is the return address that decides which table lot 2
// re-imports into, so the two must never share one. Same ownership-chain
// verification up to the project as every action in this file — never on a
// bare id.
export async function pushShotStoryboardImageToInvoke(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const shotId = parseInt(formData.get("shotId") as string, 10);
  const imageId = parseInt(formData.get("imageId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() || `/projects/${projectId}/storyboard?sequenceId=${sequenceId}`;

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

  const [image] = await db.select().from(storyboardImages).where(eq(storyboardImages.id, imageId));
  if (!image) errRedirect("Storyboard draft not found.");
  if (image.shotId !== shotId) errRedirect("Storyboard draft does not belong to this shot.");

  const result = await pushImageToInvokeBoard({
    ownerType: "shot_storyboard",
    ownerId: shotId,
    boardNameInput: { ownerType: "shot_storyboard", id: shotId, shotCode: shot.shotCode, title: shot.title },
    imagePath: image.imagePath,
    metadata: {
      mikai_project_id: projectId,
      mikai_owner_type: "shot_storyboard",
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

// INVOKE.PUSH.2 — docs/INVOKE_ROUNDTRIP_SPEC.md §7 decision 6: a sequence
// storyboard draft (`sequence_storyboard_images`) belongs to the sequence
// itself — it has no shot and no asset — so it gets its own board, and any
// image landing there returns to `sequence_storyboard_images`, never to a
// shot's or asset's own table.
export async function pushSequenceStoryboardImageToInvoke(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const imageId = parseInt(formData.get("imageId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() || `/projects/${projectId}/storyboard?sequenceId=${sequenceId}`;

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}invokeError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0 ||
    !Number.isInteger(imageId) || imageId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) errRedirect("Sequence not found.");
  if (sequence.projectId !== projectId) errRedirect("Sequence does not belong to this project.");

  const [image] = await db.select().from(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.id, imageId));
  if (!image) errRedirect("Sequence Storyboard draft not found.");
  if (image.sequenceId !== sequenceId) errRedirect("Sequence Storyboard draft does not belong to this sequence.");

  const result = await pushImageToInvokeBoard({
    ownerType: "sequence_storyboard",
    ownerId: sequenceId,
    boardNameInput: {
      ownerType: "sequence_storyboard",
      id: sequenceId,
      sequenceCode: sequence.sequenceCode,
      title: sequence.title,
    },
    imagePath: image.imagePath,
    metadata: {
      mikai_project_id: projectId,
      mikai_owner_type: "sequence_storyboard",
      mikai_owner_id: sequenceId,
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
