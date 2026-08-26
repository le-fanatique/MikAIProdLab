import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertComfyWorkflow, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SHOTPROMPT.REFS.1 — the end-to-end proof of the defect the author actually
// hit on shot 999230: a text-to-image workflow (no image input at all) still
// declared nine `@ImageN` lines in `Subject Definition`, one per selectable
// image, none of which were ever sent. `orderStoryboardReferences`'s own
// fallback ("everything selectable") is correct for its other caller, the
// Sequence Storyboard page, but wrong here — see
// `docs/WHERE_THE_RULES_LIVE.md`.
//
// Same discipline as `tests/comfy/runShotGeneration.promptCard.test.ts`: runs
// `runShotGenerationCore` for real against a disposable SQLite DB, doubling
// only the one true network primitive (`queueComfyPrompt`).
// ---------------------------------------------------------------------------

vi.mock("@/lib/comfy/comfyServerClient", () => ({
  queueComfyPrompt: vi.fn(async () => ({ prompt_id: "test-prompt-id", node_errors: {} })),
}));

let ctx: TempDb;
let runShotGenerationCore: typeof import("@/lib/comfy/runShotGeneration").runShotGenerationCore;
let queueComfyPrompt: ReturnType<typeof vi.fn>;

// A minimal, valid text-to-image workflow: one node marked "(Input)" whose
// `class_type` contains "Text" (CLIPTextEncode) and carries an `inputs.text`
// field, and NO node whose `class_type` matches the image rule
// (`LoadImage`/`Image.*Load`/`Load.*Image` — `parseWorkflow.ts`'s
// `classifyInputKind`). This is exactly the shape the author's real
// text-to-image workflow has.
const TEXT_TO_IMAGE_WORKFLOW_JSON = JSON.stringify({
  "1": {
    class_type: "CLIPTextEncode",
    _meta: { title: "Positive Prompt (Input)" },
    inputs: { text: "placeholder" },
  },
});

// Two `LoadImage` nodes, node ids "5" and "10" — deliberately not written in
// ascending order in the JSON's own key order, to prove the workflow's own
// node order (ascending numeric, a language rule — see
// `composeShotGenerationPrompt.ts`'s `imageInputs` doc comment) is what
// governs `@ImageN`, never insertion order or DB order.
const TWO_IMAGE_INPUT_WORKFLOW_JSON = JSON.stringify({
  "10": { class_type: "LoadImage", _meta: { title: "Image B (Input)" }, inputs: {} },
  "1": {
    class_type: "CLIPTextEncode",
    _meta: { title: "Positive Prompt (Input)" },
    inputs: { text: "placeholder" },
  },
  "5": { class_type: "LoadImage", _meta: { title: "Image A (Input)" }, inputs: {} },
});

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ runShotGenerationCore } = await import("@/lib/comfy/runShotGeneration"));
  ({ queueComfyPrompt } = (await import("@/lib/comfy/comfyServerClient")) as unknown as {
    queueComfyPrompt: ReturnType<typeof vi.fn>;
  });
});

afterAll(() => ctx.cleanup());

async function readQueuedPromptText(jobId: number): Promise<string | undefined> {
  const { parseGenerationSnapshot } = await import("@/lib/comfy/generationSnapshot");
  const [row] = await ctx.db
    .select({ payloadSnapshot: ctx.schema.generationJobs.payloadSnapshot })
    .from(ctx.schema.generationJobs)
    .where(eq(ctx.schema.generationJobs.id, jobId));
  const snapshot = parseGenerationSnapshot(row?.payloadSnapshot ?? null);
  return snapshot?.promptText;
}

describe("runShotGenerationCore — SHOTPROMPT.REFS.1, no image input at all", () => {
  it("queues a prompt with NO Subject Definition block, even though the cast asset has reference images in the DB", async () => {
    const projectId = await insertProject(ctx, "No image input project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot", shotPrompt: "Azelle boards the shuttle." });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: TEXT_TO_IMAGE_WORKFLOW_JSON });
    const assetId = await insertAsset(ctx, projectId, {
      name: "Azelle",
      type: "character",
      visualIdentity: "Cropped hair, scarred jaw.",
    });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });
    // The exact shape shot 999230 had in real use: real reference images
    // exist and are selectable, but this workflow has no image input at all.
    await ctx.db.insert(ctx.schema.assetReferenceImages).values({
      assetId,
      imagePath: "uploads/reference-images/azelle-1.jpg",
      imageRole: "character",
    });
    await ctx.db.insert(ctx.schema.assetReferenceImages).values({
      assetId,
      imagePath: "uploads/reference-images/azelle-2.jpg",
      imageRole: "character",
    });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(queueComfyPrompt).toHaveBeenCalledTimes(1);

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    // The decisive assertion: the "Subject Definition" @ImageN block is
    // ABSENT, never rendered empty, and no `@ImageN` line for an image that
    // was never sent. (Cast asset's name still appears in the unrelated
    // "Subject:" composition line built from `castAssets` — that part is
    // untouched by this ticket.)
    expect(promptText).not.toContain("Subject Definition");
    expect(promptText).not.toContain("@Image1");
    expect(promptText).not.toContain("— @Image");
  });
});

describe("runShotGenerationCore — SHOTPROMPT.REFS.1, images assigned per node without a Dynamic Batch node", () => {
  it("declares exactly one @ImageN line per node actually assigned, in the workflow's own node order — never deduplicated by asset", async () => {
    const projectId = await insertProject(ctx, "Per-node assignment project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot", shotPrompt: "Azelle boards the shuttle." });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: TWO_IMAGE_INPUT_WORKFLOW_JSON });
    const assetId = await insertAsset(ctx, projectId, { name: "Azelle", type: "character" });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });

    // The same asset's two different reference images, each actually sent to
    // a different node — mutation 3's exact case: two real sends must
    // produce two lines, never deduplicated by asset.
    const [imgA] = await ctx.db
      .insert(ctx.schema.assetReferenceImages)
      .values({ assetId, imagePath: "uploads/reference-images/azelle-a.jpg", imageRole: "character" })
      .returning({ id: ctx.schema.assetReferenceImages.id });
    const [imgB] = await ctx.db
      .insert(ctx.schema.assetReferenceImages)
      .values({ assetId, imagePath: "uploads/reference-images/azelle-b.jpg", imageRole: "environment" })
      .returning({ id: ctx.schema.assetReferenceImages.id });

    // Node "5" comes before node "10" in the workflow's own (ascending
    // numeric) order, regardless of the JSON's own key order above.
    const result = await runShotGenerationCore(
      {
        projectId,
        sequenceId,
        shotId,
        workflowId,
        selectedImageByNodeId: {
          "10": `asset-${assetId}-${imgA.id}`,
          "5": `asset-${assetId}-${imgB.id}`,
        },
      },
      "none"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).toContain("Subject Definition:");
    // Node 5's image (imgB) is @Image1, node 10's image (imgA) is @Image2 —
    // the workflow's own node order, never DB row order.
    const image1Index = promptText!.indexOf("@Image1");
    const image2Index = promptText!.indexOf("@Image2");
    expect(image1Index).toBeGreaterThanOrEqual(0);
    expect(image2Index).toBeGreaterThan(image1Index);
    // Two lines for the same asset — never collapsed into one.
    const azelleLineCount = promptText!.split("\n").filter((line) => line.startsWith("Azelle (character) —")).length;
    expect(azelleLineCount).toBe(2);
  });
});
