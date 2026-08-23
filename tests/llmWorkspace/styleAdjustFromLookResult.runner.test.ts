import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import {
  insertComfyWorkflow,
  insertGenerationJob,
  insertLookTest,
  insertLookTestResult,
  insertProject,
} from "../actions/helpers/fixtures";
import { styleAdjustFromLookResultDescriptor } from "@/lib/llmWorkspace/descriptors/styleAdjustFromLookResult";

// The only `runOperation` call in this file is the "kind: list output
// parsing" describe block below — every other test stops at
// `resolveOperationPrompt`, before the model call, same boundary every
// sibling runner test uses.
import { vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({
      rules: [
        { instruction: "Use painterly brushwork instead.", pillar: "visual", strength: "Preferred" },
        { instruction: "Never render blue skies.", pillar: "visual", strength: "Avoid" },
      ],
    })
  ),
}));

// ---------------------------------------------------------------------------
// STYLE.LLM.LOOKFEEDBACK.CORE.1 — runner proof for
// `style.adjustFromLookResult`, on the model of
// `styleAdjustDirected.runner.test.ts` (its frère): assembly against a real
// (temp) database, and `runOperation`'s `kind: "list"` parsing.
//
// The ownership-chain refusal below is the single most important test of
// this ticket (§"Preuve exigée"): a `lookResultId` belonging to another
// project must be refused, not silently accepted.
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

/** Seeds a Project with one workflow, one generation job, one Look Test and one Look Test result — the minimal chain `lookResult` anchors on. */
async function seedLookResult(
  projectName: string,
  resultValues: Partial<typeof ctx.schema.lookTestResults.$inferInsert> = {},
  testValues: Partial<typeof ctx.schema.lookTests.$inferInsert> = {}
): Promise<{ projectId: number; lookResultId: number }> {
  const projectId = await insertProject(ctx, projectName);
  const workflowId = await insertComfyWorkflow(ctx, { kind: "image" });
  const generationJobId = await insertGenerationJob(ctx, workflowId);
  const lookTestId = await insertLookTest(ctx, projectId, workflowId, {
    subject: "Hero character, three-quarter view",
    action: "Standing still, looking off-frame",
    styleCompiledText: "World:\n- A rain-soaked megacity.\n\nVisual:\n- Photorealistic rendering.",
    ...testValues,
  });
  const lookResultId = await insertLookTestResult(ctx, lookTestId, projectId, generationJobId, resultValues);
  return { projectId, lookResultId };
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt, runOperation } = await import("@/lib/llmWorkspace/runner"));
});

afterAll(() => ctx.cleanup());

describe("style.adjustFromLookResult — ownership chain", () => {
  it("REFUSES a lookResultId belonging to another project — the test that matters most for this ticket", async () => {
    const { lookResultId } = await seedLookResult("Owner project");
    const otherProjectId = await insertProject(ctx, "A different project");

    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId: otherProjectId, lookResultId },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Look Test result not found." });
  });

  it("accepts a lookResultId that genuinely belongs to the given project", async () => {
    const { projectId, lookResultId } = await seedLookResult("Matching project");
    await insertDraft(projectId);

    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId, lookResultId },
      {}
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a lookResultId that does not exist at all, with the declared chain message", async () => {
    const projectId = await insertProject(ctx, "Project with no such result");

    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId, lookResultId: 999999 },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Look Test result not found." });
  });

  it("refuses on a Project that does not exist, with the declared chain message", async () => {
    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId: 999999, lookResultId: 1 },
      {}
    );
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});

describe("style.adjustFromLookResult — assembly against a real database", () => {
  it("a filled Working Draft and a real result: the resolved prompt carries the brief, the compiled draft, the result and the director's note", async () => {
    const { projectId, lookResultId } = await seedLookResult(
      "Neon Skyline",
      { status: "rejected", notes: "Too photoreal, want more painted texture." }
    );
    const draftId = await insertDraft(projectId, { directionBrief: "A weathered, hand-painted look." });
    await ctx.db.insert(ctx.schema.projectStyleRules).values({
      draftId,
      pillar: "visual",
      instruction: "Never render clean, unweathered surfaces.",
      orderIndex: 0,
    });

    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId, lookResultId },
      { freeText: "more painted, visible textures, no blue skies" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("Project: Neon Skyline");
    expect(result.prompt.user).toContain("Direction brief: A weathered, hand-painted look.");
    expect(result.prompt.user).toContain("- Never render clean, unweathered surfaces.");
    expect(result.prompt.user).toContain("Result status: rejected");
    expect(result.prompt.user).toContain("Director's notes on this result: Too photoreal, want more painted texture.");
    expect(result.prompt.user).toContain("Director's note: more painted, visible textures, no blue skies");
  });

  it("a project with no Working Draft yet (mode: \"none\") still produces a coherent prompt — not a refusal", async () => {
    const { projectId, lookResultId } = await seedLookResult("Bare project");

    const result = await resolveOperationPrompt(
      styleAdjustFromLookResultDescriptor,
      { projectId, lookResultId },
      { freeText: "start with a painterly look" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.prompt.user).toContain("No Working Draft exists yet for this project.");
  });
});

describe("style.adjustFromLookResult — kind: \"list\" output parsing", () => {
  it("parses the model's proposed rules", async () => {
    const { projectId, lookResultId } = await seedLookResult("List parsing project");
    await insertDraft(projectId);

    const result = await runOperation(
      styleAdjustFromLookResultDescriptor,
      { projectId, lookResultId },
      { freeText: "test" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") throw new Error("unreachable");

    expect(result.items.length).toBe(2);
    expect(result.items[0].instruction).toBe("Use painterly brushwork instead.");
    expect(result.items[1].strength).toBe("Avoid");
  });
});
