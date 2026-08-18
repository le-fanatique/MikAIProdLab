import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject } from "../actions/helpers/fixtures";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.OUTPUT.REFVALIDITY.1 (B20b) — cross-item referential validity, the
// third and last of §5.9's format gaps for B20:
//
//   "Every observation cites exactly one attached reference; every candidate
//    rule cites every reference supporting it. No rule in `item.validity` can
//    state that today."
//
// The keys come from the run itself — `descriptor.images`'s `R1..Rn` — so the
// descriptor here declares real images and the test attaches real files, on
// `imageInput.runner.test.ts`'s own harness. A synthetic key list would prove
// the rule against a fiction instead of against what the runner attaches.
//
// **These tests assert REFUSAL, not filtering**, because that is what
// `projectStyle/referenceAnalysis/validation.ts` does today and B20e is a
// migration rather than a redesign.
// ---------------------------------------------------------------------------
vi.mock("@/lib/llm/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/ollama")>();
  return { ...actual, callOllama: vi.fn(), callOllamaChat: vi.fn() };
});
vi.mock("@/lib/llm/openaiCompatible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/openaiCompatible")>();
  return { ...actual, callOpenAICompatibleJson: vi.fn(), callOpenAICompatibleChat: vi.fn() };
});

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TEST_SUBFOLDER = "b20b-refvalidity-test";
const TEST_RELATIVE_DIR = `uploads/reference-images/${TEST_SUBFOLDER}`;
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callOllamaChat: typeof import("@/lib/llm/ollama").callOllamaChat;
let projectId: number;
let assetId: number;
let imageA: number;
let imageB: number;

function mockedChat() {
  return callOllamaChat as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });
  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callOllamaChat } = await import("@/lib/llm/ollama"));

  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });
  projectId = await insertProject(ctx, "B20b referential validity");
  assetId = await insertAsset(ctx, projectId, { name: "Anchor" });

  const insert = async (filename: string) => {
    await writeFile(path.join(TEST_ABSOLUTE_DIR, filename), Buffer.from(PNG_1X1_BASE64, "base64"));
    const [row] = await ctx.db
      .insert(ctx.schema.assetReferenceImages)
      .values({ assetId, imagePath: `${TEST_RELATIVE_DIR}/${filename}` })
      .returning({ id: ctx.schema.assetReferenceImages.id });
    return row.id;
  };
  imageA = await insert("a.png");
  imageB = await insert("b.png");
});

afterAll(async () => {
  ctx.cleanup();
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

function descriptor(options: { coverage?: { min: number; max: number } } = {}): OperationDescriptor {
  return {
    id: "test.refValidity",
    name: "Referential validity (test only)",
    anchor: { kind: "entity", entity: "asset" },
    context: { variables: [] },
    images: {
      source: "ASSET.REFERENCE_IMAGES",
      minCount: 1,
      maxCount: 4,
      maxTotalBytes: 1024 * 1024,
      keyPrefix: "R",
      messages: { noneSelected: "Select an image.", tooMany: "Too many.", unavailable: "Unavailable." },
    },
    expertise: { role: "tester", system: { blocks: [{ text: "System." }], separator: "\n" }, knowledge: [] },
    template: { blocks: [{ text: "User." }], separator: "\n" },
    intent: {},
    messages: { notConfigured: "Not configured.", chainNotFound: { project: "No project.", asset: "No asset." } },
    output: {
      kind: "composite",
      target: { entity: "asset" },
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
            ],
            validity: { fields: ["observation"], require: "all" },
            references: { field: "referenceKey", mode: "single", ...(options.coverage ? { coverage: options.coverage } : {}) },
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
            references: { field: "referenceKeys", mode: "subset" },
          },
        },
      ],
      errors: {
        unparsable: "Unreadable.",
        notArray: "Missing list.",
        empty: "No summary.",
        unknownReference: "The answer cites an image that was not attached.",
        coverage: "The answer ignores one of the selected images.",
      },
    },
    commit: [],
    executor: "inProcess",
  };
}

function answer(observations: unknown[], candidateRules: unknown[] = []) {
  return JSON.stringify({ summary: "s", observations, candidateRules });
}

