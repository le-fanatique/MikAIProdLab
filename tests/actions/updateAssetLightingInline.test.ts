import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// updateAssetLightingInline — LLMW.LIGHTING.1 (B15a). Same shape as
// tests/actions/updateAssetDescriptionFieldInline.test.ts (caller-supplied
// object, ownership check, `{ ok: true } | { ok: false; error }`), narrowed
// to one field with no append/replace mode: `lighting` is always a full
// replacement, and a blank value clears it to null (the same rule
// updateShotLighting/updateSequenceLighting follow). The assertion that
// counts: writing `lighting` touches no other column, including
// `description`/`notes`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateAssetLightingInline: typeof import("@/actions/assets").updateAssetLightingInline;
let projectId: number;
let otherProjectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAssetLightingInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateAssetLightingInline — exact write", () => {
  it("replaces lighting and touches no other column", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      type: "environment",
      lighting: "Old lighting",
      description: "Untouched description",
      notes: "Untouched notes",
    });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetLightingInline({
      assetId,
      projectId,
      lighting: "Soft key from the left, cool ambient fill",
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({ ok: true });
    expect(after.lighting).toBe("Soft key from the left, cool ambient fill");
    expect(after.description).toBe("Untouched description");
    expect(after.notes).toBe("Untouched notes");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("stores null for a blank lighting value rather than an empty string", async () => {
    const assetId = await insertAsset(ctx, projectId, { lighting: "Old lighting" });

    const result = await updateAssetLightingInline({
      assetId,
      projectId,
      lighting: "   ",
    });

    expect(result).toEqual({ ok: true });
    expect((await readAsset(ctx, assetId)).lighting).toBeNull();
  });
});

describe("updateAssetLightingInline — foreign chain refusal", () => {
  it("refuses an asset owned by another project and writes nothing", async () => {
    const assetId = await insertAsset(ctx, projectId, { lighting: "Protected" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetLightingInline({
      assetId,
      projectId: otherProjectId,
      lighting: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("refuses an asset that does not exist", async () => {
    const result = await updateAssetLightingInline({
      assetId: 999999,
      projectId,
      lighting: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
  });
});
