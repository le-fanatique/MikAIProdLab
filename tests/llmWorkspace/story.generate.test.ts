import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";

// ---------------------------------------------------------------------------
// Proof required by §11.2 / the ticket's "Obligations de preuve": the
// context resolved by the `story.generate` descriptor's `PROJECT.IDENTITY`
// variable equals what `generateStory` actually passes to
// `buildStoryFromPitchPrompt` today. Same data, declared instead of coded.
//
// Two mocks only, per the ticket:
//   - `@/lib/llm`, so `callLLMJson` returns a valid JSON string instead of
//     calling the network;
//   - `@/lib/prompts/story-from-pitch`, to intercept the builder's single
//     argument.
// The database is real (`setupTempDb()`), never mocked. `app_settings` is
// seeded with a minimal `llm_ollama_model` row, per the 2026-08-13
// amendment: `getLLMConfig()` returns `null` on a genuinely empty database
// (`PROVIDER_DEFAULTS.ollama.model` is `""`), so a real row is required for
// `generateStory` to reach its builder at all. Seeding a real table is not
// mocking the database.
//
// Every import that reaches `@/db` (directly or via `@/actions/llm/story` /
// `@/lib/llmWorkspace/variables/registry`) is dynamic, inside `beforeAll`,
// strictly after `setupTempDb()` — the harness's own contract, and the rule
// the earlier incident violated by accident.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () => JSON.stringify({ story: "A generated story." })),
}));

const captureBuilderArg = vi.fn((ctx: unknown) => ({ system: "s", user: "u", __ctx: ctx }));
vi.mock("@/lib/prompts/story-from-pitch", () => ({
  buildStoryFromPitchPrompt: (ctx: unknown) => captureBuilderArg(ctx),
}));

let ctx: TempDb;
let generateStory: typeof import("@/actions/llm/story").generateStory;
let resolveProjectIdentity: typeof import("@/lib/llmWorkspace/variables/registry").resolveProjectIdentity;
let projectId: number;

beforeAll(async () => {
  ctx = await setupTempDb();

  // Minimal non-empty model row so getLLMConfig() does not return null —
  // authorized by the 2026-08-13 amendment. Seeding a real table, not a
  // mock.
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ generateStory } = await import("@/actions/llm/story"));
  ({ resolveProjectIdentity } = await import("@/lib/llmWorkspace/variables/registry"));

  projectId = await insertProject(ctx, "Story project");
  const { eq } = await import("drizzle-orm");
  await ctx.db
    .update(ctx.schema.projects)
    .set({ pitch: "A compelling pitch.", description: "Extra notes for the writer." })
    .where(eq(ctx.schema.projects.id, projectId));
});

afterAll(() => ctx.cleanup());

describe("story.generate descriptor — context equality", () => {
  it("resolving PROJECT.IDENTITY against the same anchor equals what generateStory passes to its builder", async () => {
    const result = await generateStory(projectId);
    expect(result).toEqual({ ok: true, story: "A generated story." });

    expect(captureBuilderArg).toHaveBeenCalledTimes(1);
    const actionArg = captureBuilderArg.mock.calls[0][0] as {
      name: string;
      pitch: string | null;
      description: string | null;
    };

    // The descriptor declares exactly the one variable this operation uses.
    expect(storyGenerateDescriptor.context.variables.map((v) => v.id)).toEqual(["PROJECT.IDENTITY"]);

    const resolved = await resolveProjectIdentity(projectId);

    // `generateStory` passes {name, pitch, description} — `story` is not
    // part of its builder argument, so the comparison is scoped to the
    // fields the action actually sends, per the ticket's "trois faits
    // vérifiés" describing generateStory's argument shape.
    expect({ name: resolved.name, pitch: resolved.pitch, description: resolved.description }).toEqual(
      actionArg
    );
  });
});
