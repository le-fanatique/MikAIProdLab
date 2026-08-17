import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertAsset } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SEQ.SHOT_TARGETS / PROJECT.ASSET_LIBRARY / SEQ.EXISTING_CASTINGS —
// LLMW.VAR.CASTING.1 (B7h-b1). No oracle exists for these three variables
// (new, not migrated) — unit proofs of each resolver's own contract: content
// + order, exact projection, isolation, empty case. `SEQ.EXISTING_CASTINGS`
// additionally proves it reads both the plan level and the sequence level,
// distinguished.
//
// Isolation is proven with a second, fully populated sequence AND a second,
// fully populated project — a casting from another sequence leaking here
// would make the model propose attributions that do not exist — plus the
// mutation control recorded in `.agents/executor_report.md`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveSeqShotTargets: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqShotTargets;
let resolveProjectAssetLibrary: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectAssetLibrary;
let resolveSeqExistingCastings: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqExistingCastings;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSeqShotTargets, resolveProjectAssetLibrary, resolveSeqExistingCastings } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));
});

afterAll(() => ctx.cleanup());

describe("resolveSeqShotTargets — resolver contract", () => {
  it("returns the sequence's shots in orderIndex order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "SEQ.SHOT_TARGETS project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    await insertShot(ctx, sequenceId, {
      title: "Third",
      orderIndex: 2,
      shotCode: "SH030",
      description: "D3",
      actionPitch: "A3",
      continuityIn: "In3",
      continuityOut: "Out3",
    });
    await insertShot(ctx, sequenceId, {
      title: "First",
      orderIndex: 0,
      shotCode: "SH010",
      description: "D1",
      actionPitch: "A1",
      continuityIn: "In1",
      continuityOut: "Out1",
    });
    await insertShot(ctx, sequenceId, {
      title: "Second",
      orderIndex: 1,
      shotCode: "SH020",
      description: "D2",
      actionPitch: "A2",
      continuityIn: "In2",
      continuityOut: "Out2",
    });

    const result = await resolveSeqShotTargets(sequenceId);
    expect(result.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["id", "shotCode", "title", "description", "actionPitch", "continuityIn", "continuityOut"].sort()
    );
    expect(typeof result[0].id).toBe("number");
  });

  it("returns an empty array for a sequence with no shots", async () => {
    const projectId = await insertProject(ctx, "No shots project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Empty seq" });
    const result = await resolveSeqShotTargets(sequenceId);
    expect(result).toEqual([]);
  });

  it("isolation: nothing from a second, populated sequence leaks into the first sequence's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — shot targets");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A" });
    await insertShot(ctx, sequenceId, { title: "A-only", orderIndex: 0 });

    const otherSequenceId = await insertSequence(ctx, projectId, { title: "Seq B" });
    await insertShot(ctx, otherSequenceId, { title: "B-only-1", orderIndex: 0 });
    await insertShot(ctx, otherSequenceId, { title: "B-only-2", orderIndex: 1 });

    const result = await resolveSeqShotTargets(sequenceId);
    expect(result.map((s) => s.title)).toEqual(["A-only"]);
    expect(result.some((s) => s.title.startsWith("B-only"))).toBe(false);
  });
});

