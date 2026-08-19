import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `assetDescription.generate`'s
// six declared variables equals what `generateAssetDescriptionOnlyDraft`
// used to pass to `buildAssetDescriptionOnlyPrompt`, through the shared
// `fetchAssetContextInput` (`src/actions/llm/assetDescription.ts`, deleted at
// the B3b switch).
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateAssetDescriptionOnlyDraft` no longer calls
// `buildAssetDescriptionOnlyPrompt`, so a mocked capture of the action's own
// call would capture nothing. The comparison now reads the same seeded rows
// directly instead, mirroring `sequencePrompt.assist.test.ts`'s own
// re-pointing at the B3a switch.
//
// Plus the ticket's limit requirement: 12 Shots (> the 10 bound), 7
// Sequences (> the 5 bound) and 7 reference images (> the 5 bound) are
// seeded, and the resolvers are proven to return exactly the bound, in
// order, matching what the operation's own bounded query actually returns —
// not a declared number nobody exercised.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description_draft: "A generated description." })),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let resolveAssetSeqAppearances: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetSeqAppearances;
let resolveAssetShotAppearances: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetShotAppearances;
let resolveAssetReferences: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetReferences;
let resolveProjectStyle: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectStyle;
let projectId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
  ({
    resolveProjectIdentity,
    resolveAssetCore,
    resolveAssetSeqAppearances,
    resolveAssetShotAppearances,
    resolveAssetReferences,
    resolveProjectStyle,
  } = await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Asset Description project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story.", outline: "An outline." })
    .where(eq(ctx.schema.projects.id, projectId));

  assetId = await insertAsset(ctx, projectId, {
    name: "Hero Robot",
    type: "character",
    description: "A weathered combat robot.",
    notes: "Appears throughout Act 2.",
  });

  // 7 Sequences (> ASSET.SEQ_APPEARANCES's 5-entry bound), each cast with
  // the Asset, distinct orderIndex so ordering is unambiguous.
  for (let i = 0; i < 7; i++) {
    const sequenceId = await insertSequence(ctx, projectId, {
      title: `Sequence ${i}`,
      summary: `Summary ${i}`,
      mood: `Mood ${i}`,
      locationHint: `Location ${i}`,
      narrativePurpose: `Purpose ${i}`,
      orderIndex: i,
    });
    await ctx.db.insert(ctx.schema.sequenceAssets).values({ sequenceId, assetId });

    // 12 Shots total (> ASSET.SHOT_APPEARANCES's 10-entry bound), 1 or 2
    // Shots per Sequence, distinct orderIndex.
    const shotId = await insertShot(ctx, sequenceId, {
      title: `Shot ${i}`,
      shotCode: `S${i}`,
      description: `Shot description ${i}`,
      actionPitch: `Action ${i}`,
      cameraPitch: `Camera ${i}`,
      orderIndex: i,
    });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
  }
  // 5 more Shots (across the last Sequence's cast) to reach 12 total.
  const lastSequenceId = await insertSequence(ctx, projectId, { title: "Extra sequence", orderIndex: 100 });
  for (let i = 7; i < 12; i++) {
    const shotId = await insertShot(ctx, lastSequenceId, {
      title: `Shot ${i}`,
      shotCode: `S${i}`,
      description: `Shot description ${i}`,
      actionPitch: `Action ${i}`,
      cameraPitch: `Camera ${i}`,
      orderIndex: i,
    });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
  }

  // 7 reference images (> ASSET.REFERENCES's 5-entry bound).
  for (let i = 0; i < 7; i++) {
    await ctx.db.insert(ctx.schema.assetReferenceImages).values({
      assetId,
      orderIndex: i,
      imagePath: `/tmp/ref-${i}.png`,
      label: `Reference ${i}`,
      imageRole: "reference",
    });
  }
});

afterAll(() => ctx.cleanup());

describe("assetDescription.generate descriptor — context equality", () => {
  it("resolving the six declared variables equals the seeded rows the operation reads", async () => {
    const result = await runWorkspaceOperation({ descriptorId: "assetDescription.generate", ids: { projectId, assetId } });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(result).toEqual({ ok: true, kind: "object", values: { description: "A generated description." } });

    expect(assetDescriptionGenerateDescriptor.context.variables.map((v) => v.id)).toEqual([
      "PROJECT.IDENTITY",
      "ASSET.CORE",
      "ASSET.SEQ_APPEARANCES",
      "ASSET.SHOT_APPEARANCES",
      "ASSET.REFERENCES",
      "PROJECT.STYLE",
    ]);
    expect(assetDescriptionGenerateDescriptor.anchor).toEqual({ kind: "entity", entity: "asset" });
    expect(assetDescriptionGenerateDescriptor.intent).toEqual({});

    const [identity, core, seqAppearances, shotAppearances, references, style] = await Promise.all([
      resolveProjectIdentity(projectId),
      resolveAssetCore(assetId),
      resolveAssetSeqAppearances(assetId),
      resolveAssetShotAppearances(assetId),
      resolveAssetReferences(assetId),
      resolveProjectStyle(projectId),
    ]);

    // PROJECT.IDENTITY: the operation reads name/pitch/story/outline, not
    // description.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story, outline: identity.outline }).toEqual({
      name: "Asset Description project",
      pitch: "A compelling pitch.",
      story: "A previously generated story.",
      outline: "An outline.",
    });

    // ASSET.CORE: all four fields.
    expect(core).toEqual({
      name: "Hero Robot",
      type: "character",
      description: "A weathered combat robot.",
      notes: "Appears throughout Act 2.",
    });

    // ASSET.SEQ_APPEARANCES — bound proof: 7 Sequences seeded, exactly 5
    // resolved, in orderIndex order.
    expect(seqAppearances).toHaveLength(5);
    expect(seqAppearances.map((s) => s.title)).toEqual(["Sequence 0", "Sequence 1", "Sequence 2", "Sequence 3", "Sequence 4"]);

    // ASSET.SHOT_APPEARANCES — bound proof: 12 Shots seeded, exactly 10
    // resolved, in orderIndex order.
    expect(shotAppearances).toHaveLength(10);
    expect(shotAppearances.map((s) => s.shotCode)).toEqual([
      "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9",
    ]);

    // ASSET.REFERENCES — bound proof: 7 reference images seeded, exactly 5
    // resolved, in orderIndex order.
    expect(references).toHaveLength(5);
    expect(references.map((r) => r.label)).toEqual([
      "Reference 0", "Reference 1", "Reference 2", "Reference 3", "Reference 4",
    ]);

    // PROJECT.STYLE: no active Style in this fixture, resolves to
    // `{ mode: "none" }`, collapsed by the render form to
    // `{worldSegment: "", rulesSegment: ""}` (proven byte-for-byte by
    // `assetDescription.generate.render.test.ts`) — never `visualSegment`,
    // unlike `assetBible.generate`.
    expect(style).toEqual({ mode: "none" });
  });
});
