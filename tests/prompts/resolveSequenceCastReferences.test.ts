import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// resolveSequenceCastReferences — IND.SEQGEN.RESOLVE.1. Characterization
// tests: they lock down `src/lib/prompts/resolveSequenceCastReferences.ts`
// (mechanically extracted, byte-for-byte, from the Sequence Storyboard
// generate page) exactly as it behaves today. No production behavior is
// changed by this ticket.
//
// The `CHARACTERIZATION:` tests below are NOT specifications. Each records a
// behaviour the ticket asked to be fixed as-is, whether it looks right or
// not — see `.agents/executor_report.md` for the author's own judgment on
// each one.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveSequenceCastReferences: typeof import("@/lib/prompts/resolveSequenceCastReferences").resolveSequenceCastReferences;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSequenceCastReferences } = await import("@/lib/prompts/resolveSequenceCastReferences"));
});

afterAll(() => ctx.cleanup());

const MINIMAL_WORKFLOW_JSON = "{}";

async function insertShotAsset(shotId: number, assetId: number): Promise<void> {
  await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
}

async function insertAssetReferenceImage(
  assetId: number,
  values: Partial<typeof ctx.schema.assetReferenceImages.$inferInsert> = {}
): Promise<number> {
  const [row] = await ctx.db
    .insert(ctx.schema.assetReferenceImages)
    .values({ assetId, imagePath: "uploads/asset-reference-images/fixture.jpg", ...values })
    .returning({ id: ctx.schema.assetReferenceImages.id });
  return row.id;
}

