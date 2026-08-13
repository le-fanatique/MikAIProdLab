import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `assetDescription.generate`'s
// six declared variables equals what `generateAssetDescriptionOnlyDraft`
// passes to `buildAssetDescriptionOnlyPrompt` today, through the shared
// `fetchAssetContextInput` (`src/actions/llm/assetDescription.ts`). Same two
// mocks, same real seeded database, same dynamic-import discipline as
// `sequencePrompt.assist.test.ts`.
//
// Plus the ticket's limit requirement: 12 Shots (> the 10 bound), 7
// Sequences (> the 5 bound) and 7 reference images (> the 5 bound) are
// seeded, and the resolvers are proven to return exactly the bound, in
// order, matching what the action's own bounded query actually returned —
// not a declared number nobody exercised.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description_draft: "A generated description." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/asset-description-from-context", () => ({
  buildAssetDescriptionOnlyPrompt: (ctx: unknown) => captureBuilderArg(ctx),
}));

let ctx: TempDb;
let generateAssetDescriptionOnlyDraft: typeof import("@/actions/llm/assetDescription").generateAssetDescriptionOnlyDraft;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let resolveAssetSeqAppearances: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetSeqAppearances;
let resolveAssetShotAppearances: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetShotAppearances;
let resolveAssetReferences: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetReferences;
let resolveProjectStyle: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectStyle;
let projectId: number;
let assetId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateAssetDescriptionOnlyDraft } = await import("@/actions/llm/assetDescription"));
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
  it("resolving the six declared variables equals the context fields generateAssetDescriptionOnlyDraft passes to its builder", async () => {
    const result = await generateAssetDescriptionOnlyDraft(
      form({ projectId: String(projectId), assetId: String(assetId) })
    );
    expect(result).toEqual({ ok: true, draft: "A generated description." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      project: { name: string; pitch: string | null; story: string | null; outline: string | null };
      asset: { name: string; type: string; description: string | null; notes: string | null };
      sequenceContexts: Array<{
        title: string;
        summary: string | null;
        mood: string | null;
        locationHint: string | null;
        narrativePurpose: string | null;
      }>;
      shotContexts: Array<{
        shotCode: string | null;
        title: string;
        description: string | null;
        actionPitch: string | null;
        cameraPitch: string | null;
      }>;
      refImageMeta: Array<{ label: string | null; imageRole: string | null; sourceFilename?: string | null }>;
      style?: { worldSegment: string; rulesSegment: string };
    };

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

    // PROJECT.IDENTITY: the action reads name/pitch/story/outline, not
    // description.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story, outline: identity.outline }).toEqual(
      actionArg.project
    );

    // ASSET.CORE: all four fields.
    expect(core).toEqual(actionArg.asset);

    // ASSET.SEQ_APPEARANCES — bound proof: 7 Sequences seeded, exactly 5
    // resolved, in orderIndex order, equal to the action's own bounded
    // query.
    expect(seqAppearances).toHaveLength(5);
    expect(seqAppearances.map((s) => s.title)).toEqual(["Sequence 0", "Sequence 1", "Sequence 2", "Sequence 3", "Sequence 4"]);
    expect(seqAppearances).toEqual(actionArg.sequenceContexts);

    // ASSET.SHOT_APPEARANCES — bound proof: 12 Shots seeded, exactly 10
    // resolved, in orderIndex order, equal to the action's own bounded
    // query.
    expect(shotAppearances).toHaveLength(10);
    expect(shotAppearances.map((s) => s.shotCode)).toEqual([
      "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9",
    ]);
    expect(shotAppearances).toEqual(actionArg.shotContexts);

    // ASSET.REFERENCES — bound proof: 7 reference images seeded, exactly 5
    // resolved, in orderIndex order, equal to the action's own bounded
    // query.
    expect(references).toHaveLength(5);
    expect(references.map((r) => r.label)).toEqual([
      "Reference 0", "Reference 1", "Reference 2", "Reference 3", "Reference 4",
    ]);
    expect(references).toEqual(actionArg.refImageMeta);

    // PROJECT.STYLE: no active Style in this fixture, resolves to
    // `{ mode: "none" }`; `resolveDescriptionStyleSegments` (the action's own
    // caller of `resolveAssetStyleContext`) collapses that to
    // `{worldSegment: "", rulesSegment: ""}` — never `visualSegment`, unlike
    // `assetBible.generate`.
    expect(style).toEqual({ mode: "none" });
    expect(actionArg.style).toEqual({ worldSegment: "", rulesSegment: "" });
  });
});
