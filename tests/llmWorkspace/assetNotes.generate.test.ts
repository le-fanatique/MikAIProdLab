import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetNotesGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetNotes";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `assetNotes.generate`'s
// six declared variables equals what `generateAssetNotesOnlyDraft` passes to
// `buildAssetNotesOnlyPrompt` today, through the shared
// `fetchAssetContextInput` (`src/actions/llm/assetDescription.ts`) — the same
// function `assetDescription.generate` and `assetDescription.batch` go
// through. The 5/10/5 bound proof for `ASSET.SEQ_APPEARANCES` /
// `ASSET.SHOT_APPEARANCES` / `ASSET.REFERENCES` is not repeated here: it is
// the same bounded query for all three Asset operations, and
// `assetDescription.generate.test.ts` already proves it against a real
// over-the-bound seed. This test's own contribution is proving the shared
// variable set and the Notes-specific output.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ notes_draft: "A generated note." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/asset-description-from-context", () => ({
  buildAssetNotesOnlyPrompt: (ctx: unknown) => captureBuilderArg(ctx),
}));

let ctx: TempDb;
let generateAssetNotesOnlyDraft: typeof import("@/actions/llm/assetDescription").generateAssetNotesOnlyDraft;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
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

  ({ generateAssetNotesOnlyDraft } = await import("@/actions/llm/assetDescription"));
  ({ resolveProjectIdentity, resolveAssetCore } = await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Asset Notes project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story.", outline: "An outline." })
    .where(eq(ctx.schema.projects.id, projectId));

  assetId = await insertAsset(ctx, projectId, {
    name: "Sidekick Drone",
    type: "prop",
    description: "A hovering support drone.",
    notes: "Assists the protagonist in Act 1.",
  });
});

afterAll(() => ctx.cleanup());

describe("assetNotes.generate descriptor — context equality", () => {
  it("declares the exact same six-variable context as assetDescription.generate — the shared fetchAssetContextInput", () => {
    expect(assetNotesGenerateDescriptor.context.variables).toEqual(
      assetDescriptionGenerateDescriptor.context.variables
    );
    expect(assetNotesGenerateDescriptor.anchor).toEqual({ kind: "entity", entity: "asset" });
    expect(assetNotesGenerateDescriptor.intent).toEqual({});
    expect(assetNotesGenerateDescriptor.output).toEqual({
      target: { entity: "asset" },
      fields: [{ field: "notes", jsonKey: "notes_draft", maxLength: 4000 }],
      require: "all",
      exactKeysOnly: true,
      errors: {
        unparsable: "The model returned an unexpected format. Try again.",
        empty: "The model returned an empty or invalid draft. Try again.",
      },
    });
    expect(assetNotesGenerateDescriptor.commit).toEqual(["updateAssetDescriptionFieldInline"]);
  });

  it("resolving PROJECT.IDENTITY and ASSET.CORE equals the context fields generateAssetNotesOnlyDraft passes to its builder", async () => {
    const result = await generateAssetNotesOnlyDraft(form({ projectId: String(projectId), assetId: String(assetId) }));
    expect(result).toEqual({ ok: true, draft: "A generated note." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      project: { name: string; pitch: string | null; story: string | null; outline: string | null };
      asset: { name: string; type: string; description: string | null; notes: string | null };
    };

    const [identity, core] = await Promise.all([resolveProjectIdentity(projectId), resolveAssetCore(assetId)]);

    expect({ name: identity.name, pitch: identity.pitch, story: identity.story, outline: identity.outline }).toEqual(
      actionArg.project
    );
    expect(core).toEqual(actionArg.asset);
  });
});
