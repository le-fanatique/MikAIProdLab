import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertAsset, insertComfyWorkflow, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// ASSET.PROMPTCARD.1 — the end-to-end proof the supervision review asked for
// after finding the exact trap this ticket exists to close: `runShotGeneration.ts`
// selected `assetVisualIdentity`/`assetUsageRules`/`assetForbiddenVariations`
// but not `promptCard`, so a card filled in the DB would never have reached the
// composed Shot prompt's Subject block — a resolved-then-discarded value, the
// very defect this chantier fixes, reintroduced by omission inside the ticket
// meant to close it.
//
// This test runs `runShotGenerationCore` for real against a disposable SQLite
// DB (its own SELECT, its own `buildPromptCompilationContext` call, its own
// `composeShotGenerationPrompt` call) — the exact code path the supervision
// review pointed at, not a hand-built stand-in of it. Only the one true
// network primitive (`queueComfyPrompt`, an HTTP POST to a ComfyUI server) is
// doubled — same discipline as `tests/lib/vramManager.test.ts`. The workflow
// carries no image node, so `prepareComfyPayloadForQueue`'s own upload path
// (also network) is never exercised, and `maybeUnloadOllamaBeforeComfy` no-ops
// on the default (unset) `local_vram_auto_management_enabled` setting — no
// second network double needed for either.
// ---------------------------------------------------------------------------

vi.mock("@/lib/comfy/comfyServerClient", () => ({
  queueComfyPrompt: vi.fn(async () => ({ prompt_id: "test-prompt-id", node_errors: {} })),
}));

let ctx: TempDb;
let runShotGenerationCore: typeof import("@/lib/comfy/runShotGeneration").runShotGenerationCore;
let queueComfyPrompt: ReturnType<typeof vi.fn>;

// A minimal, valid ComfyUI workflow JSON: one node marked "(Input)" whose
// `class_type` contains "Text" (CLIPTextEncode) and carries an `inputs.text`
// field — `parseWorkflow.ts`'s own detection rule (`detectWorkflowInputs`:
// only `_meta.title` containing "(Input)"; `classifyInputKind`: `/Text|String/i`
// on `class_type`) and `findTextInputKey`'s own rule (`"text" in inputs`).
const MINIMAL_TEXT_WORKFLOW_JSON = JSON.stringify({
  "1": {
    class_type: "CLIPTextEncode",
    _meta: { title: "Positive Prompt (Input)" },
    inputs: { text: "placeholder" },
  },
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

describe("runShotGenerationCore — a Prompt Card reaches the composed Subject block (ASSET.PROMPTCARD.1)", () => {
  it("queues a prompt whose Subject block carries the asset's Prompt Card, not the long fields", async () => {
    const projectId = await insertProject(ctx, "Prompt Card project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot", shotPrompt: "Azelle boards the shuttle." });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });
    const assetId = await insertAsset(ctx, projectId, {
      name: "Azelle",
      type: "character",
      visualIdentity: "Cropped hair, scarred jaw.",
      description: "Lead courier.",
      promptCard: "Anthropomorphic female macaque, weathered fur, calloused hands, scuffed flight jacket.",
    });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(queueComfyPrompt).toHaveBeenCalledTimes(1);

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).toContain(
      "Subject: - Azelle — character — Anthropomorphic female macaque, weathered fur, calloused hands, scuffed flight jacket."
    );
    // The trap this test exists to catch: the card replaces the long fields,
    // it does not join them.
    expect(promptText).not.toContain("Cropped hair, scarred jaw.");
    expect(promptText).not.toContain("Lead courier.");
  });

  it("falls back to visualIdentity/description, unchanged, when the asset has no Prompt Card", async () => {
    const projectId = await insertProject(ctx, "No Prompt Card project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot", shotPrompt: "Azelle boards the shuttle." });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });
    const assetId = await insertAsset(ctx, projectId, {
      name: "Azelle",
      type: "character",
      visualIdentity: "Cropped hair, scarred jaw.",
      description: "Lead courier.",
    });
    await ctx.db.insert(ctx.schema.shotAssets).values({ shotId, assetId });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toContain("Subject: - Azelle — character — Cropped hair, scarred jaw. — Lead courier.");
  });
});
