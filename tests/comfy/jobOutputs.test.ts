import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertComfyWorkflow, insertGenerationJob } from "../actions/helpers/fixtures";
import type { ComfyOutputFileWithKind } from "@/lib/comfy/comfyServerClient";

// ---------------------------------------------------------------------------
// GEN.MULTIOUT.1 (G2) — recording every file a job produced.
//
// Modelled on job 544: four images on one node, of which MikAI kept one. The
// download is injected, so what is proven here is the orchestration — the
// ordering, the gap left by a failed sibling, the concurrency behaviour — and
// not the transport, which differs between local and Cloud.
//
// The rule that shapes most of it: a sibling that cannot be fetched must never
// fail a job whose primary output is already published and valid.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let downloadAndRecordJobOutputs: typeof import("@/lib/comfy/jobOutputs").downloadAndRecordJobOutputs;
let workflowId: number;
let jobId: number;

function img(filename: string): ComfyOutputFileWithKind {
  return { filename, subfolder: "", type: "output", kind: "image" };
}

/** The real shape of job 544, filenames shortened. */
const JOB_544_FILES = [
  img("1cb75e72.png"),
  img("306a7a3c.png"),
  img("3576b98f.png"),
  img("36f6d5f8.png"),
];

async function readRows(id: number) {
  const { generationJobOutputs } = ctx.schema;
  return ctx.db
    .select()
    .from(generationJobOutputs)
    .where(eq(generationJobOutputs.jobId, id))
    .orderBy(generationJobOutputs.outputIndex);
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ downloadAndRecordJobOutputs } = await import("@/lib/comfy/jobOutputs"));
  workflowId = await insertComfyWorkflow(ctx);
  jobId = await insertGenerationJob(ctx, workflowId, { status: "done" });
});

afterAll(() => ctx.cleanup());

afterEach(async () => {
  await ctx.db.delete(ctx.schema.generationJobOutputs);
});

