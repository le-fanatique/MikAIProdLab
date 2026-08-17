import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetDescriptionBatchDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescriptionBatch";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";

// ---------------------------------------------------------------------------
// Proof required by §11.2 plus the ticket's `assetDescription.batch`-specific
// obligation: `anchor.kind === "entitySet"` and its `maxSize` equal the real
// `BATCH_LIMIT` the action enforces — not a constant copied by hand into the
// test. `BATCH_LIMIT` is not exported by `src/actions/llm/assetDescription.ts`
// (and this ticket does not export it, per "aucun fichier existant de src/
// modifié hors src/lib/llmWorkspace"), so the real value is read back out of
// the action's own refusal message, produced by seeding one more assetId
// than any declared bound and calling the real action.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateBatchAssetDescriptionDrafts` no longer calls
// `buildAssetDescriptionFromContextPrompt`, so a mocked capture of the
// action's own call would capture nothing. The comparison now reads the
// same seeded rows directly instead, mirroring
// `sequencePrompt.assist.test.ts`'s own re-pointing at the B3a switch.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({ description_draft: "A generated description.", notes_draft: "A generated note." })
  ),
}));

let ctx: TempDb;
let generateBatchAssetDescriptionDrafts: typeof import("@/actions/llm/assetDescription").generateBatchAssetDescriptionDrafts;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let projectId: number;
let assetIdA: number;
let assetIdB: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateBatchAssetDescriptionDrafts } = await import("@/actions/llm/assetDescription"));
  ({ resolveProjectIdentity, resolveAssetCore } = await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Batch Asset Description project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story.", outline: "An outline." })
    .where(eq(ctx.schema.projects.id, projectId));

  assetIdA = await insertAsset(ctx, projectId, { name: "Asset A", type: "character" });
  assetIdB = await insertAsset(ctx, projectId, { name: "Asset B", type: "prop" });
});

afterAll(() => ctx.cleanup());

describe("assetDescription.batch descriptor — entitySet anchor against the real BATCH_LIMIT", () => {
  it("refuses one item over the real limit, and the descriptor's maxSize equals that real value", async () => {
    // One more assetId than the descriptor declares — none of them need to
    // exist, since the action's own length check runs before any lookup.
    const overLimitIds = Array.from({ length: assetDescriptionBatchDescriptor.anchor.kind === "entitySet"
      ? assetDescriptionBatchDescriptor.anchor.maxSize + 1
      : 0
    }, (_, i) => 9000 + i);

    const refused = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(projectId), assetIds: JSON.stringify(overLimitIds) })
    );
    expect(refused.ok).toBe(false);

    const message = !refused.ok ? refused.error : "";
    const match = message.match(/^Select up to (\d+) assets at a time\.$/);
    expect(match).not.toBeNull();
    const realBatchLimit = Number(match?.[1]);

    expect(assetDescriptionBatchDescriptor.anchor).toEqual({
      kind: "entitySet",
      entity: "asset",
      maxSize: realBatchLimit,
    });

    // Exactly at the real limit must NOT be refused for being oversized —
    // proves the boundary is exact, not off-by-one. (It may still fail
    // later for other reasons; only the size refusal is asserted absent.)
    const atLimitIds = Array.from({ length: realBatchLimit }, (_, i) => 9000 + i);
    const atLimit = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(projectId), assetIds: JSON.stringify(atLimitIds) })
    );
    if (!atLimit.ok) {
      expect(atLimit.error).not.toBe(`Select up to ${realBatchLimit} assets at a time.`);
    }
  });
});

describe("assetDescription.batch descriptor — context equality", () => {
  it("declares the exact same six-variable context as assetDescription.generate — the shared fetchAssetContextInput", () => {
    expect(assetDescriptionBatchDescriptor.context.variables).toEqual(
      assetDescriptionGenerateDescriptor.context.variables
    );
    expect(assetDescriptionBatchDescriptor.intent).toEqual({});
    expect(assetDescriptionBatchDescriptor.output).toEqual({
      kind: "object",
      target: { entity: "asset" },
      fields: [
        // `type: "string"` added by LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) —
        // the discriminant is part of the declared structure this assertion
        // records. Nothing else moved.
        { type: "string", field: "description", jsonKey: "description_draft" },
        { type: "string", field: "notes", jsonKey: "notes_draft" },
      ],
      require: "any",
      errors: {
        unparsable: "The model returned an unexpected format. Try again.",
        empty: "The model returned an empty draft. Try again.",
      },
    });
    expect(assetDescriptionBatchDescriptor.commit).toEqual(["applyBatchAssetDescriptionDraftsInline"]);
  });

  it("resolving PROJECT.IDENTITY and ASSET.CORE per item equals the seeded rows generateBatchAssetDescriptionDrafts reads", async () => {
    const result = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(projectId), assetIds: JSON.stringify([assetIdA, assetIdB]) })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.results).toHaveLength(2);
    expect(result.errors).toEqual([]);

    const identity = await resolveProjectIdentity(projectId);
    const [coreA, coreB] = await Promise.all([resolveAssetCore(assetIdA), resolveAssetCore(assetIdB)]);

    expect({
      name: identity.name,
      pitch: identity.pitch,
      story: identity.story,
      outline: identity.outline,
    }).toEqual({
      name: "Batch Asset Description project",
      pitch: "A compelling pitch.",
      story: "A previously generated story.",
      outline: "An outline.",
    });
    expect(coreA).toEqual({ name: "Asset A", type: "character", description: null, notes: null });
    expect(coreB).toEqual({ name: "Asset B", type: "prop", description: null, notes: null });
  });
});
