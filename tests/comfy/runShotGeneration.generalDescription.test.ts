import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertComfyWorkflow, insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// SHOTPROMPT.DERIVE.1 — the end-to-end proof the ticket requires, on the
// exact form of tests/comfy/runShotGeneration.promptCard.test.ts: that form
// already caught a functionality that was dead on arrival (a field the
// composer read that no caller loaded). Here the risk runs the other way —
// `shot.description` is already carried by `PromptCompilationContext`
// (verified before writing this), so this test proves the wiring is real,
// not merely declared: `shot.description` reaches the prompt actually
// queued for generation, under `General Description:`, and `Action:` still
// carries `action_pitch` exactly once — the duplication this ticket removes.
//
// Same discipline as the Prompt Card test this is modelled on: only the one
// true network primitive (`queueComfyPrompt`) is doubled, everything else
// (DB, context building, composition) runs for real.
// ---------------------------------------------------------------------------

vi.mock("@/lib/comfy/comfyServerClient", () => ({
  queueComfyPrompt: vi.fn(async () => ({ prompt_id: "test-prompt-id", node_errors: {} })),
}));

let ctx: TempDb;
let runShotGenerationCore: typeof import("@/lib/comfy/runShotGeneration").runShotGenerationCore;

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

describe("runShotGenerationCore — shot.description reaches the queued prompt as its own 'General Description' part (SHOTPROMPT.DERIVE.1)", () => {
  it("queues a prompt whose General Description carries the shot's description, and whose Action carries action_pitch only once", async () => {
    const projectId = await insertProject(ctx, "General Description project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot",
      description: "Azelle steadies herself against the vibration, scans the failing consoles.",
      actionPitch: "Azelle holds her position in the collapsing reactor control room.",
      cameraSubject: "The camera follows Azelle's face from a tense mid-close framing.",
      shotPrompt: null,
    });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).toContain(
      "General Description: Azelle steadies herself against the vibration, scans the failing consoles."
    );

    // Action carries action_pitch exactly once — no dead `shotPrompt`
    // duplication (shot_prompt is null here, the report's own reproduction).
    const actionOccurrences = (
      promptText!.match(/Azelle holds her position in the collapsing reactor control room\./g) ?? []
    ).length;
    expect(actionOccurrences).toBe(1);

    // The camera prose appears only under Camera, never repeated under Action.
    expect(promptText).toContain("Camera:");
    const actionBlock = promptText!.split("Camera:")[0];
    expect(actionBlock).not.toContain("The camera follows Azelle's face from a tense mid-close framing.");
  });

  it("omits General Description entirely when the shot's description is empty", async () => {
    const projectId = await insertProject(ctx, "No description project");
    const sequenceId = await insertSequence(ctx, projectId, { title: "Sequence" });
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot",
      actionPitch: "She scans the failing consoles.",
      shotPrompt: null,
    });
    const workflowId = await insertComfyWorkflow(ctx, { kind: "image", workflowJson: MINIMAL_TEXT_WORKFLOW_JSON });

    const result = await runShotGenerationCore({ projectId, sequenceId, shotId, workflowId }, "none");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promptText = await readQueuedPromptText(result.jobId);
    expect(promptText).toBeDefined();
    expect(promptText).not.toContain("General Description:");
  });
});
