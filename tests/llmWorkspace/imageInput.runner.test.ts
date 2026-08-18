import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertProject } from "../actions/helpers/fixtures";
import type { OperationDescriptor } from "@/lib/llmWorkspace/types";

// ---------------------------------------------------------------------------
// LLMW.DESCRIPTOR.IMAGE.1 (B16a) — proof for the descriptor format's image
// input: the closed source registry (`images/registry.ts`), the call-time byte
// re-validation (`images/prepare.ts`), the `{images}` block, and the runner's
// multimodal route.
//
// No production descriptor declares `images` yet (B16b ships the first one),
// so every test here runs against a small synthetic descriptor — the same
// precedent `outputText.runner.test.ts` (B12b-1) and `outputList.runner.test.ts`
// (B7a) set for their own format widenings.
//
// The two *provider* modules are mocked rather than `@/lib/llm` itself, for
// the reason `outputText.runner.test.ts` documents: the image path calls
// `callLLMChat`, a same-module function reference a mock of `@/lib/llm`'s
// exports would not intercept. The default provider under test config is
// "ollama", so `callOllamaChat` is the function these tests assert on, and
// `callOllama` (the JSON call) is the one they assert is NOT reached.
//
// Real files are written under `public/uploads/reference-images/` because that
// root is exactly what `isConfinedUploadedReferenceImagePath` requires and
// what `prepare.ts` resolves against — a fixture elsewhere would prove the
// wrong thing. They are removed in `afterAll`.
// ---------------------------------------------------------------------------
vi.mock("@/lib/llm/ollama", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/ollama")>();
  return { ...actual, callOllama: vi.fn(), callOllamaChat: vi.fn() };
});
vi.mock("@/lib/llm/openaiCompatible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/openaiCompatible")>();
  return { ...actual, callOpenAICompatibleJson: vi.fn(), callOpenAICompatibleChat: vi.fn() };
});

/** A real, decodable 1x1 PNG — the decode gate and the ffprobe dimension read are not mocked. */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** A real, valid 1x1 GIF. Refused on purpose — see `prepare.ts`'s `detectFormat`. */
const GIF_1X1_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const TEST_SUBFOLDER = "b16a-image-input-test";
const TEST_RELATIVE_DIR = `uploads/reference-images/${TEST_SUBFOLDER}`;
const TEST_ABSOLUTE_DIR = path.join(process.cwd(), "public", TEST_RELATIVE_DIR);

let ctx: TempDb;
let runOperation: typeof import("@/lib/llmWorkspace/runner").runOperation;
let callOllama: typeof import("@/lib/llm/ollama").callOllama;
let callOllamaChat: typeof import("@/lib/llm/ollama").callOllamaChat;

let projectId: number;
let assetId: number;
let otherAssetId: number;
let pngA: number;
let pngB: number;
let gifId: number;
let missingFileId: number;
let unconfinedId: number;
let foreignAssetImageId: number;

function mockedJson() {
  return callOllama as unknown as ReturnType<typeof vi.fn>;
}
function mockedChat() {
  return callOllamaChat as unknown as ReturnType<typeof vi.fn>;
}

async function writeFixtureImage(filename: string, base64: string): Promise<string> {
  await writeFile(path.join(TEST_ABSOLUTE_DIR, filename), Buffer.from(base64, "base64"));
  return `${TEST_RELATIVE_DIR}/${filename}`;
}

