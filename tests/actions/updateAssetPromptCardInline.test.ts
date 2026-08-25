import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateAssetPromptCardInline — ASSET.PROMPTCARD.2. Same shape as
// tests/actions/updateAssetLightingInline.test.ts (caller-supplied object,
// ownership check, `{ ok: true } | { ok: false; error }`), narrowed to one
// field with no append/replace mode: `promptCard` is always a full
// replacement, and a blank value clears it to null. The assertion that
// counts: writing `promptCard` touches no other column, including
// `description`/`notes`/`lighting`/the Asset Bible fields.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateAssetPromptCardInline: typeof import("@/actions/assets").updateAssetPromptCardInline;
let projectId: number;
let otherProjectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAssetPromptCardInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateAssetPromptCardInline — exact write", () => {
  it("replaces promptCard and touches no other column", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      type: "character",
      promptCard: "Old card",
      description: "Untouched description",
      notes: "Untouched notes",
      lighting: "Untouched lighting",
      visualIdentity: "Untouched visual identity",
      usageRules: "Untouched usage rules",
      forbiddenVariations: "Untouched forbidden variations",
    });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetPromptCardInline({
      assetId,
      projectId,
      promptCard: "Scuffed utilitarian coat, weathered fur, calloused hands",
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({ ok: true });
    expect(after.promptCard).toBe("Scuffed utilitarian coat, weathered fur, calloused hands");
    expect(after.description).toBe("Untouched description");
    expect(after.notes).toBe("Untouched notes");
    expect(after.lighting).toBe("Untouched lighting");
    expect(after.visualIdentity).toBe("Untouched visual identity");
    expect(after.usageRules).toBe("Untouched usage rules");
    expect(after.forbiddenVariations).toBe("Untouched forbidden variations");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["promptCard"]);
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank promptCard value rather than an empty string", async () => {
    const assetId = await insertAsset(ctx, projectId, { promptCard: "Old card" });

    const result = await updateAssetPromptCardInline({
      assetId,
      projectId,
      promptCard: "   ",
    });

    expect(result).toEqual({ ok: true });
    expect((await readAsset(ctx, assetId)).promptCard).toBeNull();
  });
});

describe("updateAssetPromptCardInline — foreign chain refusal", () => {
  it("refuses an asset owned by another project and writes nothing", async () => {
    const assetId = await insertAsset(ctx, projectId, { promptCard: "Protected" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetPromptCardInline({
      assetId,
      projectId: otherProjectId,
      promptCard: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("refuses an asset that does not exist", async () => {
    const result = await updateAssetPromptCardInline({
      assetId: 999999,
      projectId,
      promptCard: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
  });
});
