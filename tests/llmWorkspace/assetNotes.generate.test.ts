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
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateAssetNotesOnlyDraft` no longer calls `buildAssetNotesOnlyPrompt`,
// so a mocked capture of the action's own call would capture nothing. The
// comparison now reads the same seeded rows directly instead, mirroring
// `sequencePrompt.assist.test.ts`'s own re-pointing at the B3a switch.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ notes_draft: "A generated note." })),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let projectId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
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
      kind: "object",
      target: { entity: "asset" },
      // `type: "string"` added by LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1): object
      // fields are a union discriminated on `type`, so the discriminant is
      // part of the declared structure this assertion records. Nothing else
      // moved, and this descriptor's own prompt-equality proof is untouched.
      fields: [{ type: "string", field: "notes", jsonKey: "notes_draft", maxLength: 4000 }],
      require: "all",
      exactKeysOnly: true,
      errors: {
        unparsable: "The model returned an unexpected format. Try again.",
        empty: "The model returned an empty or invalid draft. Try again.",
      },
    });
    expect(assetNotesGenerateDescriptor.commit).toEqual(["updateAssetDescriptionFieldInline"]);
  });

  it("resolving PROJECT.IDENTITY and ASSET.CORE equals the seeded rows generateAssetNotesOnlyDraft reads", async () => {
    const result = await runWorkspaceOperation({ descriptorId: "assetNotes.generate", ids: { projectId, assetId } });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(result).toEqual({ ok: true, kind: "object", values: { notes: "A generated note." } });

    const [identity, core] = await Promise.all([resolveProjectIdentity(projectId), resolveAssetCore(assetId)]);

    expect({ name: identity.name, pitch: identity.pitch, story: identity.story, outline: identity.outline }).toEqual({
      name: "Asset Notes project",
      pitch: "A compelling pitch.",
      story: "A previously generated story.",
      outline: "An outline.",
    });
    expect(core).toEqual({
      name: "Sidekick Drone",
      type: "prop",
      description: "A hovering support drone.",
      notes: "Assists the protagonist in Act 1.",
    });
  });
});
