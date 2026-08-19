import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetDescriptionBatchDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescriptionBatch";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `assetDescription.batch` — the four usual obligations plus the ticket's
// fifth, batch-specific one.
//
// `anchor.kind === "entitySet"` (§4.1 correction 3) exists because
// `generateBatchAssetDescriptionDrafts` anchors on a bounded set of Assets,
// not on one. The runner (`src/lib/llmWorkspace/runner.ts`) never reads
// `descriptor.anchor.kind` at all — every step dispatches on
// `descriptor.anchor.entity` alone, and `AnchorIds` already carries a single
// `assetId`. This means `resolveOperationPrompt` / `runOperation` already
// reproduce *one item* of the batch's own per-Asset loop without any runner
// change: the real action calls `fetchAssetContextInput` once per Asset in
// `assetIds`, exactly the shape `resolveOperationPrompt(descriptor, {
// projectId, assetId })` already resolves for a plain entity anchor. No
// runner code names this operation or its `entitySet` kind — see
// `.agents/executor_report.md` for the full finding.
//
// What the runner genuinely cannot express — and does not attempt to here —
// is the *batch itself*: refusing more than `BATCH_LIMIT` assetIds and
// applying partially when one item fails. Both are behaviours of
// `generateBatchAssetDescriptionDrafts`'s own loop, with no runner
// equivalent, so obligation 5 is proven against the real action directly,
// the same way `tests/llmWorkspace/assetDescription.batch.test.ts` already
// does for the descriptor's `maxSize`.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b):
// `generateBatchAssetDescriptionDrafts` no longer calls
// `buildAssetDescriptionFromContextPrompt`, so a mocked capture of the
// action's own per-item call would capture nothing. Test 1 now calls the
// frozen oracle directly against the same seeded rows instead, once per
// Asset — no Sequences, Shots, or reference images are inserted by this
// fixture, and no Project Style is active, so those inputs are `[]` /
// `{worldSegment: "", rulesSegment: ""}` for both Assets.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({ description_draft: "A generated description.", notes_draft: "A generated note." })
  ),
}));

let ctx: TempDb;
let generateBatchAssetDescriptionDrafts: typeof import("@/actions/llm/assetDescription").generateBatchAssetDescriptionDrafts;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;
let otherProjectId: number;
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
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Batch Asset Description project");
  otherProjectId = await insertProject(ctx, "A different project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story.", outline: "An outline." })
    .where(eq(ctx.schema.projects.id, projectId));

  assetIdA = await insertAsset(ctx, projectId, { name: "Asset A", type: "character", description: "A description." });
  assetIdB = await insertAsset(ctx, projectId, { name: "Asset B", type: "prop", notes: "Some notes." });
});

afterAll(() => ctx.cleanup());

