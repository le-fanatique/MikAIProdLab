import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, readProject, readSequence } from "../actions/helpers/fixtures";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `sequencePrompt.assist`'s
// three variables (`PROJECT.IDENTITY`, `SEQ.CONTEXT`, `SEQ.CURRENT_PROMPT`)
// equals the context fields the frozen oracle
// (`buildSequencePromptFromContextPrompt`) expects for the same rows, field
// by field, restricted to the context fields the operation actually reads
// (it does not read `project.description` — see the comparison below).
//
// Re-pointed at the B3a switch (LLMW.MIGRATE.FLATJSON.1a): `generateSequencePromptDraft`
// no longer calls `buildSequencePromptFromContextPrompt`, so a mocked
// capture of the action's own call would capture nothing. The comparison
// now reads the same seeded rows directly instead.
//
// One mock, same real seeded database, same dynamic-import discipline as
// `story.generate.test.ts` — see that file's header for the full rationale.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ sequence_prompt: "A generated sequence prompt." })),
}));

let ctx: TempDb;
let generateSequencePromptDraft: typeof import("@/actions/llm/sequencePrompt").generateSequencePromptDraft;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let resolveSeqContext: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqContext;
let resolveSeqCurrentPrompt: typeof import("@/lib/llmWorkspace/variables/registry").resolveSeqCurrentPrompt;
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

  ({ generateSequencePromptDraft } = await import("@/actions/llm/sequencePrompt"));
  ({ resolveProjectIdentity, resolveSeqContext, resolveSeqCurrentPrompt } = await import(
    "@/lib/llmWorkspace/variables/registry"
  ));

  projectId = await insertProject(ctx, "Sequence project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));

  sequenceId = await insertSequence(ctx, projectId, {
    title: "Opening sequence",
    summary: "A short summary.",
    description: "A longer description.",
    mood: "Tense",
    locationHint: "Rooftop, dusk",
    sequencePrompt: "An existing sequence prompt.",
  });
});

afterAll(() => ctx.cleanup());

describe("sequencePrompt.assist descriptor — context equality", () => {
  it("resolving the three declared variables equals the rows generateSequencePromptDraft's builder reads", async () => {
    const result = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId), mode: "enhance" })
    );
    expect(result).toEqual({ ok: true, draft: "A generated sequence prompt." });

    expect(sequencePromptAssistDescriptor.context.variables.map((v) => v.id)).toEqual([
      "PROJECT.IDENTITY",
      "SEQ.CONTEXT",
      "SEQ.CURRENT_PROMPT",
    ]);

    const [identity, seqContext, currentPrompt, project, sequence] = await Promise.all([
      resolveProjectIdentity(projectId),
      resolveSeqContext(sequenceId),
      resolveSeqCurrentPrompt(sequenceId),
      readProject(ctx, projectId),
      readSequence(ctx, sequenceId),
    ]);

    // PROJECT.IDENTITY: the builder reads name/pitch/story, not description.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story }).toEqual({
      name: project.name,
      pitch: project.pitch,
      story: project.story,
    });

    // SEQ.CONTEXT: all five fields.
    expect(seqContext).toEqual({
      title: sequence.title,
      summary: sequence.summary,
      description: sequence.description,
      mood: sequence.mood,
      locationHint: sequence.locationHint,
    });

    // SEQ.CURRENT_PROMPT.
    expect(currentPrompt).toEqual({ sequencePrompt: sequence.sequencePrompt });

    // Intent: mode is carried on the descriptor's `intent.mode`, not on a
    // context variable — the value "enhance" sent above is exercised
    // end-to-end by `sequencePrompt.assist.runner.test.ts`'s own proof (test
    // 1), not re-captured here since the action no longer exposes it via a
    // mocked builder call.
    expect(sequencePromptAssistDescriptor.intent.mode?.modes.map((m) => m.id)).toEqual([
      "generate",
      "enhance",
      "rewrite",
      "shorten",
      "expand",
    ]);
  });

  it("the four transform modes carry the preconditions entry generateSequencePromptDraft enforces pre-call", async () => {
    // Migrated off `intent.mode.modes[].requiresNonEmpty` (§4.1 correction
    // 6): the precondition is now a `preconditions` entry, restricted to
    // the four transform modes via `modes`.
    expect(sequencePromptAssistDescriptor.preconditions).toEqual([
      {
        fields: ["sequencePrompt"],
        require: "all",
        modes: ["enhance", "rewrite", "shorten", "expand"],
        message: "A Sequence Prompt is required for this assist mode.",
      },
    ]);

    // Cross-check against the action's real guard: a transform mode against
    // an empty sequencePrompt is refused before the LLM call.
    const emptySequenceId = await insertSequence(ctx, projectId, { sequencePrompt: null });
    const refused = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(emptySequenceId), mode: "enhance" })
    );
    expect(refused).toEqual({
      ok: false,
      error: "A Sequence Prompt is required for this assist mode.",
    });
  });
});
