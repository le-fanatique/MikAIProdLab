import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetNotesGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetNotes";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `assetNotes.generate` — mirrors `assetDescription.generate.runner.test.ts`
// exactly one field over (Notes instead of Description). No preconditions on
// this descriptor either, same rationale as that file's header.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateAssetNotesOnlyDraft` no longer calls `buildAssetNotesOnlyPrompt`,
// so a mocked capture of the action's own call would capture nothing. The
// comparison now calls the frozen oracle directly against the same seeded
// rows instead, mirroring `assetDescription.generate.runner.test.ts`'s own
// re-pointing.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ notes_draft: "A generated note." })),
}));

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
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte", async () => {
    const result = await generateAssetNotesOnlyDraft(form({ projectId: String(projectId), assetId: String(assetId) }));
    expect(result).toEqual({ ok: true, draft: "A generated note." });

    const expected = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich ONLY the notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
- Do not write a visual/production description — that belongs to Description, which is not requested here.
Always respond with a valid JSON object matching exactly this schema:
{ "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`, user: `Project: Asset Notes project
Pitch: A compelling pitch.
Story: A previously generated story.
Outline: An outline.

Asset: Sidekick Drone
Type: prop
Current description: A hovering support drone.
Current notes: Assists the protagonist in Act 1.

Write or enrich only the notes for "Sidekick Drone".` };

    const runnerResult = await resolveOperationPrompt(assetNotesGenerateDescriptor, { projectId, assetId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
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
    expect(valid).toEqual({ ok: true, kind: "object", values: { notes: "A fresh note." } });

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
