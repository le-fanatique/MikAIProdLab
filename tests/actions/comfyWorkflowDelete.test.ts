import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertComfyWorkflow, insertGenerationJob, insertLookTest } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// WF.DETACH.1 — `deleteComfyWorkflow` (src/actions/comfyWorkflows.ts) used to
// fail with `FOREIGN KEY constraint failed` for any workflow still
// referenced by a generation_jobs/look_tests row (29 of the author's 33 real
// workflows, 369 real generations). The author chose to DETACH rather than
// refuse or cascade: generations survive the workflow's deletion, losing the
// link but keeping the workflow's NAME (stamped at deletion time, the only
// write site for `workflow_name`).
//
// This file locks down the ONE property that makes that acceptable: nothing
// referencing the deleted workflow is lost, its `workflow_id` becomes NULL,
// and its `workflow_name` carries the deleted workflow's name. Run on a
// disposable temp SQLite DB (`setupTempDb`) — NEVER against
// `data/mikailab.db`.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let deleteComfyWorkflow: typeof import("@/actions/comfyWorkflows")["deleteComfyWorkflow"];

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ deleteComfyWorkflow } = await import("@/actions/comfyWorkflows"));
});

afterAll(() => {
  ctx.cleanup();
});

describe("deleteComfyWorkflow — detach, never cascade", () => {
  it("preserves referencing generation_jobs and look_tests rows, nulling workflow_id and stamping workflow_name", async () => {
    const workflowId = await insertComfyWorkflow(ctx, { name: "SeedanceMid", kind: "image" });
    const projectId = await insertProject(ctx, "WF.DETACH.1 project");

    const jobId1 = await insertGenerationJob(ctx, workflowId);
    const jobId2 = await insertGenerationJob(ctx, workflowId);
    const lookTestId = await insertLookTest(ctx, projectId, workflowId);

    await captureRedirect(() => deleteComfyWorkflow(workflowId));

    const { comfyWorkflows, generationJobs, lookTests } = ctx.schema;

    const [deletedWorkflow] = await ctx.db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));
    expect(deletedWorkflow).toBeUndefined();

    const [job1] = await ctx.db.select().from(generationJobs).where(eq(generationJobs.id, jobId1));
    const [job2] = await ctx.db.select().from(generationJobs).where(eq(generationJobs.id, jobId2));
    const [lookTest] = await ctx.db.select().from(lookTests).where(eq(lookTests.id, lookTestId));

    // The three rows still exist.
    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(lookTest).toBeDefined();

    // Detached: workflow_id is NULL.
    expect(job1.workflowId).toBeNull();
    expect(job2.workflowId).toBeNull();
    expect(lookTest.workflowId).toBeNull();

    // The name is preserved from the deleted workflow.
    expect(job1.workflowName).toBe("SeedanceMid");
    expect(job2.workflowName).toBe("SeedanceMid");
    expect(lookTest.workflowName).toBe("SeedanceMid");
  });

  it("leaves an unrelated workflow's own generation_jobs/look_tests row untouched", async () => {
    const deletedWorkflowId = await insertComfyWorkflow(ctx, { name: "Deleted WF", kind: "image" });
    const survivorWorkflowId = await insertComfyWorkflow(ctx, { name: "Survivor WF", kind: "image" });
    const projectId = await insertProject(ctx, "WF.DETACH.1 survivor project");

    await insertGenerationJob(ctx, deletedWorkflowId);
    const survivorJobId = await insertGenerationJob(ctx, survivorWorkflowId);
    const survivorLookTestId = await insertLookTest(ctx, projectId, survivorWorkflowId);

    await captureRedirect(() => deleteComfyWorkflow(deletedWorkflowId));

    const { comfyWorkflows, generationJobs, lookTests } = ctx.schema;

    const [survivorWorkflow] = await ctx.db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, survivorWorkflowId));
    expect(survivorWorkflow).toBeDefined();

    const [survivorJob] = await ctx.db.select().from(generationJobs).where(eq(generationJobs.id, survivorJobId));
    const [survivorLookTest] = await ctx.db.select().from(lookTests).where(eq(lookTests.id, survivorLookTestId));

    expect(survivorJob.workflowId).toBe(survivorWorkflowId);
    expect(survivorJob.workflowName).toBeNull();
    expect(survivorLookTest.workflowId).toBe(survivorWorkflowId);
    expect(survivorLookTest.workflowName).toBeNull();
  });

  it("deletes a workflow with no referencing rows without error (the pre-ticket case)", async () => {
    const workflowId = await insertComfyWorkflow(ctx, { name: "Never used", kind: "image" });

    const redirectTarget = await captureRedirect(() => deleteComfyWorkflow(workflowId));
    expect(redirectTarget).toBe("/settings/workflows");

    const { comfyWorkflows } = ctx.schema;
    const [deletedWorkflow] = await ctx.db.select().from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowId));
    expect(deletedWorkflow).toBeUndefined();
  });

  it("redirects with not_found for an unknown workflow id, mutating nothing", async () => {
    const redirectTarget = await captureRedirect(() => deleteComfyWorkflow(999_999_999));
    expect(redirectTarget).toBe("/settings/workflows?error=not_found");
  });
});
