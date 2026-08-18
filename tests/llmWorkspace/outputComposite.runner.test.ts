import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject } from "../actions/helpers/fixtures";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.OUTPUT.COMPOSITE.1 (B20a) — the fourth `output.kind`: one scalar and
// several named lists in a single answer.
//
// Modelled on the REAL shape `projectStyleReferenceAnalysis` answers with
// (`referenceAnalysis/prompt.ts`'s own schema block, and
// `contracts.ts`'s `AnalysisOutput`): `{summary, observations[],
// candidateRules[]}`, where `candidateRules[].referenceKeys` is an array of
// strings. That is the second of §5.9's three format gaps for B20 — a fake
// shape would prove the wrong thing.
//
// No descriptor declares this kind yet (B20e is the consumer), so the tests
// run against a synthetic descriptor, on the precedent B7a / B11-b1 / B12b-1
// set for their own `output.kind` widenings. `@/lib/llm` is mocked, matching
// those same files.
// ---------------------------------------------------------------------------
vi.mock("@/lib/llm", () => ({ callLLMJson: vi.fn() }));

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callLLMJson: typeof import("@/lib/llm").callLLMJson;
let projectId: number;

function mocked() {
  return callLLMJson as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callLLMJson } = await import("@/lib/llm"));
  projectId = await insertProject(ctx, "Composite output test project");
});

afterAll(() => ctx.cleanup());