async function insertReferenceImage(
  ownerAssetId: number,
  imagePath: string,
  values: { label?: string | null; imageRole?: "lighting" | null; notes?: string | null } = {}
): Promise<number> {
  const [row] = await ctx.db
    .insert(ctx.schema.assetReferenceImages)
    .values({ assetId: ownerAssetId, imagePath, ...values })
    .returning({ id: ctx.schema.assetReferenceImages.id });
  return row.id;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  await ctx.db.insert(ctx.schema.appSettings).values({ key: "llm_ollama_model", value: "test-model" });

  ({ runOperation } = await import("@/lib/llmWorkspace/runner"));
  ({ callOllama, callOllamaChat } = await import("@/lib/llm/ollama"));

  await mkdir(TEST_ABSOLUTE_DIR, { recursive: true });

  projectId = await insertProject(ctx, "B16a image-input project");
  assetId = await insertAsset(ctx, projectId, { name: "Anchor asset" });
  otherAssetId = await insertAsset(ctx, projectId, { name: "Another asset" });

  pngA = await insertReferenceImage(assetId, await writeFixtureImage("a.png", PNG_1X1_BASE64), {
    label: "Rooftop at dusk",
    imageRole: "lighting",
  });
  pngB = await insertReferenceImage(assetId, await writeFixtureImage("b.png", PNG_1X1_BASE64), {
    label: "Interior, screens only",
  });
  gifId = await insertReferenceImage(assetId, await writeFixtureImage("c.gif", GIF_1X1_BASE64));
  missingFileId = await insertReferenceImage(assetId, `${TEST_RELATIVE_DIR}/never-written.png`);
  unconfinedId = await insertReferenceImage(assetId, "uploads/somewhere-else/x.png");
  foreignAssetImageId = await insertReferenceImage(otherAssetId, await writeFixtureImage("d.png", PNG_1X1_BASE64));
});

