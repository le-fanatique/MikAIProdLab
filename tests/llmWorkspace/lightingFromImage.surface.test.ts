import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { changedColumns, setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject, readAsset } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// LLMW.LIGHTING.FROMIMAGE.1 (B16b) — the bench's Run and Approve paths for
// `lighting.fromImage`, on the model of `narrativePromptCompose.surface.test.ts`
// (the ticket's own named precedent), through the real bench Server Actions
// (`runBenchOperation`, `commitBenchProposal` — `src/actions/llmWorkspace/bench.ts`)
// against a real (temp) database, rather than calling `runOperation` directly:
// this is the first `images`-declaring descriptor these two actions ever
// dispatch, so the proof that matters is that THEY, not just the runner,
// refuse before calling the provider and write `assets.lighting` alone on
// Approve.
// ---------------------------------------------------------------------------

vi.mock("@/lib/llm/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/ollama")>();
  return {
    ...actual,
    callOllama: vi.fn(),
    callOllamaChat: vi.fn(async () => "Low-key, hard-edged light from screen glow, cool blue, high contrast."),
  };
});
vi.mock("@/lib/llm/openaiCompatible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/openaiCompatible")>();
  return { ...actual, callOpenAICompatibleJson: vi.fn(), callOpenAICompatibleChat: vi.fn() };
});

/** A real, decodable 1x1 PNG — the same fixture `imageInput.runner.test.ts` uses. */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TEST_SUBFOLDER = "b16b-lighting-surface-test";
const TEST_RELATIVE_DIR = `uploads/reference-images/${TEST_SUBFOLDER}`;
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

let ctx: TempDb;
let runBenchOperation: typeof import("@/actions/llmWorkspace/bench").runBenchOperation;
let commitBenchProposal: typeof import("@/actions/llmWorkspace/bench").commitBenchProposal;
let callOllama: typeof import("@/lib/llm/ollama").callOllama;
let callOllamaChat: typeof import("@/lib/llm/ollama").callOllamaChat;

let projectId: number;
let assetId: number;
let referenceImageId: number;

function mockedJson() {
  return callOllama as unknown as ReturnType<typeof vi.fn>;
}
function mockedChat() {
  return callOllamaChat as unknown as ReturnType<typeof vi.fn>;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runBenchOperation, commitBenchProposal } = await import("@/actions/llmWorkspace/bench"));
  ({ callOllama, callOllamaChat } = await import("@/lib/llm/ollama"));

  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });

  projectId = await insertProject(ctx, "B16b lighting surface project");
  assetId = await insertAsset(ctx, projectId, { type: "environment", name: "Rooftop set" });

  const imagePath = `${TEST_RELATIVE_DIR}/a.png`;
  await writeFile(path.join(TEST_ABSOLUTE_DIR, "a.png"), Buffer.from(PNG_1X1_BASE64, "base64"));
  const [row] = await ctx.db
    .insert(ctx.schema.assetReferenceImages)
    .values({ assetId, imagePath, label: "Rooftop at dusk" })
    .returning({ id: ctx.schema.assetReferenceImages.id });
  referenceImageId = row.id;
});

afterAll(async () => {
  ctx.cleanup();
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

describe("lighting.fromImage — the bench refuses to run without a selected image", () => {
  it("refuses with the declared message and never calls the provider, with no imageIds at all", async () => {
    mockedChat().mockClear();
    mockedJson().mockClear();

    const result = await runBenchOperation({
      templateId: "lighting.fromImage",
      ids: { projectId, assetId },
      searchParams: {},
    });

    expect(result).toEqual({
      ok: false,
      error: "Select at least one reference image to describe its lighting.",
    });
    expect(mockedChat()).not.toHaveBeenCalled();
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("refuses the same way with an explicitly empty imageIds selection", async () => {
    mockedChat().mockClear();
    mockedJson().mockClear();

    const result = await runBenchOperation({
      templateId: "lighting.fromImage",
      ids: { projectId, assetId },
      searchParams: { imageIds: [] },
    });

    expect(result).toEqual({
      ok: false,
      error: "Select at least one reference image to describe its lighting.",
    });
    expect(mockedChat()).not.toHaveBeenCalled();
  });
});

describe("lighting.fromImage — bench Run, then Approve, against a real database", () => {
  it("runBenchOperation returns the model's lighting description as a text draft, once an image is selected", async () => {
    mockedChat().mockClear();
    mockedJson().mockClear();

    const result = await runBenchOperation({
      templateId: "lighting.fromImage",
      ids: { projectId, assetId },
      searchParams: { imageIds: [String(referenceImageId)] },
    });

    expect(result).toEqual({
      ok: true,
      kind: "text",
      text: "Low-key, hard-edged light from screen glow, cool blue, high contrast.",
    });
    expect(mockedChat()).toHaveBeenCalledTimes(1);
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("approving writes assets.lighting alone — description/notes stay untouched", async () => {
    const before = await readAsset(ctx, assetId);

    const draft = await runBenchOperation({
      templateId: "lighting.fromImage",
      ids: { projectId, assetId },
      searchParams: { imageIds: [String(referenceImageId)] },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok || draft.kind !== "text") throw new Error("unreachable");

    const approved = await commitBenchProposal({
      templateId: "lighting.fromImage",
      ids: { projectId, assetId },
      values: { lighting: draft.text },
    });
    expect(approved).toEqual({ ok: true });

    const after = await readAsset(ctx, assetId);
    expect(after.lighting).toBe("Low-key, hard-edged light from screen glow, cool blue, high contrast.");
    // The assertion that counts: only `lighting` (plus `updatedAt`) changed.
    expect(changedColumns(before, after).filter((c) => c !== "updatedAt")).toEqual(["lighting"]);
    expect(after.description).toBe(before.description);
    expect(after.notes).toBe(before.notes);
  });
});