describe("B20b — cross-item referential validity", () => {
  it("accepts an answer citing only attached keys", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer(
          [
            { referenceKey: "R1", observation: "a" },
            { referenceKey: "R2", observation: "b" },
          ],
          [{ instruction: "rule", referenceKeys: ["R1", "R2"] }]
        )
      );

    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA, imageB] });
    expect(result.ok).toBe(true);
  });

  it("refuses — never filters — an observation citing a key that was never attached", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer([
          { referenceKey: "R1", observation: "a" },
          { referenceKey: "R7", observation: "invented" },
        ])
      );

    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA, imageB] });

    expect(result).toEqual({ ok: false, error: "The answer cites an image that was not attached." });
  });

  it("refuses a candidate rule whose key list contains an unattached key", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer(
          [
            { referenceKey: "R1", observation: "a" },
            { referenceKey: "R2", observation: "b" },
          ],
          [{ instruction: "rule", referenceKeys: ["R1", "R9"] }]
        )
      );

    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA, imageB] });
    expect(result).toEqual({ ok: false, error: "The answer cites an image that was not attached." });
  });

  it("refuses a subset citation that is empty — a rule supported by nothing", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer(
          [
            { referenceKey: "R1", observation: "a" },
            { referenceKey: "R2", observation: "b" },
          ],
          [{ instruction: "rule", referenceKeys: [] }]
        )
      );

    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA, imageB] });
    expect(result).toEqual({ ok: false, error: "The answer cites an image that was not attached." });
  });

  it("refuses a single-mode citation that is missing", async () => {
    mockedChat().mockReset().mockResolvedValue(answer([{ observation: "no key at all" }]));

    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA, imageB] });
    expect(result).toEqual({ ok: false, error: "The answer cites an image that was not attached." });
  });

  it("refuses when an attached image is cited by nothing, under a declared coverage", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(answer([{ referenceKey: "R1", observation: "a" }]));

    const result = await runOperation(
      descriptor({ coverage: { min: 1, max: 6 } }),
      { projectId, assetId },
      {},
      { selectedIds: [imageA, imageB] }
    );

    expect(result).toEqual({ ok: false, error: "The answer ignores one of the selected images." });
  });

  it("refuses when one image is cited more times than coverage allows", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer([
          { referenceKey: "R1", observation: "a" },
          { referenceKey: "R1", observation: "b" },
          { referenceKey: "R2", observation: "c" },
        ])
      );

    const result = await runOperation(
      descriptor({ coverage: { min: 1, max: 1 } }),
      { projectId, assetId },
      {},
      { selectedIds: [imageA, imageB] }
    );

    expect(result).toEqual({ ok: false, error: "The answer ignores one of the selected images." });
  });

  it("accepts when coverage is satisfied for every attached image", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(
        answer([
          { referenceKey: "R1", observation: "a" },
          { referenceKey: "R2", observation: "b" },
        ])
      );

    const result = await runOperation(
      descriptor({ coverage: { min: 1, max: 6 } }),
      { projectId, assetId },
      {},
      { selectedIds: [imageA, imageB] }
    );
    expect(result.ok).toBe(true);
  });

  it("keys follow the selection, so citing R2 means the second image the user picked", async () => {
    mockedChat()
      .mockReset()
      .mockResolvedValue(answer([{ referenceKey: "R2", observation: "a" }]));

    // Only one image attached — R2 does not exist for this run.
    const result = await runOperation(descriptor(), { projectId, assetId }, {}, { selectedIds: [imageA] });
    expect(result).toEqual({ ok: false, error: "The answer cites an image that was not attached." });
  });
});

describe("B20b — the stored-template validator", () => {
  function clone(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(descriptor({ coverage: { min: 1, max: 6 } })));
  }

  it("accepts a descriptor declaring referential validity", () => {
    expect(validateLlmTemplateJson(JSON.stringify(descriptor({ coverage: { min: 1, max: 6 } }))).ok).toBe(true);
  });

  it("refuses a references.field naming an undeclared item field", () => {
    const d = clone();
    (d.output as { lists: Array<{ item: { references: { field: string } } }> }).lists[0].item.references.field = "nope";
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/undeclared field "nope"/);
  });

  it("refuses a coverage whose min exceeds its max", () => {
    const d = clone();
    (d.output as { lists: Array<{ item: { references: { coverage: { min: number; max: number } } } }> }).lists[0].item.references.coverage = {
      min: 5,
      max: 2,
    };
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot exceed/);
  });

  it("refuses referential validity declared without its own error message", () => {
    const d = clone();
    delete (d.output as { errors: Record<string, unknown> }).errors.unknownReference;
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/output\.errors\.unknownReference/);
  });

  it("refuses a coverage declared without its own error message", () => {
    const d = clone();
    delete (d.output as { errors: Record<string, unknown> }).errors.coverage;
    const result = validateLlmTemplateJson(JSON.stringify(d));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/output\.errors\.coverage/);
  });
});
