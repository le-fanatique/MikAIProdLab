import "server-only";

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/db";
import {
  invokeBoards,
  invokeImportedImages,
  invokePushedImages,
  shotReferenceImages,
  assetReferenceImages,
  storyboardImages,
  sequenceStoryboardImages,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { selectInvokeImagesToImport } from "@/lib/invoke/invokeImportDecision";
import {
  downloadInvokeImageBytes,
  getInvokeBoardImageCount,
  listInvokeBoardImages,
} from "@/lib/invoke/invokeServerClient";

// ---------------------------------------------------------------------------
// INVOKE.SYNC.1 - docs/INVOKE_ROUNDTRIP_SPEC.md section 5.3, ticket section 1.
// The return path: invokePush.ts (INVOKE.PUSH.1/.2) is the outbound half,
// this module is the inbound half - same "the Invoke board is the return
// address" principle, read backwards. Owner resolution/ownership is not
// re-verified here: invoke_boards rows are only ever created by an
// already-verified push (src/actions/invoke.ts), so a board row IS the
// ownership proof for this module's writes (mikai-method section 7 - never
// on a bare id, but a board row is not a bare id).
// ---------------------------------------------------------------------------

export type InvokeSyncOwnerType = "shot" | "asset" | "shot_storyboard" | "sequence_storyboard";

const ATTACHABLE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const DEFAULT_EXT = ".png";

/** Extension to use for a downloaded Invoke image, taken from its own image_name - never invented, and never trusted if it is not one MikAI already writes elsewhere (ATTACHABLE_IMAGE_EXTS, the same set attachOutputAsShotReference uses). */
function extensionFromInvokeImageName(imageName: string): string {
  const ext = path.extname(imageName).toLowerCase();
  return ATTACHABLE_IMAGE_EXTS.has(ext) ? ext : DEFAULT_EXT;
}

/**
 * Ticket section 1.3's destination table, exactly - folder convention and
 * table name. Deliberately not sourced from invokePush's equivalents: the
 * push side names an owner it already resolved from a live row (shot/asset
 * title), the sync side only ever has the invoke_boards row's
 * ownerType/ownerId, so this mapping is smaller and stands on its own.
 */
function destinationFolder(ownerType: InvokeSyncOwnerType, ownerId: number): { subfolder: string; destinationTable: string } {
  switch (ownerType) {
    case "asset":
      return { subfolder: `uploads/reference-images/asset-${ownerId}`, destinationTable: "asset_reference_images" };
    case "shot":
      return { subfolder: `uploads/reference-images/shot-${ownerId}`, destinationTable: "shot_reference_images" };
    case "shot_storyboard":
      return { subfolder: `uploads/storyboard-images/shot-${ownerId}`, destinationTable: "storyboard_images" };
    case "sequence_storyboard":
      return { subfolder: `uploads/sequence-storyboard-images/sequence-${ownerId}`, destinationTable: "sequence_storyboard_images" };
  }
}

function isUniqueImageNameViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed:\s*invoke_imported_images\.image_name/.test(err.message);
}

export interface ImportInvokeImageArgs {
  invokeBoardId: number;
  ownerType: InvokeSyncOwnerType;
  ownerId: number;
  imageName: string;
  bytes: Buffer;
}

export type ImportInvokeImageResult =
  | { ok: true; alreadyImported: false; destinationTable: string; destinationId: number; imagePath: string }
  | { ok: true; alreadyImported: true }
  | { ok: false; error: string };

/**
 * Writes one already-downloaded Invoke image into its board's destination
 * table (ticket section 1.3), then records it in invoke_imported_images in
 * the SAME transaction as the destination insert - so a race that loses the
 * unique-image_name insert rolls the destination row back too, never
 * leaving a half-imported row. The file is written to disk BEFORE the
 * transaction (SQLite transactions cannot cover a filesystem write); if the
 * transaction then fails for any reason, the file is deleted (ticket section
 * 1.3: "if the DB insertion fails, the written file is deleted").
 *
 * A unique-constraint failure on image_name specifically is not an error: it
 * is this function's own idempotence working as designed (ticket section
 * 1.4) - reported as alreadyImported: true, not surfaced to the author as a
 * sync failure.
 */
