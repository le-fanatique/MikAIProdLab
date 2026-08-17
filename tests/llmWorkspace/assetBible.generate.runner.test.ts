import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertAsset } from "../actions/helpers/fixtures";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";
import { buildAssetBibleFromContextPrompt } from "@/lib/prompts/asset-bible-from-context";

// ---------------------------------------------------------------------------
// Proof required by the ticket's "Obligations de preuve" for
// `assetBible.generate` — same structure as
// `sequencePrompt.assist.runner.test.ts`, all four usual obligations: prompt
// equality, chain refusal, parsing, preconditions.
//
// The fourth (preconditions) was initially left unwritten: `resolveAssetBibleContext`
// (`src/lib/prompts/assetBibleContext.ts`, deleted at the B3b switch) refused
// with "Add a Description or Notes to this asset before generating an Asset
// Bible draft." only when *both* `description` and `notes` are empty — an
// "at least one of two fields" gate a single-`field: FieldRef` precondition
// entry could not express without two entries that each wrongly refuse on
// their own (a non-empty `notes` with an empty `description` would then be
// refused, contradicting the real action). `OperationDescriptor["preconditions"]`
// (`types.ts`) was widened to `fields: FieldRef[]` plus
// `require: "all" | "any"` to close exactly this gap, and
// `descriptors/assetBible.ts` now declares `fields: ["description",
// "notes"], require: "any"`. Test "4b" below is the case that distinguishes
// `"any"` from `"all"`: exactly one of the two fields set must NOT be
// refused — the case a naive pair of single-field entries would have gotten
// wrong.
//
// Re-pointed at the B3b switch (LLMW.MIGRATE.FLATJSON.1b): `generateAssetBibleDraft`
// no longer calls `buildAssetBibleFromContextPrompt`, so a mocked capture of
// the action's own call would capture nothing. The comparison now calls the
// frozen oracle directly against the same seeded row instead, mirroring
// `sequencePrompt.assist.runner.test.ts`'s own re-pointing at the B3a
// switch. `style` is `{worldSegment: "", visualSegment: "", rulesSegment:
// ""}` in both — no Project Style is activated by this fixture.
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
let generateAssetBibleDraft: typeof import("@/actions/llm/assetBible").generateAssetBibleDraft;
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

  ({ generateAssetBibleDraft } = await import("@/actions/llm/assetBible"));
  ({ runOperation, resolveOperationPrompt } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Asset Bible project");
  otherProjectId = await insertProject(ctx, "A different project");

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

async function expectedPrompt() {
  return buildAssetBibleFromContextPrompt({
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
  });
}

describe("assetBible.generate — runner proof (LLMW.RUNNER.1b)", () => {
  it("1. the runner's {system, user} equals the frozen oracle called directly against the same seeded row, byte-for-byte", async () => {
    const result = await generateAssetBibleDraft(form({ projectId: String(projectId), assetId: String(assetId) }));
    expect(result.ok).toBe(true);

    const expected = await expectedPrompt();

    const runnerResult = await resolveOperationPrompt(assetBibleGenerateDescriptor, { projectId, assetId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok) throw new Error("unreachable");

    expect(runnerResult.prompt.system).toBe(expected.system);
    expect(runnerResult.prompt.user).toBe(expected.user);
  });

  it("2. refuses an Asset belonging to a different Project, with the same message generateAssetBibleDraft produces", async () => {
    const actionResult = await generateAssetBibleDraft(
      form({ projectId: String(otherProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Asset not found." });

    const runnerResult = await resolveOperationPrompt(assetBibleGenerateDescriptor, {
      projectId: otherProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Asset not found." });
  });

  it("2b. refuses a Project that does not exist, with the same message generateAssetBibleDraft produces", async () => {
    const nonExistentProjectId = projectId + 9000;

    const actionResult = await generateAssetBibleDraft(
      form({ projectId: String(nonExistentProjectId), assetId: String(assetId) })
    );
    expect(actionResult).toEqual({ ok: false, error: "Project not found." });

    const runnerResult = await resolveOperationPrompt(assetBibleGenerateDescriptor, {
      projectId: nonExistentProjectId,
      assetId,
    });
    expect(runnerResult).toEqual({ ok: false, error: "Project not found." });
  });

  it("3. parsing: valid, unparsable, and empty responses give the exact output.errors messages", async () => {
    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;

    mockedCallLLMJson.mockResolvedValueOnce(
      JSON.stringify({ visual_identity: "A fresh visual identity.", usage_rules: "", forbidden_variations: "" })
    );
    const valid = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId });
    expect(valid).toEqual({
      ok: true,
      kind: "object",
      values: { visualIdentity: "A fresh visual identity.", usageRules: "", forbiddenVariations: "" },
    });

    mockedCallLLMJson.mockResolvedValueOnce("not json at all {{{");
    const unparsable = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId });
    expect(unparsable).toEqual({
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    });

    mockedCallLLMJson.mockResolvedValueOnce(
      JSON.stringify({ visual_identity: "   ", usage_rules: "", forbidden_variations: "" })
    );
    const empty = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId });
    expect(empty).toEqual({
      ok: false,
      error: "The model returned an empty draft. Try again.",
    });
  });

  it("3b. the runner silently truncates an oversized field to output.fields[].truncateTo, matching the pre-switch parser", async () => {
    const { MAX_ASSET_BIBLE_FIELD_LENGTH } = await import("@/lib/prompts/assetBibleDraft");
    const oversized = "x".repeat(MAX_ASSET_BIBLE_FIELD_LENGTH + 50);

    // The descriptor declares the bound — not the adapter, which is pure
    // translation after this correction (moved out of
    // `src/actions/llm/assetBible.ts`, onto `output.fields[].truncateTo`).
    // `output.kind` is always `"object"` for this descriptor
    // (LLMW.OUTPUT.LIST.1, B7a).
    expect(assetBibleGenerateDescriptor.output.kind).toBe("object");
    const objectOutput = assetBibleGenerateDescriptor.output;
    if (objectOutput.kind !== "object") throw new Error("unreachable");
    // LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1): `output.fields` is a union
    // discriminated on `type`, and `truncateTo` belongs to the `"string"`
    // variant alone. Narrowed rather than relaxed — a field that ever became
    // numeric would map to `null` here and fail this assertion, which is the
    // behaviour wanted: this descriptor's three fields are text.
    expect(objectOutput.fields.map((f) => (f.type === "string" ? f.truncateTo : null))).toEqual([
      MAX_ASSET_BIBLE_FIELD_LENGTH,
      MAX_ASSET_BIBLE_FIELD_LENGTH,
      MAX_ASSET_BIBLE_FIELD_LENGTH,
    ]);

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockResolvedValueOnce(
      JSON.stringify({ visual_identity: oversized, usage_rules: "", forbidden_variations: "" })
    );

    const runnerResult = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId });
    expect(runnerResult.ok).toBe(true);
    if (!runnerResult.ok || runnerResult.kind !== "object") throw new Error("unreachable");
    expect(runnerResult.values.visualIdentity).toHaveLength(MAX_ASSET_BIBLE_FIELD_LENGTH);
    expect(runnerResult.values.visualIdentity).toBe(oversized.slice(0, MAX_ASSET_BIBLE_FIELD_LENGTH));

    // The adapter passes the runner's already-truncated value through
    // unchanged — no `.slice()` of its own left to prove.
    mockedCallLLMJson.mockResolvedValueOnce(
      JSON.stringify({ visual_identity: oversized, usage_rules: "", forbidden_variations: "" })
    );
    const actionResult = await generateAssetBibleDraft(form({ projectId: String(projectId), assetId: String(assetId) }));
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) throw new Error("unreachable");
    expect(actionResult.draft.visualIdentity).toBe(oversized.slice(0, MAX_ASSET_BIBLE_FIELD_LENGTH));
  });

  it("4. both Description and Notes empty is refused before the LLM call, with the exact precondition message", async () => {
    const emptyAssetId = await insertAsset(ctx, projectId, {
      name: "Blank asset",
      type: "prop",
      description: null,
      notes: null,
    });

    const actionResult = await generateAssetBibleDraft(
      form({ projectId: String(projectId), assetId: String(emptyAssetId) })
    );
    expect(actionResult).toEqual({
      ok: false,
      error: "Add a Description or Notes to this asset before generating an Asset Bible draft.",
    });

    const mockedCallLLMJson = callLLMJson as unknown as ReturnType<typeof vi.fn>;
    mockedCallLLMJson.mockClear();

    const runnerResult = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId: emptyAssetId });
    expect(runnerResult).toEqual({
      ok: false,
      error: "Add a Description or Notes to this asset before generating an Asset Bible draft.",
    });
    // Refused before step 6 — the model is never called.
    expect(mockedCallLLMJson).not.toHaveBeenCalled();
  });

  it("4b. exactly one of Description or Notes set is NOT refused — the case that distinguishes require: 'any' from 'all'", async () => {
    const descriptionOnlyId = await insertAsset(ctx, projectId, {
      name: "Description only asset",
      type: "prop",
      description: "A lone description.",
      notes: null,
    });
    const notesOnlyId = await insertAsset(ctx, projectId, {
      name: "Notes only asset",
      type: "prop",
      description: null,
      notes: "A lone note.",
    });

    const descriptionOnlyAction = await generateAssetBibleDraft(
      form({ projectId: String(projectId), assetId: String(descriptionOnlyId) })
    );
    expect(descriptionOnlyAction.ok).toBe(true);
    const descriptionOnlyRunner = await resolveOperationPrompt(assetBibleGenerateDescriptor, {
      projectId,
      assetId: descriptionOnlyId,
    });
    expect(descriptionOnlyRunner.ok).toBe(true);

    const notesOnlyAction = await generateAssetBibleDraft(
      form({ projectId: String(projectId), assetId: String(notesOnlyId) })
    );
    expect(notesOnlyAction.ok).toBe(true);
    const notesOnlyRunner = await resolveOperationPrompt(assetBibleGenerateDescriptor, {
      projectId,
      assetId: notesOnlyId,
    });
    expect(notesOnlyRunner.ok).toBe(true);
  });
});
