import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";

// ---------------------------------------------------------------------------
// LLMW.ASSETS.TYPEFILTER.1 (S2) — the `postResponse` brick proof itself, run
// through the real `runOperation` pipeline (parse -> postResponse), the same
// discipline as `castingFromSequence.runner.test.ts`'s own postResponse
// section.
//
// This is *not* a reproduction of `generateAssetCandidatesDraft` /
// `parseAssetsResult`, unlike every other proof file in this domain: the
// pre-migration chain never filtered on `assetType` at all. This filter is a
// deliberate behaviour change decided by the user on 2026-08-17
// (`docs/ARCHITECTURE_DECISIONS.md`, "Four Arbitrations Taken 2026-08-17",
// point 2), made expressible only now that the pipeline has a post-response
// stage (LLMW.POSTRESPONSE.1, B7c-n3). See
// `assetsFromProjectDescriptor.postResponse`'s own header note
// (`descriptors/assetsFromProject.ts`) and
// `renderAssetsFromProjectFilterByType`'s own header note
// (`variables/registry.ts`) for the full account.
// ---------------------------------------------------------------------------

let mockRaw = "";
vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => mockRaw),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
});

afterAll(() => ctx.cleanup());

async function makeProject(): Promise<number> {
  const id = await insertProject(ctx, "Neon Skyline");
  const { eq } = await import("drizzle-orm");
  await ctx.db.update(ctx.schema.projects).set({ pitch: "A pitch." }).where(eq(ctx.schema.projects.id, id));
  return id;
}

describe("assets.fromProject — postResponse type filter (LLMW.ASSETS.TYPEFILTER.1, S2)", () => {
  it("a candidate of a requested type is kept, all fields intact", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({
      assets: [
        {
          name: "Kai the Courier",
          assetType: "character",
          description: "A courier.",
          notes: "Recurring lead.",
          sourceLevel: "outline",
          sourceExcerpt: "A courier races across the city.",
          duplicateWarning: "",
        },
      ],
    });

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: ["character"] } });

    expect(result).toEqual({
      ok: true,
      kind: "list",
      items: [
        {
          name: "Kai the Courier",
          assetType: "character",
          description: "A courier.",
          notes: "Recurring lead.",
          sourceLevel: "outline",
          sourceExcerpt: "A courier races across the city.",
          duplicateWarning: "",
        },
      ],
    });
  });

  it("a candidate of a non-requested type is dropped", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({ assets: [{ name: "Getaway Bike", assetType: "vehicle" }] });

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: ["character"] } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("keeps the response's own order among the requested-type survivors", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({
      assets: [
        { name: "A", assetType: "vehicle" },
        { name: "B", assetType: "character" },
        { name: "C", assetType: "prop" },
        { name: "D", assetType: "character" },
      ],
    });

    const result = await runOperation(
      assetsFromProjectDescriptor,
      { projectId },
      { parameters: { assetTypes: ["character", "prop"] } }
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items.map((i) => i.name)).toEqual(["B", "C", "D"]);
  });

  it("every candidate of a non-requested type: {ok:true, items:[]}, not the 'empty' message — the runner's own empty-refusal (runner.ts, parseListOutput) runs on the parsed, pre-postResponse array, before this filter ever executes; the same divergence family LLMW.MIGRATE.LIST.4 documented for casting.filterAndEnrich (its ticket §A.5, docs/PROJECT_STATE.md)", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({
      assets: [
        { name: "Getaway Bike", assetType: "vehicle" },
        { name: "Neon Sign", assetType: "prop" },
      ],
    });

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: ["character"] } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("an unrecognised assetType falls back to 'other' (readEnumField's own mandatory default) before this filter ever sees it — dropped when 'other' was not among the requested types", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({ assets: [{ name: "Mystery Object", assetType: "not-a-real-type" }] });

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: ["character"] } });

    expect(result).toEqual({ ok: true, kind: "list", items: [] });
  });

  it("the same 'other' fallback survives when 'other' is itself among the requested types", async () => {
    const projectId = await makeProject();
    mockRaw = JSON.stringify({ assets: [{ name: "Mystery Object", assetType: "not-a-real-type" }] });

    const result = await runOperation(assetsFromProjectDescriptor, { projectId }, { parameters: { assetTypes: ["other"] } });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");
    expect(result.items).toEqual([
      {
        name: "Mystery Object",
        assetType: "other",
        description: "",
        notes: "",
        sourceLevel: "outline",
        sourceExcerpt: "",
        duplicateWarning: "",
      },
    ]);
  });
});