export async function importInvokeImageIntoDestination(
  args: ImportInvokeImageArgs
): Promise<ImportInvokeImageResult> {
  const { subfolder, destinationTable } = destinationFolder(args.ownerType, args.ownerId);
  const publicRoot = path.join(process.cwd(), "public");
  const destDir = path.join(publicRoot, subfolder);
  const ext = extensionFromInvokeImageName(args.imageName);
  const destFilename = `${randomUUID()}${ext}`;
  const destRelative = `${subfolder}/${destFilename}`;
  const destAbsolute = path.join(destDir, destFilename);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(destAbsolute, args.bytes);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not write the downloaded image to disk." };
  }

  try {
    const destinationId = db.transaction((tx) => {
      let insertedId: number;

      if (args.ownerType === "asset") {
        const [{ maxOrder }] = tx
          .select({ maxOrder: sql<number>`coalesce(max(${assetReferenceImages.orderIndex}), -1)` })
          .from(assetReferenceImages)
          .where(eq(assetReferenceImages.assetId, args.ownerId))
          .all() as { maxOrder: number }[];
        const [row] = tx
          .insert(assetReferenceImages)
          .values({
            assetId: args.ownerId,
            orderIndex: maxOrder + 1,
            imagePath: destRelative,
            sourceFilename: null,
            label: "From Invoke",
            imageRole: null,
          })
          .returning({ id: assetReferenceImages.id })
          .all();
        insertedId = row.id;
      } else if (args.ownerType === "shot") {
        const [{ maxOrder }] = tx
          .select({ maxOrder: sql<number>`coalesce(max(${shotReferenceImages.orderIndex}), -1)` })
          .from(shotReferenceImages)
          .where(eq(shotReferenceImages.shotId, args.ownerId))
          .all() as { maxOrder: number }[];
        const [row] = tx
          .insert(shotReferenceImages)
          .values({
            shotId: args.ownerId,
            orderIndex: maxOrder + 1,
            imagePath: destRelative,
            sourceFilename: null,
            label: "From Invoke",
            imageRole: null,
          })
          .returning({ id: shotReferenceImages.id })
          .all();
        insertedId = row.id;
      } else if (args.ownerType === "shot_storyboard") {
        const [row] = tx
          .insert(storyboardImages)
          .values({
            shotId: args.ownerId,
            jobId: null,
            workflowId: null,
            imagePath: destRelative,
            status: "draft",
            promptSnapshot: null,
            referencesSnapshot: null,
          })
          .returning({ id: storyboardImages.id })
          .all();
        insertedId = row.id;
      } else {
        const [row] = tx
          .insert(sequenceStoryboardImages)
          .values({
            sequenceId: args.ownerId,
            jobId: null,
            workflowId: null,
            imagePath: destRelative,
            status: "draft",
            promptSnapshot: null,
            referencesSnapshot: null,
          })
          .returning({ id: sequenceStoryboardImages.id })
          .all();
        insertedId = row.id;
      }

      tx.insert(invokeImportedImages)
        .values({
          invokeBoardId: args.invokeBoardId,
          imageName: args.imageName,
          destinationTable,
          destinationId: insertedId,
        })
        .run();

      return insertedId;
    });

    return { ok: true, alreadyImported: false, destinationTable, destinationId, imagePath: destRelative };
  } catch (err) {
    try {
      await fs.unlink(destAbsolute);
    } catch {
      /* best-effort cleanup only - the error below is still reported */
    }

    if (isUniqueImageNameViolation(err)) {
      return { ok: true, alreadyImported: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to import the downloaded image." };
  }
}

// ---------------------------------------------------------------------------
// syncInvokeBoard - the count-only short-circuit (ticket section 1.2) plus
// the import pass it guards.
// ---------------------------------------------------------------------------

export interface SyncedInvokeBoard {
  invokeBoardId: number;
  ownerType: InvokeSyncOwnerType;
  ownerId: number;
  boardName: string;
}

export type SyncInvokeBoardResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; imported: number }
  | { ok: false; error: string; boardBroken: boolean };

