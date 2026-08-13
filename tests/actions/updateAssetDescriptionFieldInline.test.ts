import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

let ctx: TempDb;
let updateAssetDescriptionFieldInline: typeof import("@/actions/assets").updateAssetDescriptionFieldInline;
let projectId: number;
let otherProjectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAssetDescriptionFieldInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateAssetDescriptionFieldInline — exact write", () => {
  it("replaces description and touches no other column", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "Old description",
      notes: "Untouched notes",
      visualIdentity: "Untouched identity",
    });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: "  New description  ",
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({ ok: true });
    expect(after.description).toBe("New description");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "description",
    ]);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own: written, ISO-shaped, and
    // never moving backwards.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("appends to the existing value with a blank line", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "First." });

    await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "append",
      content: "Second.",
    });

    expect((await readAsset(ctx, assetId)).description).toBe("First.\n\nSecond.");
  });

  it("appends without a leading blank line when the field is empty", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: null });

    await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "append",
      content: "Only.",
    });

    expect((await readAsset(ctx, assetId)).description).toBe("Only.");
  });

  it("writes notes when the notes field is targeted", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "Untouched description",
      notes: "Old notes",
    });
    const before = await readAsset(ctx, assetId);

    await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "notes",
      mode: "replace",
      content: "New notes",
    });

    const after = await readAsset(ctx, assetId);
    expect(after.notes).toBe("New notes");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["notes"]);
  });
});

describe("updateAssetDescriptionFieldInline — foreign chain refusal", () => {
  it("refuses an asset owned by another project and writes nothing", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Protected" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDescriptionFieldInline({
      assetId,
      projectId: otherProjectId,
      field: "description",
      mode: "replace",
      content: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("refuses an asset that does not exist", async () => {
    const result = await updateAssetDescriptionFieldInline({
      assetId: 999999,
      projectId,
      field: "description",
      mode: "replace",
      content: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
  });
});

describe("updateAssetDescriptionFieldInline — refusal before any write", () => {
  it("rejects empty content without writing", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Kept" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: "   ",
    });

    expect(result).toEqual({ ok: false, error: "Empty content." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("rejects an invalid field without writing", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Kept" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "name" as "description",
      mode: "replace",
      content: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Invalid field." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("rejects an invalid mode without writing", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Kept" });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "prepend" as "replace",
      content: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Invalid mode." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });
});
