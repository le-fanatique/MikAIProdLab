import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { lookTestSubjectActionFromStoryDescriptor } from "@/lib/llmWorkspace/descriptors/lookTestSubjectActionFromStory";

// ---------------------------------------------------------------------------
// LOOK.FROMSTORY.LLM.1 — runner proof for `lookTest.subjectActionFromStory`:
// the story-or-outline precondition against a real (temp) database, and
// `runOperation`'s `kind: "object"` parsing (a valid pair, a missing field,
// and truncation of an over-length field) — on the model of
// `styleAdjustFromLookResult.runner.test.ts` / `assetsFromProject.runner.test.ts`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let resolveOperationPrompt: typeof import("@/lib/llmWorkspace/runner").resolveOperationPrompt;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(async () =>
    JSON.stringify({
      subject: "A rooftop courier in worn utility gear, pausing at the edge of a neon-lit ledge.",
      action: "The courier vaults a gap between rooftops, landing low and scanning the skyline for pursuers.",
    })
  ),
}));

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ resolveOperationPrompt, runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
});

afterEach(() => {
  (callLLMJson as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterAll(() => ctx.cleanup());

async function setStoryAndOutline(projectId: number, values: { story?: string | null; outline?: string | null }) {
  await ctx.db.update(ctx.schema.projects).set(values).where(eq(ctx.schema.projects.id, projectId));
}

describe("lookTest.subjectActionFromStory — preconditions proof", () => {
  it("refuses with the exact message when the project has neither story nor outline", async () => {
    const projectId = await insertProject(ctx, "Bare project");

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result).toEqual({
      ok: false,
      error: "Add a story or an outline to this project before generating a subject and action from it.",
    });
    expect(callLLMJson).not.toHaveBeenCalled();
  });

  it("passes with a story alone, no outline", async () => {
    const projectId = await insertProject(ctx, "Story-only project");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await resolveOperationPrompt(lookTestSubjectActionFromStoryDescriptor, { projectId }, {});
    expect(result.ok).toBe(true);
  });

  it("passes with outline sections alone, no story", async () => {
    const projectId = await insertProject(ctx, "Outline-only project");
    await setStoryAndOutline(projectId, {
      outline: "## Opening\nKai receives the package.\n\n## Chase\nDrones give chase.",
    });

    const result = await resolveOperationPrompt(lookTestSubjectActionFromStoryDescriptor, { projectId }, {});
    expect(result.ok).toBe(true);
  });

  it("refuses when the outline text exists but parses into zero \"## \" sections, and there is no story either", async () => {
    const projectId = await insertProject(ctx, "Unparseable outline project");
    await setStoryAndOutline(projectId, { outline: "Just some free text, no section markers at all." });

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result).toEqual({
      ok: false,
      error: "Add a story or an outline to this project before generating a subject and action from it.",
    });
  });

  it("refuses on a Project that does not exist, with the declared chain message", async () => {
    const result = await resolveOperationPrompt(lookTestSubjectActionFromStoryDescriptor, { projectId: 999999 }, {});
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});

describe("lookTest.subjectActionFromStory — intent.freeText / intent.parameters.previousProposal wiring (LOOK.FROMSTORY.VARY.1)", () => {
  it("with neither supplied, the assembled prompt carries no direction and no previous proposal", async () => {
    const projectId = await insertProject(ctx, "Vary wiring project — neither");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await resolveOperationPrompt(lookTestSubjectActionFromStoryDescriptor, { projectId }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).not.toContain("Direction:");
    expect(result.prompt.user).not.toContain("Previously proposed:");
  });

  it("with a direction and a previous proposal, the runner threads both through to the assembled user prompt", async () => {
    const projectId = await insertProject(ctx, "Vary wiring project — both");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await resolveOperationPrompt(
      lookTestSubjectActionFromStoryDescriptor,
      { projectId },
      { freeText: "an interior moment", parameters: { previousProposal: "Subject: Kai on a ledge.\nAction: Kai vaults a gap." } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.prompt.user).toContain("Direction: an interior moment");
    expect(result.prompt.user).toContain("Previously proposed:\nSubject: Kai on a ledge.\nAction: Kai vaults a gap.");
  });
});

describe("lookTest.subjectActionFromStory — kind: \"object\" output parsing", () => {
  it("parses a valid subject/action pair", async () => {
    const projectId = await insertProject(ctx, "Parsing project");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "object",
      values: {
        subject: "A rooftop courier in worn utility gear, pausing at the edge of a neon-lit ledge.",
        action: "The courier vaults a gap between rooftops, landing low and scanning the skyline for pursuers.",
      },
    });
  });

  it("refuses with errors.empty when the model omits one of the two required fields", async () => {
    (callLLMJson as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ subject: "A rooftop courier, pausing at the edge of a neon-lit ledge." })
    );
    const projectId = await insertProject(ctx, "Missing field project");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result).toEqual({
      ok: false,
      error: "The model returned an incomplete subject/action pair. Try again.",
    });
  });

  it("silently truncates an over-length field to 220 characters rather than rejecting it", async () => {
    const longSubject = "A rooftop courier ".repeat(20); // well over 220 chars
    (callLLMJson as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      JSON.stringify({ subject: longSubject, action: "The courier vaults a gap between rooftops." })
    );
    const projectId = await insertProject(ctx, "Truncation project");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "object") throw new Error("unreachable");
    expect(typeof result.values.subject).toBe("string");
    expect((result.values.subject as string).length).toBe(220);
    expect(longSubject.trim().startsWith(result.values.subject as string)).toBe(true);
  });

  it("refuses with errors.unparsable when the model's response is not valid JSON", async () => {
    (callLLMJson as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("not json at all");
    const projectId = await insertProject(ctx, "Unparsable project");
    await setStoryAndOutline(projectId, { story: "A rooftop courier discovers a conspiracy." });

    const result = await runOperation(lookTestSubjectActionFromStoryDescriptor, { projectId });
    expect(result).toEqual({ ok: false, error: "The model returned an unexpected format. Try again." });
  });
});
