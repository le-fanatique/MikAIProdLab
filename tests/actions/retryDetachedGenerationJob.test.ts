import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, insertComfyWorkflow, insertGenerationJob } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// WF.DETACH.1 §5 — "un job détaché ne doit jamais pouvoir relancer une
// génération". `retryGenerationJob` (src/actions/generationJobs.ts) must
// refuse cleanly (never plant, never queue a generation with a null
// workflow id) for a job whose workflow has been deleted (workflowId NULL).
// ---------------------------------------------------------------------------

let ctx: TempDb;
let retryGenerationJob: typeof import("@/actions/generationJobs")["retryGenerationJob"];

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ retryGenerationJob } = await import("@/actions/generationJobs"));
});

afterAll(() => {
  ctx.cleanup();
});

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("retryGenerationJob — refuses a detached job", () => {
  it("redirects with an error and creates no new job when workflowId is null", async () => {
    const workflowId = await insertComfyWorkflow(ctx);
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const jobId = await insertGenerationJob(ctx, workflowId, { shotId, status: "failed" });

    // Detach: mirror deleteComfyWorkflow's effect directly (workflowId -> null).
    const { generationJobs } = ctx.schema;
    await ctx.db.update(generationJobs).set({ workflowId: null, workflowName: "Detached WF" }).where(eq(generationJobs.id, jobId));

    const before = await ctx.db.select().from(generationJobs);

    const target = await captureRedirect(() =>
      retryGenerationJob(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          jobId: String(jobId),
        })
      )
    );

    expect(target).toContain("retryError=");
    expect(decodeURIComponent(target)).toContain("workflow was deleted");

    const after = await ctx.db.select().from(generationJobs);
    // No new job was queued — the refusal fires before any insert.
    expect(after.length).toBe(before.length);
  });

  it("still allows a retry for a job whose workflow was never deleted (unchanged behavior)", async () => {
    const workflowId = await insertComfyWorkflow(ctx);
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const jobId = await insertGenerationJob(ctx, workflowId, { shotId, status: "failed" });

    const target = await captureRedirect(() =>
      retryGenerationJob(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          jobId: String(jobId),
        })
      )
    );

    // A live workflow proceeds past the null-workflow guard — it will still
    // fail downstream (no real ComfyUI/Style setup in this harness), but
    // NEVER with "workflow was deleted".
    expect(decodeURIComponent(target)).not.toContain("workflow was deleted");
  });
});
