import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "./helpers/fixtures";
import { readAssetBibleFreshness } from "@/lib/assetBible/freshness";

// ---------------------------------------------------------------------------
// assetBibleFreshness.test.ts — SCHEMA.BIBLE_FRESHNESS.1 (S1b)
//
// The capture side of the contract: `updateAssetDetailsInline` is the one
// place the Asset Bible is written, so it is the one place
// `bibleSourceFingerprint` is captured. Proves the round trip end to end,
// against a disposable DB, rather than only at the pure-function level.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let updateAssetDetailsInline: typeof import("@/actions/assets").updateAssetDetailsInline;
let updateAssetDescriptionFieldInline: typeof import("@/actions/assets").updateAssetDescriptionFieldInline;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ updateAssetDetailsInline, updateAssetDescriptionFieldInline } = await import("@/actions/assets"));
  projectId = await insertProject(ctx, "Owner project");
});

afterAll(() => ctx.cleanup());

describe("Asset Bible freshness capture — updateAssetDetailsInline", () => {
  it("stores no fingerprint for an asset that has never had a Bible written (today's default state)", async () => {
    const assetId = await insertAsset(ctx, projectId, { description: "Existing description", notes: "Existing notes" });
    const row = await readAsset(ctx, assetId);
    expect(row.bibleSourceFingerprint).toBeNull();
    expect(readAssetBibleFreshness(row)).toBe("no-bible");
  });

  it("captures the fingerprint of description/notes exactly as written, and reads back as current", async () => {
    const assetId = await insertAsset(ctx, projectId, {});

    const result = await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A hero character.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(result).toEqual({ ok: true });

    const row = await readAsset(ctx, assetId);
    expect(row.bibleSourceFingerprint).not.toBeNull();
    expect(readAssetBibleFreshness(row)).toBe("current");
  });

  it("becomes stale once description changes through a different write path (updateAssetDescriptionFieldInline)", async () => {
    const assetId = await insertAsset(ctx, projectId, {});

    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A hero character.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("current");

    const updateResult = await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: "A revised, more feminine silhouette.",
    });
    expect(updateResult).toEqual({ ok: true });

    const after = await readAsset(ctx, assetId);
    // updateAssetDescriptionFieldInline never touches bibleSourceFingerprint
    // itself — staleness is entirely a read-time comparison against the live
    // description.
    expect(readAssetBibleFreshness(after)).toBe("stale");
  });

  it("re-captures on the next Bible write, returning to current", async () => {
    const assetId = await insertAsset(ctx, projectId, {});

    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A hero character.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    await updateAssetDescriptionFieldInline({
      assetId,
      projectId,
      field: "description",
      mode: "replace",
      content: "A revised, more feminine silhouette.",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("stale");

    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A revised, more feminine silhouette.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape, updated silhouette.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });

    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("current");
  });
});

describe("Asset Bible freshness capture — SCHEMA.BIBLE_FRESHNESS.1-R1 (fingerprint only moves when the Bible does)", () => {
  it("goes stale when description alone changes through updateAssetDetailsInline with the Bible reported unchanged, stays current when the Bible changes alongside it, and goes stale again when only notes change", async () => {
    const assetId = await insertAsset(ctx, projectId, {});

    // 1. Generate a Bible — fingerprint captured, current.
    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A hero character.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("current");

    // 2. Ordinary "Save Details" path: description alone changes, the Bible
    // is reported back unchanged. The fingerprint must NOT move, so the read
    // model sees the description has outrun the Bible it was captured from.
    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A revised, more feminine silhouette.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("stale");

    // 3. Description and Bible change in the same call — a real
    // regeneration — fingerprint recaptured, current again.
    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A revised, more feminine silhouette.",
      notes: "Softer jawline.",
      visualIdentity: "Tall, red cape, updated silhouette.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("current");

    // 4. Notes alone change, Bible reported unchanged — stale again.
    await updateAssetDetailsInline({
      assetId,
      projectId,
      description: "A revised, more feminine silhouette.",
      notes: "Sharper jawline.",
      visualIdentity: "Tall, red cape, updated silhouette.",
      usageRules: "Always framed heroically.",
      forbiddenVariations: "Never shown slouching.",
      lighting: "",
      promptCard: "",
    });
    expect(readAssetBibleFreshness(await readAsset(ctx, assetId))).toBe("stale");
  });
});
