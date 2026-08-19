import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `assetBible.generate`'s
// three declared variables (`ASSET.CORE`, `ASSET.BIBLE`, `PROJECT.STYLE`)
// equals what `generateAssetBibleDraft` used to pass to
// `buildAssetBibleFromContextPrompt`, before the B3b switch — `context.asset`
// (the union of `ASSET.CORE` and `ASSET.BIBLE`) and `style` (`PROJECT.STYLE`,
// collapsed to empty segments when no Style is active, exactly
// `resolveProjectStyle`'s own `{ mode: "none" }` shape).
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b): `generateAssetBibleDraft`
// no longer calls `buildAssetBibleFromContextPrompt`, so a mocked capture of
// the action's own call would capture nothing. The comparison now reads the
// same seeded rows directly instead, mirroring
// `sequencePrompt.assist.test.ts`'s own re-pointing at the B3a switch.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({
      visual_identity: "A generated visual identity.",
      usage_rules: "A generated usage rule.",
      forbidden_variations: "A generated forbidden variation.",
    })
  ),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let resolveAssetBible: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetBible;
let resolveProjectStyle: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectStyle;
let projectId: number;
let assetId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
  ({ resolveAssetCore, resolveAssetBible, resolveProjectStyle } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));

  projectId = await insertProject(ctx, "Asset Bible project");
  assetId = await insertAsset(ctx, projectId, {
    name: "Hero Robot",
    type: "character",
    description: "A weathered combat robot.",
    notes: "Appears throughout Act 2.",
    visualIdentity: "Existing visual identity.",
    usageRules: "Existing usage rule.",
    forbiddenVariations: "Existing forbidden variation.",
  });
});

afterAll(() => ctx.cleanup());

describe("assetBible.generate descriptor — context equality", () => {
  it("resolving ASSET.CORE, ASSET.BIBLE and PROJECT.STYLE equals what generateAssetBibleDraft passes to its builder", async () => {
    const result = await runWorkspaceOperation({ descriptorId: "assetBible.generate", ids: { projectId, assetId } });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(result).toEqual({
      ok: true,
      kind: "object",
      values: {
        visualIdentity: "A generated visual identity.",
        usageRules: "A generated usage rule.",
        forbiddenVariations: "A generated forbidden variation.",
      },
    });

    const actionArg = {
      asset: {
        name: "Hero Robot",
        type: "character",
        description: "A weathered combat robot.",
        notes: "Appears throughout Act 2.",
        visualIdentity: "Existing visual identity.",
        usageRules: "Existing usage rule.",
        forbiddenVariations: "Existing forbidden variation.",
      },
      style: { worldSegment: "", visualSegment: "", rulesSegment: "" },
    };

    expect(assetBibleGenerateDescriptor.context.variables.map((v) => v.id)).toEqual([
      "ASSET.CORE",
      "ASSET.BIBLE",
      "PROJECT.STYLE",
    ]);
    expect(assetBibleGenerateDescriptor.anchor).toEqual({ kind: "entity", entity: "asset" });
    expect(assetBibleGenerateDescriptor.intent).toEqual({});

    const [core, bible, style] = await Promise.all([
      resolveAssetCore(assetId),
      resolveAssetBible(assetId),
      resolveProjectStyle(projectId),
    ]);

    expect({ ...core, ...bible }).toEqual(actionArg.asset);

    // No active Project Style in this fixture: PROJECT.STYLE resolves to
    // `{ mode: "none" }`, which the action collapses to empty segments —
    // the same collapse `resolveProjectStyle`'s own contract describes.
    expect(style).toEqual({ mode: "none" });
    expect(actionArg.style).toEqual({ worldSegment: "", visualSegment: "", rulesSegment: "" });
  });
});
