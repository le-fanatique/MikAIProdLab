import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `assetBible.generate`'s
// three declared variables (`ASSET.CORE`, `ASSET.BIBLE`, `PROJECT.STYLE`)
// equals what `generateAssetBibleDraft` passes to
// `buildAssetBibleFromContextPrompt` today — `context.asset` (the union of
// `ASSET.CORE` and `ASSET.BIBLE`) and `style` (`PROJECT.STYLE`, collapsed to
// empty segments when no Style is active, exactly `resolveProjectStyle`'s
// own `{ mode: "none" }` shape). Same two mocks, same real seeded database,
// same dynamic-import discipline as `sequencePrompt.assist.test.ts` — see
// that file's header for the full rationale.
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

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/asset-bible-from-context", () => ({
  buildAssetBibleFromContextPrompt: (ctx: unknown) => captureBuilderArg(ctx),
}));

let ctx: TempDb;
let generateAssetBibleDraft: typeof import("@/actions/llm/assetBible").generateAssetBibleDraft;
let resolveAssetCore: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetCore;
let resolveAssetBible: typeof import("@/lib/llmWorkspace/variables/registry").resolveAssetBible;
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

  ({ generateAssetBibleDraft } = await import("@/actions/llm/assetBible"));
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
    const result = await generateAssetBibleDraft(
      form({ projectId: String(projectId), assetId: String(assetId) })
    );
    expect(result).toEqual({
      ok: true,
      draft: {
        visualIdentity: "A generated visual identity.",
        usageRules: "A generated usage rule.",
        forbiddenVariations: "A generated forbidden variation.",
      },
    });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      asset: {
        name: string;
        type: string;
        description: string | null;
        notes: string | null;
        visualIdentity: string | null;
        usageRules: string | null;
        forbiddenVariations: string | null;
      };
      style: { worldSegment: string; visualSegment: string; rulesSegment: string };
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
