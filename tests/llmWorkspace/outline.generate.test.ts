import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `outline.generate`'s
// `PROJECT.IDENTITY` variable equals what `generateOutlineDraft` passes to
// `buildOutlineFromStoryPrompt` today, restricted to the *context* fields
// (`name`, `pitch`, `story`) — `targetSections` is intent (an
// `intent.parameters` entry on this descriptor, see
// `descriptors/outline.ts`), not context, and is asserted separately below,
// not folded into the context-equality comparison.
//
// Same two mocks, same real seeded database, same dynamic-import discipline
// as `story.generate.test.ts` — see that file's header for the full
// rationale, not repeated here.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ outline: "## A section\nBody." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/outline-from-story", () => ({
  buildOutlineFromStoryPrompt: (ctx: unknown) => captureBuilderArg(ctx),
}));

let ctx: TempDb;
let generateOutlineDraft: typeof import("@/actions/llm/outlineGeneration").generateOutlineDraft;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let projectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateOutlineDraft } = await import("@/actions/llm/outlineGeneration"));
  ({ resolveProjectIdentity } = await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Outline project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", story: "A previously generated story." })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("outline.generate descriptor — context equality", () => {
  it("resolving PROJECT.IDENTITY against the same anchor equals the context fields generateOutlineDraft passes to its builder", async () => {
    const result = await generateOutlineDraft(
      form({ projectId: String(projectId), targetSections: "6" })
    );
    expect(result).toEqual({ ok: true, outline: "## A section\nBody." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      name: string;
      pitch: string | null;
      story: string | null;
      targetSections: number | null;
    };

    expect(outlineGenerateDescriptor.context.variables.map((v) => v.id)).toEqual(["PROJECT.IDENTITY"]);

    const resolved = await resolveProjectIdentity(projectId);

    // Context comparison: only the fields the descriptor's variable
    // declares (`name`, `pitch`, `story` — a subset of PROJECT.IDENTITY's
    // full `{name, pitch, story, description}`, matching what
    // `generateOutlineDraft` actually reads).
    expect({ name: resolved.name, pitch: resolved.pitch, story: resolved.story }).toEqual({
      name: actionArg.name,
      pitch: actionArg.pitch,
      story: actionArg.story,
    });

    // Intent comparison, kept separate from context per the ticket's own
    // instruction that `targetSections` "ne vient pas d'une variable et ne
    // doit pas en sortir": the descriptor declares it as an
    // `intent.parameters` entry, not a context variable, and its shape
    // (bounded integer 2-20) matches the value the action actually read.
    expect(outlineGenerateDescriptor.intent.parameters).toEqual([
      {
        id: "targetSections",
        type: "integer",
        label: "Target number of sections",
        min: 2,
        max: 20,
      },
    ]);
    expect(actionArg.targetSections).toBe(6);
  });
});
