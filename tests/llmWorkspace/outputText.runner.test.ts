import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.TEXT.1 (B12b-1) — proof for the runner's new text branch:
// `callLLMText` (`src/lib/llm/index.ts`) and `parseTextOutput` (`runner.ts`).
// No production descriptor declares `kind: "text"` yet (B12b-2 ships the
// first one), so every test here is against a small synthetic descriptor, on
// the same precedent `outputObjectNumber.runner.test.ts` (B11-b1) and
// `outputList.runner.test.ts` (B7a) already set for their own `output.kind`
// widenings.
//
// Unlike those two precedents, which mock `@/lib/llm` itself (they only ever
// exercise `callLLMJson`), this file cannot: `callLLMText` calls `callLLMChat`
// as a same-module function reference, which a mock of `@/lib/llm`'s own
// exports does not intercept. Instead, the two *provider* modules the router
// (`@/lib/llm/index.ts`) dispatches to are mocked — the default provider
// under test config is "ollama" (`src/lib/settings.ts`'s own default), so
// `callOllama` / `callOllamaChat` are the two functions this file asserts
// on; `callOpenAICompatibleJson` / `callOpenAICompatibleChat` are mocked
// alongside for the same reason `index.ts` imports both unconditionally.
// This proves assertion 3 (the text mode does not borrow the JSON call) at
// the lowest level available: the real provider function actually invoked.
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

  projectId = await insertProject(ctx, "Text-output test project");
});

afterAll(() => ctx.cleanup());

// ---------------------------------------------------------------------------
// A synthetic `kind: "text"` descriptor, anchored on `project` (the simplest
// anchor, matching `story.generate`'s and both precedent files' own
// convention).
// ---------------------------------------------------------------------------

function syntheticTextDescriptor(): OperationDescriptor {
  return {
    id: "test.syntheticText",
    name: "Synthetic text output (test only)",
    anchor: { kind: "entity", entity: "project" },
    context: { variables: [] },
    expertise: { role: "tester", system: { blocks: [{ text: "System message." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User message." }], separator: "\n" },
    intent: {},
    messages: {
      notConfigured: "LLM not configured.",
      chainNotFound: { project: "Project not found." },
    },
    output: {
      kind: "text",
      target: { entity: "project" },
      field: "narrativePrompt",
      errors: {
        empty: "The response was empty.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

function syntheticObjectDescriptor(): OperationDescriptor {
  return {
    id: "test.syntheticObjectForTextComparison",
    name: "Synthetic object output (test only, for comparison)",
    anchor: { kind: "entity", entity: "project" },
    context: { variables: [] },
    expertise: { role: "tester", system: { blocks: [{ text: "System message." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User message." }], separator: "\n" },
    intent: {},
    messages: {
      notConfigured: "LLM not configured.",
      chainNotFound: { project: "Project not found." },
    },
    output: {
      kind: "object",
      target: { entity: "project" },
      fields: [{ type: "string", field: "title", jsonKey: "title" }],
      require: "any",
      errors: {
        unparsable: "Unparsable response.",
        empty: "No valid fields.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

function syntheticListDescriptor(): OperationDescriptor {
  return {
    id: "test.syntheticListForTextComparison",
    name: "Synthetic list output (test only, for comparison)",
    anchor: { kind: "entity", entity: "project" },
    context: { variables: [] },
    expertise: { role: "tester", system: { blocks: [{ text: "System message." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User message." }], separator: "\n" },
    intent: {},
    messages: {
      notConfigured: "LLM not configured.",
      chainNotFound: { project: "Project not found." },
    },
    output: {
      kind: "list",
      arrayKey: "items",
      item: {
        fields: [{ type: "string", field: "title", jsonKey: "title" }],
        validity: { fields: ["title"], require: "all" },
      },
      selection: { formDataKey: "itemsJson" },
      errors: {
        unparsable: "Unparsable response.",
        notArray: "No items array.",
        empty: "No valid items.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

describe("runner text branch (LLMW.TEXT.1, B12b-1)", () => {
  it("1. a text response comes back as-is, .trim() applied, no code-fence stripping — backticks and braces survive", async () => {
    mockedChat().mockResolvedValueOnce(
      "  A narrative prompt with `backticks` and {braces} inside it.  "
    );
    const result = await runOperation(syntheticTextDescriptor(), { projectId });
    expect(result).toEqual({
      ok: true,
      kind: "text",
      text: "A narrative prompt with `backticks` and {braces} inside it.",
    });
  });

  it("2a. an empty response is refused with exactly output.errors.empty", async () => {
    mockedChat().mockResolvedValueOnce("");
    const result = await runOperation(syntheticTextDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "The response was empty." });
  });

  it("2b. an entirely blank response is refused with exactly output.errors.empty", async () => {
    mockedChat().mockResolvedValueOnce("   \n\t  ");
    const result = await runOperation(syntheticTextDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "The response was empty." });
  });

  it("3. the text mode does not borrow the JSON call — callOllamaChat is called, callOllama is not, on the actual call made", async () => {
    mockedJson().mockClear();
    mockedChat().mockClear();
    mockedChat().mockResolvedValueOnce("A narrative prompt.");

    const result = await runOperation(syntheticTextDescriptor(), { projectId });

    expect(result).toEqual({ ok: true, kind: "text", text: "A narrative prompt." });
    expect(mockedChat()).toHaveBeenCalledTimes(1);
    expect(mockedJson()).not.toHaveBeenCalled();

    // The exact adapter contract (§1 of the ticket): two ChatMessage entries,
    // system then user, built from the resolved LLMPrompt — not a third
    // provider router of its own.
    const [messages] = mockedChat().mock.calls[0];
    expect(messages).toEqual([
      { role: "system", content: expect.stringContaining("System message.") },
      { role: "user", content: expect.stringContaining("User message.") },
    ]);
  });

  it("4a. a kind: \"object\" descriptor still calls callOllama (the JSON call) and returns the same result as before", async () => {
    mockedJson().mockClear();
    mockedChat().mockClear();
    mockedJson().mockResolvedValueOnce(JSON.stringify({ title: "A title" }));

    const result = await runOperation(syntheticObjectDescriptor(), { projectId });

    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A title" } });
    expect(mockedJson()).toHaveBeenCalledTimes(1);
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("4b. a kind: \"list\" descriptor still calls callOllama (the JSON call) and returns the same result as before", async () => {
    mockedJson().mockClear();
    mockedChat().mockClear();
    mockedJson().mockResolvedValueOnce(JSON.stringify({ items: [{ title: "First" }] }));

    const result = await runOperation(syntheticListDescriptor(), { projectId });

    expect(result).toEqual({ ok: true, kind: "list", items: [{ title: "First" }] });
    expect(mockedJson()).toHaveBeenCalledTimes(1);
    expect(mockedChat()).not.toHaveBeenCalled();
  });
});
