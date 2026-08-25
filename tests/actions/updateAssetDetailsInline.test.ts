import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedColumns, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";

let ctx: TempDb;
let updateAssetDetailsInline: typeof import("@/actions/assets").updateAssetDetailsInline;
let projectId: number;
let otherProjectId: number;

const FILLED = {
  description: "A description",
  notes: "Some notes",
  visualIdentity: "Visual identity",
  usageRules: "Usage rules",
  forbiddenVariations: "Forbidden variations",
  // ASSET.LIGHTING.PLACE.1 — the sixth field this full-replacement action
  // now writes.
  lighting: "Old lighting",
};

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAssetDetailsInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
  otherProjectId = await insertProject(ctx, "Foreign project");
});

afterAll(() => ctx.cleanup());

describe("updateAssetDetailsInline — exact write", () => {
  it("writes the six text fields and touches no other column", async () => {
    const assetId = await insertAsset(ctx, projectId, {
      description: "Old",
      notes: "Old",
      visualIdentity: "Old",
      usageRules: "Old",
      forbiddenVariations: "Old",
      lighting: "Old",
    });
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDetailsInline({ assetId, projectId, ...FILLED });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({ ok: true });
    // SCHEMA.BIBLE_FRESHNESS.1 (S1b) — `bibleSourceFingerprint` is now
    // written on every call alongside the six text fields, from `null`
    // (this fixture's insert never sets it) to the computed fingerprint.
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual([
      "bibleSourceFingerprint",
      "description",
      "forbiddenVariations",
      "lighting",
      "notes",
      "usageRules",
      "visualIdentity",
    ]);
    expect({
      description: after.description,
      notes: after.notes,
      visualIdentity: after.visualIdentity,
      usageRules: after.usageRules,
      forbiddenVariations: after.forbiddenVariations,
      lighting: after.lighting,
    }).toEqual(FILLED);
    // name / type / orderIndex / projectId are outside the action's scope.
    expect(after.name).toBe(before.name);
    expect(after.type).toBe(before.type);
    expect(after.orderIndex).toBe(before.orderIndex);
    expect(after.projectId).toBe(projectId);
    // updatedAt is excluded from the column diff (its value is not
    // deterministic), so it is asserted on its own.
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it("trims each field and stores null when a field is blank", async () => {
    const assetId = await insertAsset(ctx, projectId, FILLED);

    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "  kept  ",
      notes: "   ",
      visualIdentity: "",
      usageRules: "\n\t",
      forbiddenVariations: "",
      lighting: "   ",
    });

    const after = await readAsset(ctx, assetId);
    expect(after.description).toBe("kept");
    expect(after.notes).toBeNull();
    expect(after.visualIdentity).toBeNull();
    expect(after.usageRules).toBeNull();
    expect(after.forbiddenVariations).toBeNull();
    expect(after.lighting).toBeNull();
  });

  it("overwrites every field on each call — the payload is a full replacement", async () => {
    // Documented blast radius: a caller that only means to change one field
    // must resend the other five, otherwise they are nulled.
    const assetId = await insertAsset(ctx, projectId, FILLED);

    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "",
      notes: "",
      visualIdentity: "Only this one",
      usageRules: "",
      forbiddenVariations: "",
      lighting: "",
    });

    const after = await readAsset(ctx, assetId);
    expect(after.visualIdentity).toBe("Only this one");
    expect(after.description).toBeNull();
    expect(after.notes).toBeNull();
    expect(after.usageRules).toBeNull();
    expect(after.forbiddenVariations).toBeNull();
    expect(after.lighting).toBeNull();
  });

  // ASSET.LIGHTING.PLACE.1 §6 — the ticket's own required test: `lighting`
  // is written, and no other column changes. Since `updateAssetDetailsInline`
  // is a full-replacement action (behaviour 3), "touches no other column"
  // means: every other field is resent unchanged, so `changedColumns` (a
  // value diff, not a SQL-touch diff) reports only `lighting` — the same
  // reading `updateAssetLightingInline`'s own "exact write" test gives the
  // phrase, on the one-column action it targets.
  it("writes lighting and touches no other column when the rest of the payload repeats the stored values", async () => {
    const assetId = await insertAsset(ctx, projectId, FILLED);
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDetailsInline({
      ...FILLED,
      assetId,
      projectId,
      lighting: "Soft key from the left, cool ambient fill",
    });

    const after = await readAsset(ctx, assetId);
    expect(result).toEqual({ ok: true });
    expect(after.lighting).toBe("Soft key from the left, cool ambient fill");
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
  });
});

describe("updateAssetDetailsInline — foreign chain refusal", () => {
  it("refuses an asset owned by another project and writes nothing", async () => {
    const assetId = await insertAsset(ctx, projectId, FILLED);
    const before = await readAsset(ctx, assetId);

    const result = await updateAssetDetailsInline({
      assetId,
      projectId: otherProjectId,
      description: "Injected",
      notes: "Injected",
      visualIdentity: "Injected",
      usageRules: "Injected",
      forbiddenVariations: "Injected",
      lighting: "Injected",
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
    expect(await readAsset(ctx, assetId)).toEqual(before);
  });

  it("refuses an asset that does not exist", async () => {
    const result = await updateAssetDetailsInline({
      assetId: 999999,
      projectId,
      ...FILLED,
    });

    expect(result).toEqual({ ok: false, error: "Asset not found." });
  });
});
