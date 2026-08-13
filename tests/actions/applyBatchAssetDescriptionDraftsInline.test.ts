import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

let ctx: TempDb;
let applyBatchAssetDescriptionDraftsInline: typeof import("@/actions/assets").applyBatchAssetDescriptionDraftsInline;
let projectId: number;
let otherProjectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ applyBatchAssetDescriptionDraftsInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("applyBatchAssetDescriptionDraftsInline — exact write", () => {
  it("replaces description and notes and touches no other column", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "Old description",
      notes: "Old notes",
      visualIdentity: "Untouched identity",
    });
    const before = await readAsset(ctx, assetId);

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [{ assetId, descriptionDraft: "New description", notesDraft: "New notes" }],
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({
      ok: true,
      applied: [{ assetId, descriptionApplied: true, notesApplied: true }],
      errors: [],
    });
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "description",
      "notes",
    ]);
    expect(after.description).toBe("New description");
    expect(after.notes).toBe("New notes");
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("leaves a field untouched when its draft is blank", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "Old description",
      notes: "Kept notes",
    });
    const before = await readAsset(ctx, assetId);

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [{ assetId, descriptionDraft: "New description", notesDraft: "   " }],
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toMatchObject({
      applied: [{ assetId, descriptionApplied: true, notesApplied: false }],
    });
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "description",
    ]);
    expect(after.notes).toBe("Kept notes");
  });

  it("appends to both fields with a blank line", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "First.",
      notes: "Note one.",
    });

    await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "append",
      items: [{ assetId, descriptionDraft: "Second.", notesDraft: "Note two." }],
    });

    const after = await readAsset(ctx, assetId);
    expect(after.description).toBe("First.\n\nSecond.");
    expect(after.notes).toBe("Note one.\n\nNote two.");
  });

  it("applies every item of a multi-item batch", async () => {
    const first = await insertAsset(ctx, projectId, { description: "A" });
    const second = await insertAsset(ctx, projectId, { description: "B" });

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [
        { assetId: first, descriptionDraft: "A2", notesDraft: "" },
        { assetId: second, descriptionDraft: "B2", notesDraft: "" },
      ],
    });

    expect(result).toMatchObject({ ok: true, errors: [] });
    expect((await readAsset(ctx, first)).description).toBe("A2");
    expect((await readAsset(ctx, second)).description).toBe("B2");
  });
});

describe("applyBatchAssetDescriptionDraftsInline — foreign chain refusal", () => {
  it("refuses an asset owned by another project and writes nothing for it", async () => {
    const foreign = await insertAsset(ctx, otherProjectId, { description: "Protected" });
    const before = await readAsset(ctx, foreign);

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [{ assetId: foreign, descriptionDraft: "Injected", notesDraft: "" }],
    });

    expect(result).toEqual({
      ok: true,
      applied: [],
      errors: [{ assetId: foreign, error: "Asset not found." }],
    });
    expect(await readAsset(ctx, foreign)).toEqual(before);
  });
});

describe("applyBatchAssetDescriptionDraftsInline — batch atomicity", () => {
  it("is NOT all-or-nothing: valid items are committed even when a sibling item is refused", async () => {
    // Observed behaviour, recorded on purpose. The action loops item by item
    // with an independent UPDATE per item and no enclosing transaction, so a
    // partially applied batch is the real contract, not an edge case.
    const valid = await insertAsset(ctx, projectId, { description: "Old" });
    const foreign = await insertAsset(ctx, otherProjectId, { description: "Protected" });
    const foreignBefore = await readAsset(ctx, foreign);

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [
        { assetId: valid, descriptionDraft: "Applied", notesDraft: "" },
        { assetId: foreign, descriptionDraft: "Injected", notesDraft: "" },
        { assetId: 999999, descriptionDraft: "Injected", notesDraft: "" },
        { assetId: valid, descriptionDraft: "", notesDraft: "" },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      applied: [{ assetId: valid, descriptionApplied: true, notesApplied: false }],
      errors: [
        { assetId: foreign, error: "Asset not found." },
        { assetId: 999999, error: "Asset not found." },
        { assetId: valid, error: "Both drafts are empty." },
      ],
    });
    expect((await readAsset(ctx, valid)).description).toBe("Applied");
    expect(await readAsset(ctx, foreign)).toEqual(foreignBefore);
  });
});

describe("applyBatchAssetDescriptionDraftsInline — input validation", () => {
  it("rejects an invalid mode", async () => {
    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "prepend" as "replace",
      items: [{ assetId: 1, descriptionDraft: "x", notesDraft: "" }],
    });

    expect(result).toEqual({ ok: false, error: "Invalid mode." });
  });

  it("rejects an empty batch", async () => {
    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: [],
    });

    expect(result).toEqual({ ok: false, error: "No items to apply." });
  });

  it("rejects a batch over the limit of 10 without writing", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Kept" });
    const before = await readAsset(ctx, assetId);

    const result = await applyBatchAssetDescriptionDraftsInline({
      projectId,
      mode: "replace",
      items: Array.from({ length: 11 }, () => ({
        assetId,
        descriptionDraft: "Injected",
        notesDraft: "",
      })),
    });

    expect(result).toEqual({ ok: false, error: "Too many items. Limit is 10." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });
});
