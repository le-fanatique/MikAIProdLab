import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetNotesGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetNotes";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `assetNotes.generate` — mirrors `assetDescription.generate.runner.test.ts`
// exactly one field over (Notes instead of Description). No preconditions on
// this descriptor either, same rationale as that file's header.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ notes_draft: "A generated note." })),
}));

let capturedPrompt: { system: string; user: string } | undefined;
vi.mock("@/lib/prompts/asset-description-from-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prompts/asset-description-from-context")>();
  return {
    buildAssetNotesOnlyPrompt: (ctx: Parameters<typeof actual.buildAssetNotesOnlyPrompt>[0]) => {
      capturedPrompt = actual.buildAssetNotesOnlyPrompt(ctx);
      return capturedPrompt;
    },
  };
});

let ctx: TempDb;
let generateAssetNotesOnlyDraft: typeof import("@/actions/llm/assetDescription").generateAssetNotesOnlyDraft;
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

  ({ generateAssetNotesOnlyDraft } = await import("@/actions/llm/assetDescription"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Asset Notes project");
  otherProjectId = await insertProject(ctx, "A different project");
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

describe("assetNotes.generate — runner proof (LLMW.RUNNER.1b)", () => {
  it("1. the runner's {system, user} equals what generateAssetNotesOnlyDraft passes to its builder, byte-for-byte", async () => {
    const result = await generateAssetNotesOnlyDraft(form({ projectId: String(projectId), assetId: String(assetId) }));
    expect(result).toEqual({ ok: true, draft: "A generated note." });
    expect(capturedPrompt).toBeDefined();

    const runnerResult = await resolveOperationPrompt(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(capturedPrompt!.system);
    expect(runnerResult.prompt.user).toBe(capturedPrompt!.user);
  });

  it("2. refuses an Asset belonging to a different Project, with the same message generateAssetNotesOnlyDraft produces", async () => {
    const actionResult = await generateAssetNotesOnlyDraft(
      form({ projectId: String(otherProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Asset not found." });

    const runnerResult = await resolveOperationPrompt(assetNotesGenerateDescriptor, {
      projectId: otherProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Asset not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateAssetNotesOnlyDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateAssetNotesOnlyDraft(
      form({ projectId: String(nonExistentProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(assetNotesGenerateDescriptor, {
      projectId: nonExistentProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ notes_draft: "A fresh note." }));
    const valid = await runOperation(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(valid).toEqual({ ok: true, values: { notes: "A fresh note." } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ notes_draft: "   " }));
    const empty = await runOperation(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty or invalid draft. Try again.",
    });
  });

  it("3b. the strict parser refuses a response bearing only the other field's key (description_draft), the same message an unreadable one gets", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ description_draft: "Not the requested field." }));
    const wrongKey = await runOperation(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(wrongKey).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });
  });
});
