"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  assets,
  assetReferenceImages,
  shots,
  sequences,
  shotReferenceImages,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const MAX_DECODED_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_NOTES_LENGTH = 1000;

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function buildNotes(prompt?: string, model?: string): string | null {
  const parts: string[] = [];
  if (prompt?.trim()) parts.push(`Prompt:\n${prompt.trim()}`);
  if (model?.trim()) parts.push(`Model:\n${model.trim()}`);
  if (parts.length === 0) return null;
  return parts.join("\n\n").slice(0, MAX_NOTES_LENGTH);
}

/**
 * Saves an image generated in the LLM Chat image mode as an Asset or Shot
 * reference image. Ownership is always re-validated server-side — the
 * client-parsed route context is never trusted.
 */
export async function saveLLMChatImageAsReference(input: {
  targetType: "shot" | "asset";
  projectId: number;
  shotId?: number;
  assetId?: number;
  imageDataUrl: string;
  prompt?: string;
  model?: string;
}): Promise<
  | { ok: true; referenceId: number; imagePath: string }
  | { ok: false; error: string }
> {
  try {
    // --- Validate target ---
    if (input.targetType !== "shot" && input.targetType !== "asset") {
      return { ok: false, error: "Invalid save target." };
    }
    const projectId = input.projectId;
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid project." };
    }

    // --- Validate data URL ---
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(
      input.imageDataUrl ?? ""
    );
    if (!match) {
      return { ok: false, error: "Invalid image data." };
    }
    const mime = match[1].toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (!ext) {
      return { ok: false, error: "Unsupported image type." };
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(match[2], "base64");
    } catch {
      return { ok: false, error: "Invalid image data." };
    }
    if (buffer.length === 0) {
      return { ok: false, error: "Invalid image data." };
    }
    if (buffer.length > MAX_DECODED_BYTES) {
      return { ok: false, error: "Image is too large." };
    }

    // --- Ownership checks + target folder ---
    let subfolder: string;
    let revalidateTarget: string;

    if (input.targetType === "asset") {
      const assetId = input.assetId;
      if (!Number.isInteger(assetId) || !assetId || assetId <= 0) {
        return { ok: false, error: "Invalid asset." };
      }
      const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
      if (!asset || asset.projectId !== projectId) {
        return { ok: false, error: "Asset not found in this project." };
      }
      subfolder = `asset-${assetId}`;
      revalidateTarget = `/projects/${projectId}/assets/${assetId}`;
    } else {
      const shotId = input.shotId;
      if (!Number.isInteger(shotId) || !shotId || shotId <= 0) {
        return { ok: false, error: "Invalid shot." };
      }
      const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
      if (!shot) {
        return { ok: false, error: "Shot not found." };
      }
      const [sequence] = await db
        .select()
        .from(sequences)
        .where(eq(sequences.id, shot.sequenceId));
      if (!sequence || sequence.projectId !== projectId) {
        return { ok: false, error: "Shot not found in this project." };
      }
      subfolder = `shot-${shotId}`;
      revalidateTarget = `/projects/${projectId}/sequences/${sequence.id}/shots/${shotId}`;
    }

    // --- Write file (same conventions as existing reference images) ---
    const filename = `${randomUUID()}${ext}`;
    const publicRoot = path.join(process.cwd(), "public");
    const destDir = path.join(publicRoot, "uploads", "reference-images", subfolder);
    const destAbsolute = path.join(destDir, filename);

    // Path traversal guard — subfolder/filename are server-generated, belt and braces
    const safeBase = path.join(publicRoot, "uploads", "reference-images");
    if (!destAbsolute.startsWith(safeBase + path.sep)) {
      return { ok: false, error: "Invalid image data." };
    }

    await mkdir(destDir, { recursive: true });
    await writeFile(destAbsolute, buffer);

    const imagePath = `uploads/reference-images/${subfolder}/${filename}`;
    const notes = buildNotes(input.prompt, input.model);

    // --- DB insert ---
    let referenceId: number;

    if (input.targetType === "asset") {
      const assetId = input.assetId!;
      const [{ maxOrder }] = await db
        .select({
          maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)`,
        })
        .from(assetReferenceImages)
        .where(eq(assetReferenceImages.assetId, assetId));

      const [inserted] = await db
        .insert(assetReferenceImages)
        .values({
          assetId,
          orderIndex: maxOrder + 1,
          imagePath,
          sourceFilename: `llm-chat-image${ext}`,
          label: "LLM Chat Image",
          imageRole: "reference",
          notes,
        })
        .returning({ id: assetReferenceImages.id });
      referenceId = inserted.id;
    } else {
      const shotId = input.shotId!;
      const [{ maxOrder }] = await db
        .select({
          maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)`,
        })
        .from(shotReferenceImages)
        .where(eq(shotReferenceImages.shotId, shotId));

      const [inserted] = await db
        .insert(shotReferenceImages)
        .values({
          shotId,
          orderIndex: maxOrder + 1,
          imagePath,
          sourceFilename: `llm-chat-image${ext}`,
          label: "LLM Chat Image",
          imageRole: "reference",
          notes,
        })
        .returning({ id: shotReferenceImages.id });
      referenceId = inserted.id;
    }

    revalidatePath(revalidateTarget);

    return { ok: true, referenceId, imagePath };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save reference.";
    return { ok: false, error: message };
  }
}
