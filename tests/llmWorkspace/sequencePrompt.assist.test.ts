import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence } from "../actions/helpers/fixtures";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `sequencePrompt.assist`'s
// three variables (`PROJECT.IDENTITY`, `SEQ.CONTEXT`, `SEQ.CURRENT_PROMPT`)
// equals what `generateSequencePromptDraft` passes to
// `buildSequencePromptFromContextPrompt` today, field by field, restricted
// to the context fields the action actually reads (it does not read
// `project.description` — see the comparison below).
//
// Same two mocks, same real seeded database, same dynamic-import discipline
// as `story.generate.test.ts` — see that file's header for the full
// rationale.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ sequence_prompt: "A generated sequence prompt." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/sequence-prompt-from-context", () => ({
  buildSequencePromptFromContextPrompt: (ctx: unknown) => captureBuilderArg(ctx),
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
  it("resolving the three declared variables equals the context fields generateSequencePromptDraft passes to its builder", async () => {
    const result = await generateSequencePromptDraft(
      form({ projectId: String(projectId), sequenceId: String(sequenceId), mode: "enhance" })
    );
    expect(result).toEqual({ ok: true, draft: "A generated sequence prompt." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      assistMode: string;
      projectName: string;
      projectPitch: string | null;
      projectStory: string | null;
      sequenceTitle: string;
      sequenceSummary: string | null;
      sequenceDescription: string | null;
      sequenceMood: string | null;
      sequenceLocationHint: string | null;
      currentSequencePrompt: string | null;
    };

    expect(sequencePromptAssistDescriptor.context.variables.map((v) => v.id)).toEqual([
      "PROJECT.IDENTITY",
      "SEQ.CONTEXT",
      "SEQ.CURRENT_PROMPT",
    ]);

    const [identity, seqContext, currentPrompt] = await Promise.all([
      resolveProjectIdentity(projectId),
      resolveSeqContext(sequenceId),
      resolveSeqCurrentPrompt(sequenceId),
    ]);

    // PROJECT.IDENTITY: the action reads name/pitch/story, not description.
    expect({ name: identity.name, pitch: identity.pitch, story: identity.story }).toEqual({
      name: actionArg.projectName,
      pitch: actionArg.projectPitch,
      story: actionArg.projectStory,
    });

    // SEQ.CONTEXT: all five fields.
    expect(seqContext).toEqual({
      title: actionArg.sequenceTitle,
      summary: actionArg.sequenceSummary,
      description: actionArg.sequenceDescription,
      mood: actionArg.sequenceMood,
      locationHint: actionArg.sequenceLocationHint,
    });

    // SEQ.CURRENT_PROMPT.
    expect(currentPrompt).toEqual({ sequencePrompt: actionArg.currentSequencePrompt });

    // Intent: mode is carried on the descriptor's `intent.mode`, not on a
    // context variable, and the value the action actually used matches one
    // of the descriptor's declared modes.
    expect(sequencePromptAssistDescriptor.intent.mode?.modes.map((m) => m.id)).toEqual([
      "generate",
      "enhance",
      "rewrite",
      "shorten",
      "expand",
    ]);
    expect(actionArg.assistMode).toBe("enhance");
  });

  it("the four transform modes carry the requiresNonEmpty precondition generateSequencePromptDraft enforces pre-call", async () => {
    const modes = sequencePromptAssistDescriptor.intent.mode?.modes ?? [];
    const byId = new Map(modes.map((m) => [m.id, m]));

    expect(byId.get("generate")?.requiresNonEmpty).toBeUndefined();
    for (const modeId of ["enhance", "rewrite", "shorten", "expand"]) {
      expect(byId.get(modeId)?.requiresNonEmpty).toBe("sequencePrompt");
    }

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