/**
 * Syncs exactly one board: a bare count poll first (ticket section 1.2 - no
 * list, no download, no write, when the total hasn't moved), then - only if
 * it has - a list, the pure decision (selectInvokeImagesToImport), and one
 * importInvokeImageIntoDestination per surviving candidate. The new count is
 * written to invoke_boards.lastKnownImageCount only AFTER every import this
 * pass attempted has settled (ticket section 1.2: "the new total is
 * memorized after the import, never before" - so a failure mid-pass leaves
 * the board re-detectable next time instead of silently skipped).
 */
export async function syncInvokeBoard(board: SyncedInvokeBoard): Promise<SyncInvokeBoardResult> {
  const [current] = await db.select().from(invokeBoards).where(eq(invokeBoards.id, board.invokeBoardId));
  if (!current) return { ok: false, error: `Invoke board for this entity is gone from MikAI's own records.`, boardBroken: false };

  let total: number;
  try {
    total = await getInvokeBoardImageCount(current.boardId);
  } catch (err) {
    const broken = err instanceof Error && /was not found/.test(err.message);
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Could not reach InvokeAI for board "${board.boardName}".`,
      boardBroken: broken,
    };
  }

  if (total === current.lastKnownImageCount) {
    return { ok: true, changed: false };
  }

  let items: { imageName: string }[];
  try {
    items = await listInvokeBoardImages(current.boardId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : `Could not list images for board "${board.boardName}".`, boardBroken: false };
  }

  const imageNames = items.map((i) => i.imageName);

  let pushedRows: { imageName: string }[];
  let importedRows: { imageName: string }[];
  try {
    pushedRows = imageNames.length
      ? await db
          .select({ imageName: invokePushedImages.imageName })
          .from(invokePushedImages)
          .where(and(eq(invokePushedImages.invokeBoardId, current.id), inArray(invokePushedImages.imageName, imageNames)))
      : [];
    importedRows = imageNames.length
      ? await db
          .select({ imageName: invokeImportedImages.imageName })
          .from(invokeImportedImages)
          .where(and(eq(invokeImportedImages.invokeBoardId, current.id), inArray(invokeImportedImages.imageName, imageNames)))
      : [];
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Could not read this board's own sync history for "${board.boardName}".`,
      boardBroken: false,
    };
  }

  const candidates = selectInvokeImagesToImport({
    images: items,
    pushedImageNames: new Set(pushedRows.map((r) => r.imageName)),
    alreadyImportedImageNames: new Set(importedRows.map((r) => r.imageName)),
  });

  let imported = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    let bytes: Buffer;
    try {
      bytes = await downloadInvokeImageBytes(candidate.imageName);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Could not download "${candidate.imageName}".`);
      continue;
    }

    const result = await importInvokeImageIntoDestination({
      invokeBoardId: current.id,
      ownerType: board.ownerType,
      ownerId: board.ownerId,
      imageName: candidate.imageName,
      bytes,
    });

    if (!result.ok) {
      errors.push(result.error);
    } else if (!result.alreadyImported) {
      imported += 1;
    }
  }

  if (errors.length > 0) {
    // Deliberately NOT memorized: ticket section 1.2 - "a failure along the
    // way must leave the board re-detectable next pass". Any
    // successfully-imported candidate above is already excluded from a
    // retry by the decision function itself (it is now in
    // invoke_imported_images), so re-running this same pass later only ever
    // retries what actually failed.
    return { ok: false, error: errors.join(" "), boardBroken: false };
  }

  // Memorized only now - every candidate this pass found was imported (or
  // was already imported) without error (ticket section 1.2).
  await db
    .update(invokeBoards)
    .set({ lastKnownImageCount: total, updatedAt: new Date().toISOString() })
    .where(eq(invokeBoards.id, current.id));

  return { ok: true, changed: true, imported };
}
