import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { captureRedirect, setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "../actions/helpers/fixtures";
import { narrativePromptComposeDescriptor } from "@/lib/llmWorkspace/descriptors/narrativePrompt";

/**
 * LLMW.NARRATIVE.1 (B12b-2) — the bench's Approve path for
 * `narrativePrompt.compose`, on the model of `assetRetakeDirected.surface.test.ts`
 * (the ticket's own named precedent): `runOperation` produces the text
 * draft, `buildUpdateShotNarrativePromptHiddenFields` builds exactly the
 * hidden-field shape `BenchRunPanel`'s Approve form posts
 * (`src/components/llmWorkspace/BenchRunPanel.tsx`), and
 * `updateShotNarrativePrompt` is the real commit action, run end to end
 * against a real (temp) database — no adapter exists for this operation
 * (it lives at the bench only), so this file calls `runOperation` directly
 * rather than a `generateXDraft` action, on the model B12b-1's own
 * `outputText.runner.test.ts` already established for a `kind: "text"`
 * descriptor with no such adapter.
 *
 * The assertion that gives the whole chantier its meaning (§5.3 of
 * docs/LLM_WORKSPACE_PRODUCT_VISION.md): approving writes
 * `shots.narrative_prompt` alone and leaves `shots.shot_prompt` — the other
 * jar — untouched.
 */

vi.mock("@/lib/llm/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/ollama")>();
  return {
    ...actual,
    callOllama: vi.fn(),
    callOllamaChat: vi.fn(async () => "A narratively vivid prompt for this shot."),
  };
});
vi.mock("@/lib/llm/openaiCompatible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/openaiCompatible")>();
  return {
    ...actual,
    callOpenAICompatibleJson: vi.fn(),
    callOpenAICompatibleChat: vi.fn(),
  };
});

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let buildUpdateShotNarrativePromptHiddenFields: typeof import("@/lib/llmWorkspace/actions/proposalCommit").buildUpdateShotNarrativePromptHiddenFields;
let updateShotNarrativePrompt: typeof import("@/actions/shots").updateShotNarrativePrompt;

let projectId: number;
let sequenceId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ buildUpdateShotNarrativePromptHiddenFields } = await import("@/lib/llmWorkspace/actions/proposalCommit"));
  ({ updateShotNarrativePrompt } = await import("@/actions/shots"));

  projectId = await insertProject(ctx, "Narrative prompt surface project");
  sequenceId = await insertSequence(ctx, projectId, { title: "Opening sequence" });
});

afterAll(() => ctx.cleanup());

describe("narrativePrompt.compose — bench run, then Approve, against a real database", () => {
  it("runOperation returns the model's prose as a text draft", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Hero enters",
      shotPrompt: "Human-written shot prompt",
    });

    const draft = await runOperation(narrativePromptComposeDescriptor, { projectId, sequenceId, shotId });
    expect(draft).toEqual({ ok: true, kind: "text", text: "A narratively vivid prompt for this shot." });
  });

  it("approving writes narrativePrompt alone and leaves shotPrompt — the other jar — untouched", async () => {
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Hero enters",
      shotPrompt: "Human-written shot prompt",
      narrativePrompt: "Old narrative prompt",
    });
    const before = await readShot(ctx, shotId);

    const draft = await runOperation(narrativePromptComposeDescriptor, { projectId, sequenceId, shotId });
    expect(draft.ok).toBe(true);
    if (!draft.ok || draft.kind !== "text") throw new Error("unreachable");

    // Same call shape `BenchRunPanel`'s Approve action uses for this
    // descriptor's `redirectOnly` commit (`updateShotNarrativePrompt`).
    const hiddenFields = buildUpdateShotNarrativePromptHiddenFields({
      projectId,
      sequenceId,
      shotId,
      narrativePrompt: draft.text,
      returnTo: "/settings/llm-workflows/narrativePrompt.compose",
    });

    const target = await captureRedirect(() => updateShotNarrativePrompt(form(hiddenFields)));
    expect(target).toContain("narrativePromptSaved=1");

    const after = await readShot(ctx, shotId);
    expect(after.narrativePrompt).toBe("A narratively vivid prompt for this shot.");
    // The assertion that gives the whole chantier its meaning: the other
    // jar is untouched.
    expect(after.shotPrompt).toBe(before.shotPrompt);
    expect(after.shotPrompt).toBe("Human-written shot prompt");
  });
});
