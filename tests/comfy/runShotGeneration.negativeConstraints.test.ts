import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertComfyWorkflow, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SHOT.NEGATIVE.1 — the end-to-end proof the ticket requires, on the model of
// tests/comfy/runShotGeneration.promptCard.test.ts: that test caught a field
// the schema carried and the composer read, with no caller ever loading it
// into the composition — a resolved-then-discarded value never reached at
// all. This test runs `runShotGenerationCore` for real against a disposable
// SQLite DB (its own SELECT, its own `composeShotGenerationPrompt` call), the
// exact code path a supervision review would inspect, not a hand-built stand-in.
// Only the one true network primitive (`queueComfyPrompt`) is doubled.
// ---------------------------------------------------------------------------

vi.mock("@/lib/comfy/comfyServerClient", () => ({
  queueComfyPrompt: vi.fn(async () => ({ prompt_id: "test-prompt-id", node_errors: {} })),
}));

let ctx: TempDb;
let runShotGenerationCore: typeof import("@/lib/comfy/runShotGeneration").runShotGenerationCore;
let queueComfyPrompt: ReturnType<typeof vi.fn>;

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

describe("runShotGenerationCore — a Shot's negativeConstraints reaches the composed Avoid block (SHOT.NEGATIVE.1)", () => {
  it("queues a prompt whose Avoid block carries the Shot's own exclusion", async () => {
    const projectId = await insertProject(ctx, "Negative Constraints project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot",
      shotPrompt: "Azelle boards the shuttle.",
      negativeConstraints: "no other crew member visible",
    });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(queueComfyPrompt).toHaveBeenCalledTimes(1);

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).toContain("Avoid: no other crew member visible");
  });

  it("renders no Avoid block when the Shot has no exclusion and no Style Avoid rule", async () => {
    const projectId = await insertProject(ctx, "No Negative Constraints project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, { title: "Shot", shotPrompt: "Azelle boards the shuttle." });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).not.toContain("Avoid:");
  });
});
