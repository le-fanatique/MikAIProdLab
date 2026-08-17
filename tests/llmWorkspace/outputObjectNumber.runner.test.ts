import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.OUTPUT.OBJECT_NUMBER.1 (B11-b1) — proof for the runner's object branch
// (`parseObjectOutput`'s new `"number"` field variant). No production object
// descriptor declares a `"number"` field yet (the first is UC1's insertion
// descriptor, B11-bd, not shipped by this ticket — `.agents/supervised_task.md`
// §"Pourquoi ce ticket ship sans descripteur consommateur"), so every test
// here is against a small synthetic descriptor, on the same precedent
// `outputList.runner.test.ts` already set for the list branch's own numeric
// field (B7b).
//
// One shared validation (`isValidNumericValue`, `runner.ts`) backs both
// `readNumberField` (list) and `readObjectNumberField` (object) — see this
// file's tests for `exclusiveMin`/`max`/`Number.isFinite`, which prove the
// object branch enforces the exact same four rules `outputList.runner.test.ts`
// already proves for the list branch, not a second, drifted copy of them.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm", () => ({
  callLLMJson: vi.fn(),
}));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;

function mockedLLM() {
  return callLLMJson as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));

  projectId = await insertProject(ctx, "Object-number-output test project");
});

afterAll(() => ctx.cleanup());

// ---------------------------------------------------------------------------
// A synthetic `kind: "object"` descriptor, anchored on `project` (the
// simplest anchor, matching `story.generate`'s and `outputList.runner.test.ts`'s
// own precedent), with one `"string"` field (`title`) alongside the
// `"number"` field under test (`duration`) — proving the string neighbour's
// behaviour is untouched by the new variant, per §2 of the validation plan.
// ---------------------------------------------------------------------------

function syntheticObjectDescriptor(
  numberFieldOverrides: Partial<{ exclusiveMin: number; max: number }> = {},
  require: "all" | "any" = "any"
): OperationDescriptor {
  return {
    id: "test.syntheticObjectNumber",
    name: "Synthetic object with a number field (test only)",
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
      fields: [
        { type: "string", field: "title", jsonKey: "title" },
        {
          type: "number",
          field: "duration",
          jsonKey: "duration_seconds",
          fallback: "omit",
          ...numberFieldOverrides,
        },
      ],
      require,
      errors: {
        unparsable: "Unparsable response.",
        empty: "No valid fields.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

describe("runner object branch — numeric field (LLMW.OUTPUT.OBJECT_NUMBER.1, B11-b1)", () => {
  it("a valid number in range arrives in values as a number, not a string", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: 42 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A", duration: 42 } });
  });

  it("a value below exclusiveMin is omitted — the key is absent, not 0 nor \"\"", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: 0 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  it("a value above max is omitted", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: 121 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  it("max is inclusive — a value exactly at max is kept", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: 120 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A", duration: 120 } });
  });

  it("an absent field is omitted", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A" }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  it("a null value is omitted", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: null }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  it("a numeric-looking string is omitted — no coercion (readNumberField's own typeof rule, shared)", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A", duration_seconds: "12" }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  // NaN is not reachable through JSON.stringify (it collapses to null); see
  // `outputList.runner.test.ts`'s own comment for why Infinity is used
  // instead, via a literal JSON string.
  it("a JSON literal that parses to Infinity is omitted", async () => {
    mockedLLM().mockResolvedValueOnce('{"title":"A","duration_seconds":1e999}');
    const result = await runOperation(syntheticObjectDescriptor(), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "A" } });
  });

  it("a neighbouring string field keeps its own pre-existing behaviour, unaffected by the number field", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "  Spaced  ", duration_seconds: 5 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "Spaced", duration: 5 } });
  });

  it("require: \"all\" refuses when the number field is omitted, even though the string field is non-empty", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "A" }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }, "all"), { projectId });
    expect(result).toEqual({ ok: false, error: "No valid fields." });
  });

  it("require: \"any\" is satisfied by the number field alone when the string field is empty", async () => {
    mockedLLM().mockResolvedValueOnce(JSON.stringify({ title: "", duration_seconds: 5 }));
    const result = await runOperation(syntheticObjectDescriptor({ exclusiveMin: 0, max: 120 }, "any"), { projectId });
    expect(result).toEqual({ ok: true, kind: "object", values: { title: "", duration: 5 } });
  });
});