afterAll(async () => {
  ctx.cleanup();
  await rm(TEST_ABSOLUTE_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A synthetic image-bearing descriptor, anchored on `asset` — the anchor
// `ASSET.REFERENCE_IMAGES` declares. `output.kind: "text"` because that is
// B16b's own case, and because it keeps the assertions about the CALL (which
// provider function, with what message) free of JSON-parsing noise.
// ---------------------------------------------------------------------------
function syntheticImageDescriptor(overrides: Partial<NonNullable<OperationDescriptor["images"]>> = {}): OperationDescriptor {
  return {
    id: "test.syntheticImages",
    name: "Synthetic image input (test only)",
    anchor: { kind: "entity", entity: "asset" },
    context: { variables: [] },
    images: {
      source: "ASSET.REFERENCE_IMAGES",
      minCount: 1,
      maxCount: 2,
      maxTotalBytes: 1024 * 1024,
      keyPrefix: "R",
      messages: {
        noneSelected: "Select at least one reference image.",
        tooMany: "Select at most two reference images.",
        unavailable: "The selected reference images could not be used.",
      },
      ...overrides,
    },
    expertise: {
      role: "tester",
      system: { blocks: [{ text: "System message." }], separator: "\n" },
      knowledge: [],
    },
    template: {
      blocks: [{ text: "Describe the lighting." }, { images: true, render: "images.attachedContextLines" }],
      separator: "\n",
    },
    intent: {},
    messages: {
      notConfigured: "LLM not configured.",
      chainNotFound: { project: "Project not found.", asset: "Asset not found." },
    },
    output: {
      kind: "text",
      target: { entity: "asset" },
      field: "lighting",
      errors: { empty: "The response was empty." },
    },
    commit: [],
    executor: "inProcess",
  };
}

describe("B16a — the declared image input", () => {
  it("keys the images by the caller's selection order, never by row order", async () => {
    mockedChat().mockReset().mockResolvedValue("Low-key, screen-lit.");
    mockedJson().mockReset();

    // Deliberately the reverse of the insertion order.
    const result = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [pngB, pngA] });

    expect(result).toEqual({ ok: true, kind: "text", text: "Low-key, screen-lit." });

    const [messages] = mockedChat().mock.calls[0];
    const userText = (messages[1].content as Array<{ type: string; text?: string }>).find((p) => p.type === "text")?.text;
    // R1 is the image the caller asked for first (`pngB`), R2 the second.
    expect(userText).toContain("[R1]\nLabel: Interior, screens only");
    expect(userText).toContain("[R2]\nLabel: Rooftop at dusk\nImage role: lighting");
    expect(userText!.indexOf("[R1]")).toBeLessThan(userText!.indexOf("[R2]"));
  });

  it("builds one multimodal message and never reaches the JSON call", async () => {
    mockedChat().mockReset().mockResolvedValue("Answer.");
    mockedJson().mockReset();

    await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [pngA] });

    expect(mockedJson()).not.toHaveBeenCalled();
    expect(mockedChat()).toHaveBeenCalledTimes(1);

    const [messages, , options] = mockedChat().mock.calls[0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: "System message." });

    const parts = messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(1);
    expect(parts.find((p) => p.type === "image_url")!.image_url!.url).toBe(`data:image/png;base64,${PNG_1X1_BASE64}`);
    // The same bytes again, top-level, raw — the shape Ollama's vision path reads.
    expect(messages[1].images).toEqual([PNG_1X1_BASE64]);
    expect(options).toEqual({ temperature: 0 });
  });

  it("never lets a byte or a path into the prompt text", async () => {
    mockedChat().mockReset().mockResolvedValue("Answer.");

    await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [pngA] });

    const [messages] = mockedChat().mock.calls[0];
    const userText = (messages[1].content as Array<{ type: string; text?: string }>).find((p) => p.type === "text")!.text!;
    expect(userText).not.toContain(PNG_1X1_BASE64);
    expect(userText).not.toContain("uploads/");
  });

  it("refuses with the declared message when nothing is selected, before any call", async () => {
    mockedChat().mockReset();
    mockedJson().mockReset();

    const noInput = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {});
    const emptyInput = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [] });

    expect(noInput).toEqual({ ok: false, error: "Select at least one reference image." });
    expect(emptyInput).toEqual({ ok: false, error: "Select at least one reference image." });
    expect(mockedChat()).not.toHaveBeenCalled();
    expect(mockedJson()).not.toHaveBeenCalled();
  });

  it("refuses with the declared message above maxCount", async () => {
    mockedChat().mockReset();

    const result = await runOperation(
      syntheticImageDescriptor(),
      { projectId, assetId },
      {},
      { selectedIds: [pngA, pngB, gifId] }
    );

    expect(result).toEqual({ ok: false, error: "Select at most two reference images." });
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses a duplicate selection", async () => {
    mockedChat().mockReset();

    const result = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [pngA, pngA] });

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("selected twice");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses an image belonging to another Asset", async () => {
    mockedChat().mockReset();

    const result = await runOperation(
      syntheticImageDescriptor(),
      { projectId, assetId },
      {},
      { selectedIds: [pngA, foreignAssetImageId] }
    );

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("belong to a different Asset");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses a stored path outside the family's root, before reading any file", async () => {
    mockedChat().mockReset();

    const result = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [unconfinedId] });

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("outside the expected storage root");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when one file is unreadable — never a partial attachment", async () => {
    mockedChat().mockReset();

    const result = await runOperation(
      syntheticImageDescriptor(),
      { projectId, assetId },
      {},
      { selectedIds: [pngA, missingFileId] }
    );

    expect(result.ok).toBe(false);
    // The refusal names the second image by its per-run key, and nothing was sent.
    expect((result as { error: string }).error).toContain("Image R2: stored file is missing or unreadable.");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses a GIF, although the upload path accepts one", async () => {
    mockedChat().mockReset();

    const result = await runOperation(syntheticImageDescriptor(), { projectId, assetId }, {}, { selectedIds: [gifId] });

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("is not a real PNG, JPEG or WebP");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("refuses above the declared cumulative byte budget", async () => {
    mockedChat().mockReset();

    const result = await runOperation(
      syntheticImageDescriptor({ maxTotalBytes: 100 }),
      { projectId, assetId },
      {},
      { selectedIds: [pngA, pngB] }
    );

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("exceed the total 100 byte limit");
    expect(mockedChat()).not.toHaveBeenCalled();
  });

  it("leaves a descriptor that declares no images on the text path, even when a selection is passed", async () => {
    mockedChat().mockReset().mockResolvedValue("Plain text answer.");
    mockedJson().mockReset();

    const descriptor = syntheticImageDescriptor();
    delete descriptor.images;
    descriptor.template = { blocks: [{ text: "Describe the lighting." }], separator: "\n" };

    const result = await runOperation(descriptor, { projectId, assetId }, {}, { selectedIds: [pngA] });

    expect(result).toEqual({ ok: true, kind: "text", text: "Plain text answer." });
    const [messages] = mockedChat().mock.calls[0];
    // `callLLMText`'s two plain-string messages — no image parts anywhere.
    expect(messages[1].content).toBe("Describe the lighting.");
    expect(messages[1].images).toBeUndefined();
  });
});
