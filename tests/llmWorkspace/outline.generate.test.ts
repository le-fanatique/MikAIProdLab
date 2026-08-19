import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, readProject } from "../actions/helpers/fixtures";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";

// ---------------------------------------------------------------------------
// Proof required by §11.2: the context resolved by `outline.generate`'s
// `PROJECT.IDENTITY` variable equals the context fields the frozen oracle
// (`buildOutlineFromStoryPrompt`) expects for the same row, restricted to
// the *context* fields (`name`, `pitch`, `story`) — `targetSections` is
// intent (an `intent.parameters` entry on this descriptor, see
// `descriptors/outline.ts`), not context, and is asserted separately below,
// not folded into the context-equality comparison.
//
// Re-pointed at the B3a switch (LLMW.MIGRATE.FLATJSON.1a): `generateOutlineDraft`
// no longer calls `buildOutlineFromStoryPrompt`, so a mocked capture of the
// action's own call would capture nothing. The comparison now reads the same
// seeded row directly instead.
//
// One mock, same real seeded database, same dynamic-import discipline as
// `story.generate.test.ts` — see that file's header for the full rationale,
// not repeated here.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ outline: "## A section\nBody." })),
}));

let ctx: TempDb;
let runWorkspaceOperation: typeof import("@/actions/llmWorkspace/runOperationAction").runWorkspaceOperation;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runWorkspaceOperation } = await import("@/actions/llmWorkspace/runOperationAction"));
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
  it("resolving PROJECT.IDENTITY against the same anchor equals the row generateOutlineDraft reads (name, pitch, story)", async () => {
    const result = await runWorkspaceOperation({
      descriptorId: "outline.generate",
      ids: { projectId },
      intent: { parameters: { targetSections: 6 } },
    });
    // LLMW.UNIFY.PANEL.2 — the shape is the generic action's now, not the
    // deleted adapter's. The VALUE is unchanged.
    expect(result).toEqual({ ok: true, kind: "object", values: { outline: "## A section\nBody." } });

    expect(outlineGenerateDescriptor.context.variables.map((v) => v.id)).toEqual(["PROJECT.IDENTITY"]);

    const [resolved, row] = await Promise.all([resolveProjectIdentity(projectId), readProject(ctx, projectId)]);

    // Context comparison: only the fields the descriptor's variable
    // declares (`name`, `pitch`, `story` — a subset of PROJECT.IDENTITY's
    // full `{name, pitch, story, description}`, matching what
    // `generateOutlineDraft`'s builder actually reads).
    expect({ name: resolved.name, pitch: resolved.pitch, story: resolved.story }).toEqual({
      name: row.name,
      pitch: row.pitch,
      story: row.story,
    });

    // Intent comparison, kept separate from context per the ticket's own
    // instruction that `targetSections` "ne vient pas d'une variable et ne
    // doit pas en sortir": the descriptor declares it as an
    // `intent.parameters` entry, not a context variable — its shape (bounded
    // integer 2-20) is asserted here; the value 6 sent above (`"6"` in the
    // form) is exercised end-to-end by `outline.generate.runner.test.ts`'s
    // own proof (test 1), not re-captured here since the action no longer
    // exposes it via a mocked builder call.
    expect(outlineGenerateDescriptor.intent.parameters).toEqual([
      {
        id: "targetSections",
        type: "integer",
        label: "Target number of sections",
        min: 2,
        max: 20,
      },
    ]);
  });
});
