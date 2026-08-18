import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { narrativePromptComposeDescriptor } from "@/lib/llmWorkspace/descriptors/narrativePrompt";

// ---------------------------------------------------------------------------
// LLMW.NARRATIVE.1 (B12b-2) — runner proof for `narrativePrompt.compose`,
// against a real seeded database. `callOllamaChat` is mocked (not
// `callOllama`) — the text mode goes through the chat call, per
// `outputText.runner.test.ts` (B12b-1)'s own precedent and header comment
// for why a `@/lib/llm` module mock cannot intercept it here.
// ---------------------------------------------------------------------------
vi.mock("@/lib/llm/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/ollama")>();
  return {
    ...actual,
    callOllama: vi.fn(),
    callOllamaChat: vi.fn(),
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
let callOllama: typeof import("@/lib/llm/ollama").callOllama;
let callOllamaChat: typeof import("@/lib/llm/ollama").callOllamaChat;
let projectId: number;
let sequenceId: number;
let shotId: number;
let otherProjectId: number;
let otherSequenceId: number;

function mockedJson() {
  return callOllama as unknown as ReturnType<typeof vi.fn>;
}

function mockedChat() {
  return callOllamaChat as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callOllama, callOllamaChat } = await import("@/lib/llm/ollama"));

  projectId = await insertProject(ctx, "Narrative prompt project");
  otherProjectId = await insertProject(ctx, "A different project");

  sequenceId = await insertSequence(ctx, projectId, { title: "Opening sequence", mood: "Tense" });
  otherSequenceId = await insertSequence(ctx, otherProjectId, { title: "Unrelated sequence" });

  shotId = await insertShot(ctx, sequenceId, {
    title: "Hero enters",
    shotCode: "SH01",
    shotPrompt: "An existing shot prompt.",
  });
});

afterAll(() => ctx.cleanup());

describe("narrativePrompt.compose — runner proof (LLMW.NARRATIVE.1, B12b-2)", () => {
  it("1. a prose response comes back intact as { kind: 'text', text }", async () => {
    mockedChat().mockResolvedValueOnce("A vivid narrative prompt for this shot.");
    const result = await runOperation(narrativePromptComposeDescriptor, { projectId, sequenceId, shotId });
    expect(result).toEqual({ ok: true, kind: "text", text: "A vivid narrative prompt for this shot." });
  });

  it("2. an empty response is refused with exactly output.errors.empty", async () => {
    mockedChat().mockResolvedValueOnce("   ");
    const result = await runOperation(narrativePromptComposeDescriptor, { projectId, sequenceId, shotId });
    expect(result).toEqual({ ok: false, error: "The model returned an empty narrative prompt. Try again." });
  });

  it("3. this operation calls callOllamaChat (the text call), never callOllama (the JSON call)", async () => {
    mockedJson().mockClear();
    mockedChat().mockClear();
    mockedChat().mockResolvedValueOnce("A vivid narrative prompt.");

    const result = await runOperation(narrativePromptComposeDescriptor, { projectId, sequenceId, shotId });

    expect(result).toEqual({ ok: true, kind: "text", text: "A vivid narrative prompt." });
    expect(mockedChat()).toHaveBeenCalledTimes(1);
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("4. refuses a Shot belonging to a different Sequence chain", async () => {
    const result = await runOperation(narrativePromptComposeDescriptor, {
      projectId: otherProjectId,
      sequenceId: otherSequenceId,
      shotId,
    });
    expect(result).toEqual({ ok: false, error: "Shot not found." });
  });

  it("5. refuses a Project that does not exist", async () => {
    const result = await runOperation(narrativePromptComposeDescriptor, {
      projectId: projectId + 9000,
      sequenceId,
      shotId,
    });
    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});
