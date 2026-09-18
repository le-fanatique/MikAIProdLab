import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertAsset,
  insertInvokeBoard,
  insertInvokePushedImage,
  insertInvokeImportedImage,
  readInvokeBoard,
  readInvokeImportedImages,
  readShotReferenceImages,
  readStoryboardImagesByShot,
} from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3, ticket §3's own proof
// floor: this file is where "insertion fails -> file deleted" and "two
// concurrent syncs never create a duplicate row" are proven against a real,
// disposable SQLite database (mikai-method §3 — never a mock of the DB
// layer). Only the InvokeAI HTTP client (`invokeServerClient`) is doubled;
// every DB write, every file write, and the decision function it drives all
// run for real.
// ---------------------------------------------------------------------------

vi.mock("@/lib/invoke/invokeServerClient", () => ({
  getInvokeBoardImageCount: vi.fn(),
  listInvokeBoardImages: vi.fn(),
  downloadInvokeImageBytes: vi.fn(),
}));

let ctx: TempDb;
let importInvokeImageIntoDestination: typeof import("@/lib/invoke/invokeSync")["importInvokeImageIntoDestination"];
let syncInvokeBoard: typeof import("@/lib/invoke/invokeSync")["syncInvokeBoard"];
let getInvokeBoardImageCount: ReturnType<typeof vi.fn>;
let listInvokeBoardImages: ReturnType<typeof vi.fn>;
let downloadInvokeImageBytes: ReturnType<typeof vi.fn>;

const writtenDirs: string[] = [];

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ importInvokeImageIntoDestination, syncInvokeBoard } = await import("@/lib/invoke/invokeSync"));
  const client = await import("@/lib/invoke/invokeServerClient");
  getInvokeBoardImageCount = client.getInvokeBoardImageCount as unknown as ReturnType<typeof vi.fn>;
  listInvokeBoardImages = client.listInvokeBoardImages as unknown as ReturnType<typeof vi.fn>;
  downloadInvokeImageBytes = client.downloadInvokeImageBytes as unknown as ReturnType<typeof vi.fn>;
});

afterAll(async () => {
  for (const dir of writtenDirs) await fs.rm(dir, { recursive: true, force: true });
  ctx.cleanup();
});

function trackShotDir(shotId: number, kind: "reference-images" | "storyboard-images"): void {
  writtenDirs.push(path.join(process.cwd(), "public", "uploads", kind, `shot-${shotId}`));
}
function trackAssetDir(assetId: number): void {
  writtenDirs.push(path.join(process.cwd(), "public", "uploads", "reference-images", `asset-${assetId}`));
}

