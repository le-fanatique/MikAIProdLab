import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";
import { buildAssetDescriptionOnlyPrompt } from "@/lib/prompts/asset-description-from-context";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `assetDescription.generate` — same structure as
// `sequencePrompt.assist.runner.test.ts`. No preconditions are declared on
// this descriptor and `generateSingleField` (`src/actions/llm/assetDescription.ts`)
// runs no pre-call non-empty check, so the fourth obligation does not apply
// here — the strict single-field parser's "other field's key is refused"
// proof (the ticket's extra requirement for strict parsers) stands in its
// place.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateAssetDescriptionOnlyDraft` no longer calls
// `buildAssetDescriptionOnlyPrompt`, so a mocked capture of the action's own
// call would capture nothing. The comparison now calls the frozen oracle
// directly against the same seeded rows instead — no Sequences, Shots, or
// reference images are inserted by this fixture, so those context lists are
// `[]` on both sides, and no Project Style is active.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ description_draft: "A generated description." })),
}));

let ctx: TempDb;
let generateAssetDescriptionOnlyDraft: typeof import("@/actions/llm/assetDescription").generateAssetDescriptionOnlyDraft;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;
let otherProjectId: number;
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
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Asset Description project");
  otherProjectId = await insertProject(ctx, "A different project");
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
});

afterAll(() => ctx.cleanup());

function expectedPrompt() {
  return buildAssetDescriptionOnlyPrompt({
    project: {
      name: "Asset Description project",
      pitch: "A compelling pitch.",
      story: "A previously generated story.",
      outline: "An outline.",
    },
    asset: {
      name: "Hero Robot",
      type: "character",
      description: "A weathered combat robot.",
      notes: "Appears throughout Act 2.",
    },
    sequenceContexts: [],
    shotContexts: [],
    refImageMeta: [],
    style: { worldSegment: "", rulesSegment: "" },
  });
}

describe("assetDescription.generate — runner proof (LLMW.RUNNER.1b)", () => {
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte", async () => {
    const result = await generateAssetDescriptionOnlyDraft(
      form({ projectId: String(projectId), assetId: String(assetId) })
    );
    expect(result).toEqual({ ok: true, draft: "A generated description." });

    const expected = expectedPrompt();

    const runnerResult = await resolveOperationPrompt(assetDescriptionGenerateDescriptor, { projectId, assetId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("2. refuses an Asset belonging to a different Project, with the same message generateAssetDescriptionOnlyDraft produces", async () => {
    const actionResult = await generateAssetDescriptionOnlyDraft(
      form({ projectId: String(otherProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Asset not found." });

    const runnerResult = await resolveOperationPrompt(assetDescriptionGenerateDescriptor, {
      projectId: otherProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Asset not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateAssetDescriptionOnlyDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateAssetDescriptionOnlyDraft(
      form({ projectId: String(nonExistentProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(assetDescriptionGenerateDescriptor, {
      projectId: nonExistentProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ description_draft: "A fresh description." }));
    const valid = await runOperation(assetDescriptionGenerateDescriptor, { projectId, assetId });
    expect(valid).toEqual({ ok: true, values: { description: "A fresh description." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(assetDescriptionGenerateDescriptor, { projectId, assetId });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ description_draft: "   " }));
    const empty = await runOperation(assetDescriptionGenerateDescriptor, { projectId, assetId });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty or invalid draft. Try again.",
    });
  });

  it("3b. the strict parser refuses a response bearing only the other field's key (notes_draft), the same message an unreadable one gets", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ notes_draft: "Not the requested field." }));
    const wrongKey = await runOperation(assetDescriptionGenerateDescriptor, { projectId, assetId });
    expect(wrongKey).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });
  });
});