describe("resolveSequenceCastReferences", () => {
  it("a Sequence with no Shots at all: every collection comes back empty, no query is even attempted", async () => {
    const result = await resolveSequenceCastReferences({
      shotIds: [],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.castByShot.size).toBe(0);
    expect(result.assetRefsByAsset.size).toBe(0);
    expect(result.refMetaByRefId.size).toBe(0);
    expect(result.castingEditorAssets).toEqual([]);
    expect(result.availableImages).toEqual([]);
    expect(result.hasExplicitSelection).toBe(false);
    expect(result.storyboardCompositionParam).toBe("guide");
    expect(result.useGuideComposition).toBe(true);
    expect(result.storyboardRefsParam).toBe("");
    // "{}" fails parseComfyWorkflow's own validation (no nodes) — this
    // resolver passes `workflowJson` through verbatim, it does not paper
    // over that.
    expect(result.parsed).toBeNull();
  });

  it("a Shot with no Asset cast on it: absent from castByShot entirely, never an empty-array entry", async () => {
    const projectId = await insertProject(ctx, "P1");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, { title: "Empty Shot" });

    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.castByShot.has(shotId)).toBe(false);
    expect(result.castingEditorAssets).toEqual([]);
  });

  it("CHARACTERIZATION: an Asset cast in three Shots of the Sequence appears exactly once, with shotCount 3", async () => {
    const projectId = await insertProject(ctx, "P2");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotA = await insertShot(ctx, sequenceId, { title: "Shot A", orderIndex: 0 });
    const shotB = await insertShot(ctx, sequenceId, { title: "Shot B", orderIndex: 1 });
    const shotC = await insertShot(ctx, sequenceId, { title: "Shot C", orderIndex: 2 });
    const assetId = await insertAsset(ctx, projectId, { name: "Hero" });
    await insertShotAsset(shotA, assetId);
    await insertShotAsset(shotB, assetId);
    await insertShotAsset(shotC, assetId);

    const result = await resolveSequenceCastReferences({
      shotIds: [shotA, shotB, shotC],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.castingEditorAssets).toHaveLength(1);
    expect(result.castingEditorAssets[0].assetId).toBe(assetId);
    expect(result.castingEditorAssets[0].shotCount).toBe(3);

    // Cast unicity does not collapse castByShot: the Asset still shows up
    // once per Shot it is actually cast on, each Shot's own list.
    expect(result.castByShot.get(shotA)?.map((r) => r.assetId)).toEqual([assetId]);
    expect(result.castByShot.get(shotB)?.map((r) => r.assetId)).toEqual([assetId]);
    expect(result.castByShot.get(shotC)?.map((r) => r.assetId)).toEqual([assetId]);
  });

  it("CHARACTERIZATION: castingEditorAssets is ordered by Asset name (asc), regardless of Shot/insertion order", async () => {
    const projectId = await insertProject(ctx, "P3");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetZebra = await insertAsset(ctx, projectId, { name: "Zebra" });
    const assetApple = await insertAsset(ctx, projectId, { name: "Apple" });
    const assetMango = await insertAsset(ctx, projectId, { name: "Mango" });
    // Inserted shot_assets rows in a deliberately non-alphabetical order.
    await insertShotAsset(shotId, assetZebra);
    await insertShotAsset(shotId, assetApple);
    await insertShotAsset(shotId, assetMango);

    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.castingEditorAssets.map((a) => a.assetName)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("CHARACTERIZATION: reference order within an Asset follows orderIndex then id, and is stable across two resolutions", async () => {
    const projectId = await insertProject(ctx, "P4");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId, { name: "Hero" });
    const refB = await insertAssetReferenceImage(assetId, { orderIndex: 1, label: "Second" });
    const refA = await insertAssetReferenceImage(assetId, { orderIndex: 0, label: "First" });
    await insertShotAsset(shotId, assetId);

    const args = { shotIds: [shotId], currentSearchParams: {}, workflowJson: MINIMAL_WORKFLOW_JSON };
    const first = await resolveSequenceCastReferences(args);
    const second = await resolveSequenceCastReferences(args);

    const expectedOrder = [`asset-${assetId}-${refA}`, `asset-${assetId}-${refB}`];
    expect(first.castingEditorAssets[0].references.map((r) => r.refId)).toEqual(expectedOrder);
    expect(second.castingEditorAssets[0].references.map((r) => r.refId)).toEqual(expectedOrder);
    expect([...first.refMetaByRefId.keys()]).toEqual(expectedOrder);
  });

  it("CHARACTERIZATION: an Asset cast on the Sequence (sequence_assets) but on no Shot is entirely invisible here — this resolver only ever reads shot_assets", async () => {
    const projectId = await insertProject(ctx, "P5");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const sequenceOnlyAsset = await insertAsset(ctx, projectId, { name: "Backdrop" });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId: sequenceOnlyAsset });
    // No shot_assets row links sequenceOnlyAsset to shotId or any other Shot.

    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.castingEditorAssets).toEqual([]);
    expect(result.castByShot.has(shotId)).toBe(false);
    expect(result.assetRefsByAsset.size).toBe(0);
  });

  it("CHARACTERIZATION: a reference not approved for generation is still resolved and returned like any other — approval is not filtered here", async () => {
    const projectId = await insertProject(ctx, "P6");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId, { name: "Hero" });
    await insertShotAsset(shotId, assetId);
    const refId = await insertAssetReferenceImage(assetId, { approvedForGeneration: false });

    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: { storyboardRefs: `asset-${assetId}-${refId}` },
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    const key = `asset-${assetId}-${refId}`;
    expect(result.refMetaByRefId.get(key)?.approvedForGeneration).toBe(false);
    expect(result.hasExplicitSelection).toBe(true);
    expect(result.availableImages).toHaveLength(1);
    expect(result.availableImages[0].approved).toBe(false);
  });

  it("CHARACTERIZATION: availableImages follows the storyboardRefs selection order, not the Asset/reference resolution order", async () => {
    const projectId = await insertProject(ctx, "P7");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId, { name: "Hero" });
    await insertShotAsset(shotId, assetId);
    const refA = await insertAssetReferenceImage(assetId, { orderIndex: 0 });
    const refB = await insertAssetReferenceImage(assetId, { orderIndex: 1 });
    const idA = `asset-${assetId}-${refA}`;
    const idB = `asset-${assetId}-${refB}`;

    // Selection order reversed relative to the underlying orderIndex order.
    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: { storyboardRefs: `${idB},${idA}` },
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.availableImages.map((img) => img.id)).toEqual([idB, idA]);
  });

  it("no explicit storyboardRefs selection: hasExplicitSelection is false and availableImages is empty even though references exist", async () => {
    const projectId = await insertProject(ctx, "P8");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const assetId = await insertAsset(ctx, projectId, { name: "Hero" });
    await insertShotAsset(shotId, assetId);
    await insertAssetReferenceImage(assetId);

    const result = await resolveSequenceCastReferences({
      shotIds: [shotId],
      currentSearchParams: {},
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.hasExplicitSelection).toBe(false);
    expect(result.availableImages).toEqual([]);
    // castingEditorAssets is unaffected by the selection — it still shows
    // every reference, selected or not.
    expect(result.castingEditorAssets[0].references).toHaveLength(1);
  });

  it("storyboardComposition=legacy opts out of the guide composition default", async () => {
    const result = await resolveSequenceCastReferences({
      shotIds: [],
      currentSearchParams: { storyboardComposition: "legacy" },
      workflowJson: MINIMAL_WORKFLOW_JSON,
    });

    expect(result.storyboardCompositionParam).toBe("legacy");
    expect(result.useGuideComposition).toBe(false);
  });
});
