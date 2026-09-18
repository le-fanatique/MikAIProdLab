import "server-only";

import fs from "fs/promises";
import path from "path";
import { db } from "@/db";
import { invokeBoards, invokePushedImages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildInvokeBoardName, type InvokeBoardNameInput } from "@/lib/invoke/invokeBoardName";
import {
  createInvokeBoard,
  uploadInvokeImage,
  assertInvokeSingleUser,
  getConfiguredInvokeBaseUrl,
} from "@/lib/invoke/invokeServerClient";
import { ensureSendToMikaiWorkflowInstalled } from "@/lib/invoke/invokeWorkflowInstall";
import { getInvokePublicBaseUrl } from "@/lib/settings";

// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.1, ticket §1.5. Owner
// resolution/ownership verification stays in the calling Server Action
// (mirrors `attachOutputAsAssetReference` in src/actions/generation.ts —
// never trust a bare id). This module is only the push mechanics once an
// owner has already been verified to belong to its project.

export interface PushImageToInvokeBoardArgs {
  ownerType: "shot" | "asset" | "shot_storyboard" | "sequence_storyboard" | "project_style";
  ownerId: number;
  boardNameInput: InvokeBoardNameInput;
  /** public/-relative path of the image to push. */
  imagePath: string;
  metadata: Record<string, unknown>;
}

export type PushImageToInvokeResult =
  | { ok: true; boardName: string; invokeUrl: string }
  | { ok: false; error: string };

function isInvokeNotFoundError(err: unknown): boolean {
  return err instanceof Error && /responded 404/.test(err.message);
}

async function readImageBytes(imagePath: string): Promise<{ bytes: Buffer; filename: string }> {
  const rawPath = imagePath.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, rawPath);

  // Same confinement check as uploadImageToComfy/attachOutputAsAssetReference's own copy work.
  if (!absolutePath.startsWith(publicRoot + path.sep) && absolutePath !== publicRoot) {
    throw new Error(`pushImageToInvokeBoard: path "${imagePath}" escapes the public/ directory.`);
  }

  const bytes = await fs.readFile(absolutePath);
  return { bytes, filename: path.basename(absolutePath) };
}

async function resolveOrCreateBoard(args: {
  ownerType: "shot" | "asset" | "shot_storyboard" | "sequence_storyboard" | "project_style";
  ownerId: number;
  boardNameInput: InvokeBoardNameInput;
}): Promise<{ id: number; boardId: string; boardName: string }> {
  const [existing] = await db
    .select()
    .from(invokeBoards)
    .where(and(eq(invokeBoards.ownerType, args.ownerType), eq(invokeBoards.ownerId, args.ownerId)));
  if (existing) return { id: existing.id, boardId: existing.boardId, boardName: existing.boardName };

  const boardName = buildInvokeBoardName(args.boardNameInput);
  const created = await createInvokeBoard(boardName);
  const now = new Date().toISOString();
  const [row] = await db
    .insert(invokeBoards)
    .values({
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      boardId: created.boardId,
      boardName: created.boardName,
      lastKnownImageCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { id: row.id, boardId: row.boardId, boardName: row.boardName };
}

/**
 * Pushes one image to the Invoke board of an already-verified owner (§1.5):
 * resolves or creates the board, uploads the image with its provenance
 * metadata, records the pushed image, and points the "Send to MikAI"
 * workflow's board default at this board.
 *
 * Self-healing against a board deleted on the Invoke side (404 on upload):
 * the stale `invoke_boards` row is dropped and a fresh board created, then
 * the upload is retried exactly once.
 */
export async function pushImageToInvokeBoard(args: PushImageToInvokeBoardArgs): Promise<PushImageToInvokeResult> {
  let baseUrl: string;
  try {
    baseUrl = await getConfiguredInvokeBaseUrl();
    await assertInvokeSingleUser(baseUrl);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach InvokeAI." };
  }

  let board: { id: number; boardId: string; boardName: string };
  try {
    board = await resolveOrCreateBoard(args);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resolve the Invoke board for this entity.",
    };
  }

  let bytes: Buffer;
  let filename: string;
  try {
    const read = await readImageBytes(args.imagePath);
    bytes = read.bytes;
    filename = read.filename;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not read the source image." };
  }

  let uploaded: { imageName: string };
  try {
    uploaded = await uploadInvokeImage({ boardId: board.boardId, bytes, filename, metadata: args.metadata });
  } catch (err) {
    if (!isInvokeNotFoundError(err)) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not upload the image to InvokeAI." };
    }
    // Board deleted on the Invoke side — recreate it and retry once.
    try {
      await db.delete(invokeBoards).where(eq(invokeBoards.id, board.id));
      board = await resolveOrCreateBoard(args);
      uploaded = await uploadInvokeImage({ boardId: board.boardId, bytes, filename, metadata: args.metadata });
    } catch (retryErr) {
      return {
        ok: false,
        error: retryErr instanceof Error ? retryErr.message : "Could not upload the image to InvokeAI.",
      };
    }
  }

  try {
    await db.insert(invokePushedImages).values({
      invokeBoardId: board.id,
      imageName: uploaded.imageName,
      sourceImagePath: args.imagePath,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-fatal: the image already reached Invoke. Losing this provenance
    // row must not be reported to the author as a failed push.
  }

  try {
    await ensureSendToMikaiWorkflowInstalled(board.boardId);
  } catch {
    // Non-fatal: the image already reached its board. The workflow's board
    // default simply stays stale until the next successful push or Test
    // Connection.
  }

  // INVOKE.PUSH.1-FIX1 — what goes back to the *browser* is the public URL,
  // not the one this server process just used: they differ whenever MikAI is
  // reached remotely (tunnel, Tailscale, LAN). Same value on one machine.
  const publicBaseUrl = await getInvokePublicBaseUrl();

  return { ok: true, boardName: board.boardName, invokeUrl: publicBaseUrl };
}