describe("resolveProjectAssetLibrary — resolver contract", () => {
  it("returns the project's assets in orderIndex order, with exactly the declared fields", async () => {
    const projectId = await insertProject(ctx, "PROJECT.ASSET_LIBRARY project");
    await insertAsset(ctx, projectId, {
      name: "Third",
      orderIndex: 2,
      type: "prop",
      description: "D3",
      notes: "N3",
    });
    await insertAsset(ctx, projectId, {
      name: "First",
      orderIndex: 0,
      type: "character",
      description: "D1",
      notes: "N1",
    });
    await insertAsset(ctx, projectId, {
      name: "Second",
      orderIndex: 1,
      type: "environment",
      description: "D2",
      notes: "N2",
    });

    const result = await resolveProjectAssetLibrary(projectId);
    expect(result.map((a) => a.name)).toEqual(["First", "Second", "Third"]);
    expect(Object.keys(result[0]).sort()).toEqual(
      ["id", "name", "type", "description", "notes"].sort()
    );
    expect(typeof result[0].id).toBe("number");
  });

  it("returns an empty array for a project with no assets", async () => {
    const projectId = await insertProject(ctx, "No assets project");
    const result = await resolveProjectAssetLibrary(projectId);
    expect(result).toEqual([]);
  });

  it("isolation: nothing from a second, populated project leaks into the first project's result", async () => {
    const projectId = await insertProject(ctx, "Iso A — asset library");
    await insertAsset(ctx, projectId, { name: "A-only", orderIndex: 0, type: "character" });

    const otherProjectId = await insertProject(ctx, "Iso B — asset library");
    await insertAsset(ctx, otherProjectId, { name: "B-only-1", orderIndex: 0, type: "prop" });
    await insertAsset(ctx, otherProjectId, { name: "B-only-2", orderIndex: 1, type: "vehicle" });

    const result = await resolveProjectAssetLibrary(projectId);
    expect(result.map((a) => a.name)).toEqual(["A-only"]);
    expect(result.some((a) => a.name.startsWith("B-only"))).toBe(false);
  });
});

describe("resolveSeqExistingCastings — resolver contract", () => {
  it("reads both a shot-level casting and a sequence-level casting, distinguished", async () => {
    const projectId = await insertProject(ctx, "SEQ.EXISTING_CASTINGS project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot" });
    const assetOnShotId = await insertAsset(ctx, projectId, { name: "On shot", type: "character" });
    const assetOnSeqId = await insertAsset(ctx, projectId, { name: "On sequence", type: "environment" });

    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId: assetOnShotId });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId: assetOnSeqId });

    const result = await resolveSeqExistingCastings(sequenceId);
    expect(result.shotCastings).toEqual([{ shotId, assetId: assetOnShotId }]);
    expect(result.sequenceCastings).toEqual([{ assetId: assetOnSeqId }]);
  });

  it("returns empty arrays at both levels for a sequence with no castings", async () => {
    const projectId = await insertProject(ctx, "No castings project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq" });
    const result = await resolveSeqExistingCastings(sequenceId);
    expect(result).toEqual({ shotCastings: [], sequenceCastings: [] });
  });

  it("isolation: a casting on a second sequence's shot, and on a second project's sequence, never appears here", async () => {
    const projectId = await insertProject(ctx, "Iso A — existing castings");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Seq A" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot A" });
    const assetId = await insertAsset(ctx, projectId, { name: "Asset A", type: "character" });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });

    // Second sequence, same project: its shot-level casting must not leak.
    const otherSequenceId = await insertSequence(ctx, projectId, { title: "Seq B" });
    const otherShotId = await insertShot(ctx, otherSequenceId, { title: "Shot B" });
    const otherAssetId = await insertAsset(ctx, projectId, { name: "Asset B", type: "prop" });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId: otherShotId, assetId: otherAssetId });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId: otherSequenceId, assetId: otherAssetId });

    // Second project entirely, with its own sequence, shot, asset and both
    // levels of casting: nothing from it must leak either.
    const otherProjectId = await insertProject(ctx, "Iso B — existing castings");
    const otherProjectSequenceId = await insertSequence(ctx, otherProjectId, { title: "Seq C" });
    const otherProjectShotId = await insertShot(ctx, otherProjectSequenceId, { title: "Shot C" });
    const otherProjectAssetId = await insertAsset(ctx, otherProjectId, { name: "Asset C", type: "vehicle" });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId: otherProjectShotId, assetId: otherProjectAssetId });
    await ctx.db
      .insert(ctx.schema.sequenceAssets)
      .values({ sequenceId: otherProjectSequenceId, assetId: otherProjectAssetId });

    const result = await resolveSeqExistingCastings(sequenceId);
    expect(result.shotCastings).toEqual([{ shotId, assetId }]);
    expect(result.sequenceCastings).toEqual([{ assetId }]);
  });
});