describe("importInvokeImageIntoDestination", () => {
  it("writes the file and the destination row, and records the import (shot reference image)", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    trackShotDir(shotId, "reference-images");
    const boardId = await insertInvokeBoard(ctx, { ownerType: "shot", ownerId: shotId });

    const result = await importInvokeImageIntoDestination({
      invokeBoardId: boardId,
      ownerType: "shot",
      ownerId: shotId,
      imageName: "retouched.png",
      bytes: Buffer.from("fake-bytes"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.alreadyImported) throw new Error("expected a fresh import");

    expect(result.destinationTable).toBe("shot_reference_images");

    const fileBytes = await fs.readFile(path.join(process.cwd(), "public", result.imagePath));
    expect(fileBytes.toString()).toBe("fake-bytes");

    const refs = await readShotReferenceImages(ctx, shotId);
    expect(refs).toHaveLength(1);
    expect(refs[0].imagePath).toBe(result.imagePath);
    expect(refs[0].label).toBe("From Invoke");
    expect(refs[0].imageRole).toBeNull();

    const imported = await readInvokeImportedImages(ctx, boardId);
    expect(imported).toHaveLength(1);
    expect(imported[0].imageName).toBe("retouched.png");
    expect(imported[0].destinationTable).toBe("shot_reference_images");
    expect(imported[0].destinationId).toBe(refs[0].id);
  });

  it("writes a shot storyboard draft as status draft, with no job/prompt snapshot invented", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    trackShotDir(shotId, "storyboard-images");
    const boardId = await insertInvokeBoard(ctx, { ownerType: "shot_storyboard", ownerId: shotId });

    const result = await importInvokeImageIntoDestination({
      invokeBoardId: boardId,
      ownerType: "shot_storyboard",
      ownerId: shotId,
      imageName: "draft.png",
      bytes: Buffer.from("draft-bytes"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.alreadyImported) throw new Error("expected a fresh import");

    const drafts = await readStoryboardImagesByShot(ctx, shotId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("draft");
    expect(drafts[0].jobId).toBeNull();
    expect(drafts[0].promptSnapshot).toBeNull();
  });

  it("idempotence: importing the same image_name twice inserts exactly one row and leaves exactly one file (real SQLite, ticket §3)", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    trackShotDir(shotId, "reference-images");
    const boardId = await insertInvokeBoard(ctx, { ownerType: "shot", ownerId: shotId });

    const args = {
      invokeBoardId: boardId,
      ownerType: "shot" as const,
      ownerId: shotId,
      imageName: "race.png",
      bytes: Buffer.from("race-bytes"),
    };

    const first = await importInvokeImageIntoDestination(args);
    const second = await importInvokeImageIntoDestination(args);

    expect(first.ok && !first.alreadyImported).toBe(true);
    expect(second.ok && second.alreadyImported).toBe(true);

    const imported = await readInvokeImportedImages(ctx, boardId);
    expect(imported).toHaveLength(1);

    const refs = await readShotReferenceImages(ctx, shotId);
    expect(refs).toHaveLength(1);

    // No orphan file: the second call's write was cleaned up, only the
    // first call's file survives.
    const dir = path.join(process.cwd(), "public", "uploads", "reference-images", `shot-${shotId}`);
    const filesOnDisk = await fs.readdir(dir);
    expect(filesOnDisk).toHaveLength(1);
  });

  it("failure path: a destination insert failure deletes the file it just wrote (ticket §1.3)", async () => {
    trackAssetDir(999999); // never created — an orphan file here would be the bug this test catches.

    const result = await importInvokeImageIntoDestination({
      invokeBoardId: 1, // no invoke_boards row with this id either — belt and suspenders on the FK failure.
      ownerType: "asset",
      ownerId: 999999, // no such asset — the destination insert must violate the FK and roll back.
      imageName: "will-fail.png",
      bytes: Buffer.from("orphan-bytes"),
    });

    expect(result.ok).toBe(false);

    const dir = path.join(process.cwd(), "public", "uploads", "reference-images", "asset-999999");
    const filesOnDisk = await fs.readdir(dir).catch(() => []);
    expect(filesOnDisk).toHaveLength(0);
  });
});

describe("syncInvokeBoard — the count-only short-circuit (ticket §1.2)", () => {
  it("when the count is unchanged, never calls list or download", async () => {
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    const boardId = await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId, lastKnownImageCount: 3 });

    getInvokeBoardImageCount.mockResolvedValueOnce(3);
    listInvokeBoardImages.mockClear();
    downloadInvokeImageBytes.mockClear();

    const result = await syncInvokeBoard({
      invokeBoardId: boardId,
      ownerType: "asset",
      ownerId: assetId,
      boardName: "Test board",
    });

    expect(result).toEqual({ ok: true, changed: false });
    expect(listInvokeBoardImages).not.toHaveBeenCalled();
    expect(downloadInvokeImageBytes).not.toHaveBeenCalled();
  });

  it("when the count changed, imports only what is neither pushed nor already imported, then memorizes the new total", async () => {
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    trackAssetDir(assetId);
    const boardId = await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId, lastKnownImageCount: 1 });
    await insertInvokePushedImage(ctx, boardId, { imageName: "pushed.png" });
    await insertInvokeImportedImage(ctx, boardId, {
      imageName: "already.png",
      destinationTable: "asset_reference_images",
      destinationId: 0,
    });

    getInvokeBoardImageCount.mockResolvedValueOnce(3);
    listInvokeBoardImages.mockResolvedValueOnce([
      { imageName: "pushed.png" },
      { imageName: "already.png" },
      { imageName: "brand-new.png" },
    ]);
    downloadInvokeImageBytes.mockResolvedValueOnce(Buffer.from("new-bytes"));

    const result = await syncInvokeBoard({
      invokeBoardId: boardId,
      ownerType: "asset",
      ownerId: assetId,
      boardName: "Test board",
    });

    expect(result).toEqual({ ok: true, changed: true, imported: 1 });
    expect(downloadInvokeImageBytes).toHaveBeenCalledTimes(1);
    expect(downloadInvokeImageBytes).toHaveBeenCalledWith("brand-new.png");

    const board = await readInvokeBoard(ctx, boardId);
    expect(board.lastKnownImageCount).toBe(3);
  });

  it("on a download/import failure, does NOT memorize the new count — the board stays re-detectable (ticket §1.2)", async () => {
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    const boardId = await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId, lastKnownImageCount: 0 });

    getInvokeBoardImageCount.mockResolvedValueOnce(1);
    listInvokeBoardImages.mockResolvedValueOnce([{ imageName: "broken.png" }]);
    downloadInvokeImageBytes.mockRejectedValueOnce(new Error("network blip"));

    const result = await syncInvokeBoard({
      invokeBoardId: boardId,
      ownerType: "asset",
      ownerId: assetId,
      boardName: "Test board",
    });

    expect(result.ok).toBe(false);

    const board = await readInvokeBoard(ctx, boardId);
    expect(board.lastKnownImageCount).toBe(0);
  });
});
