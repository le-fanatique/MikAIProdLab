import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { styleAdjustDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/styleAdjustDirected";

// The only `runOperation` call in this file is the "kind: list output
// parsing" describe block below — `resolveOperationPrompt` (every other
// test) stops before the model call by contract, same boundary every
// sibling runner test uses. One canned response is enough for the whole
// file, mocked at module scope like every other runner test's own
// `vi.mock("@/lib/llm", ...)`.
import { vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({
      rules: [
        { instruction: "Use painterly brushwork.", pillar: "visual", strength: "Preferred" },
        { instruction: "Never render blue skies.", pillar: "visual", strength: "Avoid" },
        { pillar: "visual", strength: "Preferred" }, // no instruction — dropped by item.validity
        { instruction: "Set on a distant world.", pillar: "not-a-pillar", strength: "not-a-strength" }, // unknown enum -> declared default
        { instruction: "Rule 5" },
        { instruction: "Rule 6" },
        { instruction: "Rule 7" },
        { instruction: "Rule 8" },
        { instruction: "Rule 9 — beyond maxItems" },
        { instruction: "Rule 10 — beyond maxItems" },
      ],
    })
  ),
}));

// ---------------------------------------------------------------------------
// STYLE.LLM.ADJUST.CORE.1 — runner proof for `style.adjustDirected` against a
// real (temp) database, on the model of `assetRetakeDirected.runner.test.ts`
// / `shotLightingDirected.runner.test.ts`: the two things a unit-level render
// test alone cannot prove —
//   1. `resolveOperationPrompt` against a real seeded Project carries a
//      filled Working Draft AND `mode: "none"` coherently, and the
//      director's note is embedded end to end (not just in isolated render
//      forms);
//   2. `runOperation`'s `kind: "list"` parsing: valid rules are kept, an
//      item with no `instruction` is dropped, an unknown enum value falls
//      back to its declared default, and the item count is truncated to
//      `maxItems`.
// No LLM call is exercised for point 1 — `resolveOperationPrompt` stops
// before the model call, same boundary every sibling runner test uses.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;

async function insertDraft(
  projectId: number,
  values: Partial<typeof ctx.schema.projectStyleDrafts.$inferInsert> = {}
): Promise<number> {
  const [row] = await ctx.db
    .insert(ctx.schema.projectStyleDrafts)
    .values({ projectId, ...values })
    .returning({ id: ctx.schema.projectStyleDrafts.id });
  return row.id;
}

async function insertSection(
  draftId: number,
  values: Partial<typeof ctx.schema.projectStyleSections.$inferInsert> & {
    pillar: "world" | "visual";
    heading: string;
    content: string;
  }
): Promise<void> {
  await ctx.db.insert(ctx.schema.projectStyleSections).values({ draftId, ...values });
}

async function insertRule(
  draftId: number,
  values: Partial<typeof ctx.schema.projectStyleRules.$inferInsert> & { instruction: string }
): Promise<void> {
  await ctx.db.insert(ctx.schema.projectStyleRules).values({ draftId, ...values });
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt, runOperation } = await import("@/lib/llmWorkspace/runner"));
});

afterAll(() => ctx.cleanup());

describe("style.adjustDirected — assembly against a real database (no oracle, §ticket)", () => {
  it("a filled Working Draft: the resolved prompt carries the brief, the compiled draft, and the director's note", async () => {
    const projectId = await insertProject(ctx, "Neon Skyline");
    const draftId = await insertDraft(projectId, { directionBrief: "A weathered, hand-painted look." });
    await insertSection(draftId, { pillar: "visual", heading: "Palette", content: "Desaturated earth tones." });
    await insertRule(draftId, { instruction: "Never render clean, unweathered surfaces.", orderIndex: 0 });

    const result = await resolveOperationPrompt(
      styleAdjustDirectedDescriptor,
      { projectId },
      { freeText: "more painted, visible textures, no blue skies" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("Project: Neon Skyline");
    expect(result.prompt.user).toContain("Direction brief: A weathered, hand-painted look.");
    expect(result.prompt.user).toContain("Palette:\nDesaturated earth tones.");
    expect(result.prompt.user).toContain("- Never render clean, unweathered surfaces.");
    expect(result.prompt.user).toContain("Director's note: more painted, visible textures, no blue skies");
  });

  it("a project with no Working Draft yet (mode: \"none\") produces a coherent prompt — not a refusal", async () => {
    const projectId = await insertProject(ctx, "Bare project");

    const result = await resolveOperationPrompt(
      styleAdjustDirectedDescriptor,
      { projectId },
      { freeText: "start with a painterly look" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("Project: Bare project");
    expect(result.prompt.user).toContain("No Working Draft exists yet for this project.");
    expect(result.prompt.user).toContain("Director's note: start with a painterly look");
  });

  it("an empty director's note: the freeText block disappears entirely from both system and user", async () => {
    const projectId = await insertProject(ctx, "No note project");
    await insertDraft(projectId);

    const result = await resolveOperationPrompt(styleAdjustDirectedDescriptor, { projectId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).not.toMatch(/Director's note/);
    expect(result.prompt.system).not.toMatch(/Respond to the director's note/);
  });

  it("refuses on a Project that does not exist, with the declared chain message", async () => {
    const result = await resolveOperationPrompt(styleAdjustDirectedDescriptor, { projectId: 999999 }, {});
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});

describe("style.adjustDirected — kind: \"list\" output parsing", () => {
  let projectId: number;

  beforeAll(async () => {
    projectId = await insertProject(ctx, "List parsing project");
    await insertDraft(projectId);
  });

  it("keeps valid rules, drops an item with no instruction, falls back an unknown enum to its default, and truncates to maxItems", async () => {
    const result = await runOperation(styleAdjustDirectedDescriptor, { projectId }, { freeText: "test" });
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");

    // Item with no instruction dropped: 9 valid raw items -> capped at maxItems: 8.
    expect(result.items.length).toBe(8);

    const first = result.items[0];
    expect(first.instruction).toBe("Use painterly brushwork.");
    expect(first.pillar).toBe("visual");
    expect(first.strength).toBe("Preferred");

    const enumFallbackItem = result.items[2];
    expect(enumFallbackItem.instruction).toBe("Set on a distant world.");
    // Unknown "not-a-pillar" / "not-a-strength" fall back to the declared defaults.
    expect(enumFallbackItem.pillar).toBe("visual");
    expect(enumFallbackItem.strength).toBe("Preferred");

    // Never present: the item with no `instruction` at all.
    expect(result.items.some((i) => i.instruction === undefined)).toBe(false);
  });
});