describe("assetDescription.batch — runner proof (LLMW.RUNNER.1b)", () => {
  it("1. the runner's {system, user}, resolved per item on the plain asset anchor, equals the frozen oracle called directly for that same item", async () => {
    const result = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(projectId), assetIds: JSON.stringify([assetIdA, assetIdB]) })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.results).toHaveLength(2);
    expect(result.errors).toEqual([]);

    const expectedA = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the description and notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has a description or notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>", "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`, user: `Project: Batch Asset Description project
Pitch: A compelling pitch.
Story: A previously generated story.
Outline: An outline.

Asset: Asset A
Type: character
Current description: A description.

Write or enrich the description and notes for "Asset A".` };
    const expectedB = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the description and notes for a specific asset.

Rules:
- Use only the provided context. Do not invent story facts not present in the input.
- description_draft: visual and production-oriented. What the asset looks like, its physical traits, style, materials. Suitable for use as an AI image generation prompt. Max 3 concise sentences. Write in English.
- notes_draft: narrative role, usage context across sequences and shots, design constraints, casting intent. Max 5 concise sentences. Write in English.
- If the asset already has a description or notes, improve and complete them — do not discard useful existing content.
- If context is limited, produce a cautious but useful draft based on the asset type and project tone.
- Do not mention missing information unless it is useful as a design note.
Always respond with a valid JSON object matching exactly this schema:
{ "description_draft": "<visual and production description>", "notes_draft": "<narrative role, usage context, design constraints>" }
No markdown. No explanation. Only the JSON object.`, user: `Project: Batch Asset Description project
Pitch: A compelling pitch.
Story: A previously generated story.
Outline: An outline.

Asset: Asset B
Type: prop
Current description: (none)
Current notes: Some notes.

Write or enrich the description and notes for "Asset B".` };

    const runnerA = await resolveOperationPrompt(assetDescriptionBatchDescriptor, { projectId, assetId: assetIdA });
    const runnerB = await resolveOperationPrompt(assetDescriptionBatchDescriptor, { projectId, assetId: assetIdB });
    expect(runnerA.ok).toBe(true);
    expect(runnerB.ok).toBe(true);
    if (!runnerA.ok || !runnerB.ok) throw new Error("unreachable");

    expect(runnerA.prompt.system).toBe(expectedA.system);
    expect(runnerA.prompt.user).toBe(expectedA.user);
    expect(runnerB.prompt.system).toBe(expectedB.system);
    expect(runnerB.prompt.user).toBe(expectedB.user);
  });

  it("2. an Asset belonging to a different Project is refused per item with the same message generateBatchAssetDescriptionDrafts collects", async () => {
    const actionResult = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(otherProjectId), assetIds: JSON.stringify([assetIdA]) })
    );
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) throw new Error("unreachable");
    expect(actionResult.results).toEqual([]);
    expect(actionResult.errors).toEqual([{ assetId: assetIdA, error: "Asset not found." }]);

    const runnerResult = await resolveOperationPrompt(assetDescriptionBatchDescriptor, {
      projectId: otherProjectId,
      assetId: assetIdA,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Asset not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateBatchAssetDescriptionDrafts produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateBatchAssetDescriptionDrafts(
      form({ projectId: String(nonExistentProjectId), assetIds: JSON.stringify([assetIdA]) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(assetDescriptionBatchDescriptor, {
      projectId: nonExistentProjectId,
      assetId: assetIdA,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(
      JSON.stringify({ description_draft: "A fresh description.", notes_draft: "" })
    );
    const valid = await runOperation(assetDescriptionBatchDescriptor, { projectId, assetId: assetIdA });
    expect(valid).toEqual({ ok: true, kind: "object", values: { description: "A fresh description.", notes: "" } });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(assetDescriptionBatchDescriptor, { projectId, assetId: assetIdA });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(JSON.stringify({ description_draft: "   ", notes_draft: "   " }));
    const empty = await runOperation(assetDescriptionBatchDescriptor, { projectId, assetId: assetIdA });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty draft. Try again.",
    });
  });

  it("5. refuses one item over the real BATCH_LIMIT, and applies partially when one item in an otherwise valid batch is invalid", async () => {
    // Same technique as `assetDescription.batch.test.ts`: the real limit is
    // read back out of the action's own refusal message, not copied by
    // hand — `BATCH_LIMIT` is not exported by
    // `src/actions/llm/assetDescription.ts`.
    const overLimitIds = Array.from(
      {
        length:
          assetDescriptionBatchDescriptor.anchor.kind === "entitySet"
            ? assetDescriptionBatchDescriptor.anchor.maxSize + 1
            : 0,
      },
      (_, i) => 9000 + i
    );
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

    // Partial application: one non-existent assetId mixed with two valid
    // ones, all within the limit — the valid items still commit, the
    // invalid one is reported in `errors`, and `ok` stays `true` (the
    // contract B0 found and left unfixed, §11.2's "outcome, and what B4
    // inherits", point 1).
    const nonExistentAssetId = assetIdA + assetIdB + 9000;
    const mixed = await generateBatchAssetDescriptionDrafts(
      form({
        projectId: String(projectId),
        assetIds: JSON.stringify([assetIdA, nonExistentAssetId, assetIdB]),
      })
    );
    expect(mixed.ok).toBe(true);
    if (!mixed.ok) throw new Error("unreachable");
    expect(mixed.results.map((r) => r.assetId).sort()).toEqual([assetIdA, assetIdB].sort());
    expect(mixed.errors).toEqual([{ assetId: nonExistentAssetId, error: "Asset not found." }]);
  });
});
