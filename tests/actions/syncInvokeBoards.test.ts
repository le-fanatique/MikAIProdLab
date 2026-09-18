import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset, insertInvokeBoard } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// INVOKE.SYNC.1 — the server action's own job: aggregate every board's sync
// outcome into ONE redirect (or none), never surfacing internal per-board
// mechanics a caller does not need. `syncInvokeBoard` itself (the count poll,
// the decision, the transactional write) is proven separately against a real
// SQLite database in tests/lib/invokeSync.test.ts — mocked here so this file
// stays about the action's own routing/message logic.
// ---------------------------------------------------------------------------

vi.mock("@/lib/invoke/invokeSync", () => ({
  syncInvokeBoard: vi.fn(),
}));

let ctx: TempDb;
let syncInvokeBoards: typeof import("@/actions/invoke")["syncInvokeBoards"];
let syncInvokeBoard: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ syncInvokeBoards } = await import("@/actions/invoke"));
  const syncModule = await import("@/lib/invoke/invokeSync");
  syncInvokeBoard = syncModule.syncInvokeBoard as unknown as ReturnType<typeof vi.fn>;
});

afterAll(() => {
  ctx.cleanup();
});

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Runs the action and reports whether it redirected (and where), or returned normally. */
async function run(fd: FormData): Promise<{ redirected: false } | { redirected: true; url: string }> {
  try {
    await syncInvokeBoards(fd);
    return { redirected: false };
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { redirected: true, url: digest.split(";")[2] };
    }
    throw err;
  }
}

describe("syncInvokeBoards — no boards linked", () => {
  it("returns normally, no redirect, when there is no board to sync", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const outcome = await run(formData({ returnTo: "/somewhere" }));
    expect(outcome.redirected).toBe(false);
  });
});

describe("syncInvokeBoards — nothing changed (ticket §1.5: no visual noise)", () => {
  it("returns normally, no redirect, when every board reports unchanged", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId });

    syncInvokeBoard.mockResolvedValueOnce({ ok: true, changed: false });

    const outcome = await run(formData({ returnTo: "/somewhere" }));
    expect(outcome.redirected).toBe(false);
  });
});

describe("syncInvokeBoards — a board sync fails", () => {
  it("redirects with invokeSyncError naming the board", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId, boardName: "MikAI · Asset 1 · Guard" });

    syncInvokeBoard.mockResolvedValueOnce({ ok: false, error: "InvokeAI is unreachable.", boardBroken: false });

    const outcome = await run(formData({ returnTo: "/somewhere" }));
    expect(outcome.redirected).toBe(true);
    if (!outcome.redirected) throw new Error("expected a redirect");
    expect(outcome.url).toContain("/somewhere?invokeSyncError=");
    expect(decodeURIComponent(outcome.url)).toContain("MikAI · Asset 1 · Guard");
    expect(decodeURIComponent(outcome.url)).toContain("InvokeAI is unreachable.");
  });
});

describe("syncInvokeBoards — an import happened", () => {
  it("redirects with a message naming the entity and a link to it, for an asset board", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId, { name: "Old Warrior" });
    await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId });

    syncInvokeBoard.mockResolvedValueOnce({ ok: true, changed: true, imported: 1 });

    const outcome = await run(formData({ returnTo: "/somewhere" }));
    expect(outcome.redirected).toBe(true);
    if (!outcome.redirected) throw new Error("expected a redirect");
    const decoded = decodeURIComponent(outcome.url);
    expect(decoded).toContain("Imported 1 image from Invoke into Asset Old Warrior");
    expect(decoded).toContain(`invokeSyncHref=/projects/${projectId}/assets/${assetId}`);
  });

  it("redirects with a message naming the Shot, for a shot board", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, { shotCode: "Sh_0120", title: "Reveal" });
    await insertInvokeBoard(ctx, { ownerType: "shot", ownerId: shotId });

    syncInvokeBoard.mockResolvedValueOnce({ ok: true, changed: true, imported: 2 });

    const outcome = await run(formData({ returnTo: "/somewhere" }));
    expect(outcome.redirected).toBe(true);
    if (!outcome.redirected) throw new Error("expected a redirect");
    const decoded = decodeURIComponent(outcome.url);
    expect(decoded).toContain("Imported 2 images from Invoke into Shot Sh_0120");
  });

  it("pluralises singular vs plural counts correctly", async () => {
    await ctx.db.delete(ctx.schema.invokeBoards);
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId, { name: "Guard" });
    await insertInvokeBoard(ctx, { ownerType: "asset", ownerId: assetId });

    syncInvokeBoard.mockResolvedValueOnce({ ok: true, changed: true, imported: 1 });

    const outcome = await run(formData({ returnTo: "/somewhere" }));
    if (!outcome.redirected) throw new Error("expected a redirect");
    expect(decodeURIComponent(outcome.url)).toContain("Imported 1 image from Invoke");
    expect(decodeURIComponent(outcome.url)).not.toContain("1 images");
  });
});