describe("downloadAndRecordJobOutputs", () => {
  it("records the four images of a Grid2Batch job, in ComfyUI's order", async () => {
    const download = vi.fn(async (_f: ComfyOutputFileWithKind, i: number) => `outputs/jobs/${jobId}/f${i}.png`);

    const result = await downloadAndRecordJobOutputs({
      jobId,
      files: JOB_544_FILES,
      primaryPath: `outputs/jobs/${jobId}/primary.png`,
      download,
    });

    expect(result).toEqual({ recorded: 4, failures: [] });

    const rows = await readRows(jobId);
    expect(rows.map((r) => r.outputIndex)).toEqual([0, 1, 2, 3]);
    expect(rows.map((r) => r.sourceFilename)).toEqual([
      "1cb75e72.png",
      "306a7a3c.png",
      "3576b98f.png",
      "36f6d5f8.png",
    ]);
    expect(rows.every((r) => r.kind === "image")).toBe(true);
  });

  it("never re-downloads the primary — index 0 is the path it was given", async () => {
    // The caller already fetched and published it. Fetching it twice would
    // cost a second Cloud request and leave a duplicate file on disk.
    const download = vi.fn(async () => "outputs/jobs/1/other.png");

    await downloadAndRecordJobOutputs({
      jobId,
      files: JOB_544_FILES,
      primaryPath: "outputs/jobs/1/primary.png",
      download,
    });

    expect(download).toHaveBeenCalledTimes(3);
    expect(download.mock.calls.map((c) => (c as unknown[])[1])).toEqual([1, 2, 3]);

    const rows = await readRows(jobId);
    expect(rows[0].path).toBe("outputs/jobs/1/primary.png");
    expect(rows[0].outputIndex).toBe(0);
  });

  it("leaves a gap rather than renumbering when a sibling cannot be fetched", async () => {
    // The property this whole design rests on: the index is ComfyUI's
    // position, so a missing 2 stays missing. Compacting to 0,1,2 would erase
    // the evidence and claim a complete batch.
    const download = vi.fn(async (_f: ComfyOutputFileWithKind, i: number) => {
      if (i === 2) throw new Error("Comfy Cloud output download responded 404");
      return `outputs/jobs/${jobId}/f${i}.png`;
    });

    const result = await downloadAndRecordJobOutputs({
      jobId,
      files: JOB_544_FILES,
      primaryPath: "outputs/jobs/1/primary.png",
      download,
    });

    expect(result.recorded).toBe(3);
    expect(result.failures).toEqual([
      { index: 2, filename: "3576b98f.png", error: "Comfy Cloud output download responded 404" },
    ]);

    const rows = await readRows(jobId);
    expect(rows.map((r) => r.outputIndex)).toEqual([0, 1, 3]);
  });

  it("still records the primary when every sibling fails", async () => {
    const download = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await downloadAndRecordJobOutputs({
      jobId,
      files: JOB_544_FILES,
      primaryPath: "outputs/jobs/1/primary.png",
      download,
    });

    expect(result.recorded).toBe(1);
    expect(result.failures).toHaveLength(3);

    const rows = await readRows(jobId);
    expect(rows.map((r) => r.outputIndex)).toEqual([0]);
  });

  it("does not throw when a sibling fails — the job keeps its valid output", async () => {
    const download = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(
      downloadAndRecordJobOutputs({
        jobId,
        files: JOB_544_FILES,
        primaryPath: "outputs/jobs/1/primary.png",
        download,
      })
    ).resolves.toBeDefined();
  });

  it("records a single-output job as one row, which is the common case", async () => {
    const download = vi.fn(async () => "never called");

    const result = await downloadAndRecordJobOutputs({
      jobId,
      files: [img("only.png")],
      primaryPath: "outputs/jobs/1/primary.png",
      download,
    });

    expect(result).toEqual({ recorded: 1, failures: [] });
    expect(download).not.toHaveBeenCalled();
    expect((await readRows(jobId)).map((r) => r.outputIndex)).toEqual([0]);
  });

  it("writes nothing at all when the prompt produced no file", async () => {
    const result = await downloadAndRecordJobOutputs({
      jobId,
      files: [],
      primaryPath: "outputs/jobs/1/primary.png",
      download: vi.fn(async () => "unused"),
    });

    expect(result).toEqual({ recorded: 0, failures: [] });
    expect(await readRows(jobId)).toHaveLength(0);
  });

  it("survives a second poll writing the same rows", async () => {
    // Two polls can both win their way here. The unique index on
    // (job_id, output_index) plus onConflictDoNothing makes the loser a no-op
    // instead of a crash, and the gallery keeps exactly four entries.
    const download = vi.fn(async (_f: ComfyOutputFileWithKind, i: number) => `outputs/jobs/${jobId}/f${i}.png`);
    const call = () =>
      downloadAndRecordJobOutputs({
        jobId,
        files: JOB_544_FILES,
        primaryPath: "outputs/jobs/1/primary.png",
        download,
      });

    await call();
    await expect(call()).resolves.toBeDefined();

    expect((await readRows(jobId)).map((r) => r.outputIndex)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the kind ComfyUI gave, not one guessed from the extension", async () => {
    const files: ComfyOutputFileWithKind[] = [
      { filename: "clip.mp4", kind: "video" },
      { filename: "looks-like-an-image.png", kind: "video" },
    ];

    await downloadAndRecordJobOutputs({
      jobId,
      files,
      primaryPath: "outputs/jobs/1/clip.mp4",
      download: vi.fn(async () => "outputs/jobs/1/second.png"),
    });

    expect((await readRows(jobId)).map((r) => r.kind)).toEqual(["video", "video"]);
  });

  it("cascades away with its job, leaving no orphan row", async () => {
    await downloadAndRecordJobOutputs({
      jobId,
      files: JOB_544_FILES,
      primaryPath: "outputs/jobs/1/primary.png",
      download: vi.fn(async (_f: ComfyOutputFileWithKind, i: number) => `outputs/jobs/${jobId}/f${i}.png`),
    });

    const doomed = await insertGenerationJob(ctx, workflowId, { status: "done" });
    await downloadAndRecordJobOutputs({
      jobId: doomed,
      files: [img("gone.png")],
      primaryPath: "outputs/jobs/2/primary.png",
      download: vi.fn(async () => "unused"),
    });
    expect(await readRows(doomed)).toHaveLength(1);

    await ctx.db.delete(ctx.schema.generationJobs).where(eq(ctx.schema.generationJobs.id, doomed));

    expect(await readRows(doomed)).toHaveLength(0);
    // The other job's rows are untouched.
    expect(await readRows(jobId)).toHaveLength(4);
  });
});