function syntheticCompositeDescriptor(): OperationDescriptor {
  return {
    id: "test.syntheticComposite",
    name: "Synthetic composite output (test only)",
    anchor: { kind: "entity", entity: "project" },
    context: { variables: [] },
    expertise: { role: "tester", system: { blocks: [{ text: "System." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User." }], separator: "\n" },
    intent: {},
    messages: { notConfigured: "LLM not configured.", chainNotFound: { project: "Project not found." } },
    output: {
      kind: "composite",
      target: { entity: "project" },
      scalars: [{ type: "string", field: "summary", jsonKey: "summary" }],
      require: "all",
      lists: [
        {
          key: "observations",
          arrayKey: "observations",
          item: {
            fields: [
              { type: "string", field: "referenceKey", jsonKey: "referenceKey" },
              { type: "string", field: "observation", jsonKey: "observation" },
              { type: "enum", field: "confidence", jsonKey: "confidence", values: ["high", "medium", "low"], default: "low" },
            ],
            validity: { fields: ["observation"], require: "all" },
          },
        },
        {
          key: "candidateRules",
          arrayKey: "candidateRules",
          item: {
            fields: [
              { type: "string", field: "instruction", jsonKey: "instruction" },
              { type: "stringList", field: "referenceKeys", jsonKey: "referenceKeys" },
            ],
            validity: { fields: ["instruction"], require: "all" },
          },
        },
      ],
      errors: {
        unparsable: "The model's answer could not be read.",
        notArray: "The model's answer was missing a required list.",
        empty: "The model returned no summary.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

const GOOD_ANSWER = JSON.stringify({
  schemaVersion: 1,
  summary: "Three images share a cold, hard-edged light.",
  observations: [
    { referenceKey: "R1", observation: "Hard key from screen left.", confidence: "high" },
    { referenceKey: "R2", observation: "Soft fill, no visible source.", confidence: "medium" },
  ],
  candidateRules: [
    { instruction: "Keep shadows hard-edged.", referenceKeys: ["R1", "R2"] },
  ],
});

describe("B20a — the composite output", () => {
  it("parses one scalar and two lists from a single answer", async () => {
    mocked().mockReset().mockResolvedValue(GOOD_ANSWER);

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });

    expect(result).toEqual({
      ok: true,
      kind: "composite",
      values: { summary: "Three images share a cold, hard-edged light." },
      lists: {
        observations: [
          { referenceKey: "R1", observation: "Hard key from screen left.", confidence: "high" },
          { referenceKey: "R2", observation: "Soft fill, no visible source.", confidence: "medium" },
        ],
        candidateRules: [{ instruction: "Keep shadows hard-edged.", referenceKeys: ["R1", "R2"] }],
      },
    });
  });

  it("carries an array-of-strings item field, which no other output kind can", async () => {
    mocked().mockReset().mockResolvedValue(GOOD_ANSWER);
    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
    if (!result.ok || result.kind !== "composite") throw new Error("expected a composite result");

    expect(result.lists.candidateRules[0].referenceKeys).toEqual(["R1", "R2"]);
  });

  it("trims and drops blank members of a string list, and tolerates a non-array", async () => {
    mocked()
      .mockReset()
      .mockResolvedValue(
        JSON.stringify({
          summary: "s",
          observations: [],
          candidateRules: [
            { instruction: "a", referenceKeys: ["  R1  ", "", "   ", "R2", 7] },
            { instruction: "b", referenceKeys: "not an array" },
            { instruction: "c" },
          ],
        })
      );

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
    if (!result.ok || result.kind !== "composite") throw new Error("expected a composite result");

    expect(result.lists.candidateRules[0].referenceKeys).toEqual(["R1", "R2"]);
    // Absent or wrongly-typed yields an empty list, never a refusal — item
    // refusal is `validity`'s job, and `instruction` is what gates here.
    expect(result.lists.candidateRules[1].referenceKeys).toEqual([]);
    expect(result.lists.candidateRules[2].referenceKeys).toEqual([]);
  });

  it("refuses the whole answer when a declared list is missing — never a half-answer", async () => {
    mocked()
      .mockReset()
      .mockResolvedValue(JSON.stringify({ summary: "s", observations: [] }));

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });

    expect(result).toEqual({ ok: false, error: "The model's answer was missing a required list." });
  });

  it("refuses when a declared list is present but not an array", async () => {
    mocked()
      .mockReset()
      .mockResolvedValue(JSON.stringify({ summary: "s", observations: {}, candidateRules: [] }));

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
    expect(result).toEqual({ ok: false, error: "The model's answer was missing a required list." });
  });

  it("gates emptiness on the scalars, not on the lists", async () => {
    // An analysis that observed nothing is a legitimate answer.
    mocked()
      .mockReset()
      .mockResolvedValue(JSON.stringify({ summary: "Nothing conclusive.", observations: [], candidateRules: [] }));
    const withSummary = await runOperation(syntheticCompositeDescriptor(), { projectId });
    expect(withSummary.ok).toBe(true);

    // One with no summary is not.
    mocked()
      .mockReset()
      .mockResolvedValue(JSON.stringify({ summary: "   ", observations: [], candidateRules: [] }));
    const withoutSummary = await runOperation(syntheticCompositeDescriptor(), { projectId });
    expect(withoutSummary).toEqual({ ok: false, error: "The model returned no summary." });
  });

  it("filters an invalid item instead of refusing the answer", async () => {
    mocked()
      .mockReset()
      .mockResolvedValue(
        JSON.stringify({
          summary: "s",
          observations: [
            { referenceKey: "R1", observation: "kept" },
            { referenceKey: "R2", observation: "" },
            "not an object",
            null,
          ],
          candidateRules: [],
        })
      );

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
    if (!result.ok || result.kind !== "composite") throw new Error("expected a composite result");

    expect(result.lists.observations).toHaveLength(1);
    expect(result.lists.observations[0].observation).toBe("kept");
  });

  it("refuses an unparsable or non-object answer", async () => {
    for (const answer of ["{ not json", "[1,2,3]", '"a string"']) {
      mocked().mockReset().mockResolvedValue(answer);
      const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
      expect(result).toEqual({ ok: false, error: "The model's answer could not be read." });
    }
  });

  it("applies an enum item field's declared default", async () => {
    mocked()
      .mockReset()
      .mockResolvedValue(
        JSON.stringify({
          summary: "s",
          observations: [{ referenceKey: "R1", observation: "o", confidence: "nonsense" }],
          candidateRules: [],
        })
      );

    const result = await runOperation(syntheticCompositeDescriptor(), { projectId });
    if (!result.ok || result.kind !== "composite") throw new Error("expected a composite result");
    expect(result.lists.observations[0].confidence).toBe("low");
  });
});

describe("B20a — the stored-template validator", () => {
  function clone(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(syntheticCompositeDescriptor()));
  }

  it("accepts a composite descriptor, serialized", () => {
    expect(validateLlmTemplateJson(JSON.stringify(syntheticCompositeDescriptor())).ok).toBe(true);
  });

  it("refuses a validity field that names an undeclared item field", () => {
    const d = clone();
    const output = d.output as { lists: Array<{ item: { validity: { fields: string[] } } }> };
    output.lists[0].item.validity.fields = ["nope"];
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/undeclared field "nope"/);
  });

  it("refuses two lists sharing a key", () => {
    const d = clone();
    const output = d.output as { lists: Array<{ key: string }> };
    output.lists[1].key = output.lists[0].key;
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/duplicates/);
  });

  it("refuses a missing declared error message", () => {
    const d = clone();
    const output = d.output as { errors: Record<string, unknown> };
    delete output.errors.notArray;
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/output\.errors\.notArray/);
  });

  it("still names composite among the accepted kinds when the kind is unknown", () => {
    const d = clone();
    (d.output as { kind: string }).kind = "banana";
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/"composite"/);
  });
});
