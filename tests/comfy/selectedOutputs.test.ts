import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertComfyWorkflow, insertGenerationJob } from "../actions/helpers/fixtures";

// ---------------------------------------------------------------------------
// GEN.MULTIOUT.1 (G4) — turning a checkbox selection into validated paths.
//
// The rule under test: every selected path is re-checked individually, exactly
// as the single-output path was. There is no "the job is valid, so its files
// are" shortcut — the rows come from the poller, but the extension and the
// file on disk are facts re-established at the moment of use.
//
// Real files are written under `public/outputs/jobs/<jobId>/` and removed
// afterwards, because "does this exist on disk" is half of what is proven.
// ---------------------------------------------------------------------------

const ASSET_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

let ctx: TempDb;
let resolveSelectedOutputPaths: typeof import("@/lib/comfy/selectedOutputs").resolveSelectedOutputPaths;
let parseRequestedIndexes: typeof import("@/lib/comfy/selectedOutputs").parseRequestedIndexes;

let jobId: number;
let otherJobId: number;
let jobDir: string;
/** Files written outside the outputs root by the confinement test. */
const escapeTargets: string[] = [];
/** Extra jobs created inside tests, cleaned up with their folders. */
const orderJobIds: number[] = [];

async function addOutput(id: number, index: number, filename: string, onDisk = true) {
  const relative = `outputs/jobs/${id}/${filename}`;
  await ctx.db.insert(ctx.schema.generationJobOutputs).values({
    jobId: id,
    outputIndex: index,
    path: relative,
    kind: "image",
    sourceFilename: `comfy-${index}.png`,
  });
  if (onDisk) {
    const dir = path.join(process.cwd(), "public", "outputs", "jobs", String(id));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), "not-a-real-image");
  }
  return relative;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ resolveSelectedOutputPaths, parseRequestedIndexes } = await import("@/lib/comfy/selectedOutputs"));

  const workflowId = await insertComfyWorkflow(ctx);
  jobId = await insertGenerationJob(ctx, workflowId, { status: "done" });
  otherJobId = await insertGenerationJob(ctx, workflowId, { status: "done" });
  jobDir = path.join(process.cwd(), "public", "outputs", "jobs", String(jobId));

  await addOutput(jobId, 0, "multiout-test-0.png");
  await addOutput(jobId, 1, "multiout-test-1.png");
  await addOutput(jobId, 2, "multiout-test-2.png");
  await addOutput(jobId, 3, "multiout-test-3.png");
  await addOutput(otherJobId, 0, "multiout-other-0.png");
});

afterAll(async () => {
  await fs.rm(jobDir, { recursive: true, force: true });
  await fs.rm(path.join(process.cwd(), "public", "outputs", "jobs", String(otherJobId)), {
    recursive: true,
    force: true,
  });
  for (const id of orderJobIds) {
    await fs.rm(path.join(process.cwd(), "public", "outputs", "jobs", String(id)), {
      recursive: true,
      force: true,
    });
  }
  for (const file of escapeTargets) await fs.rm(file, { force: true });
  ctx.cleanup();
});

describe("resolveSelectedOutputPaths", () => {
  it("returns the selected files, always in index order", async () => {
    // Deliberately requested out of order: the gallery's order is the batch
    // order, and the attachment must not depend on click order.
    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: `outputs/jobs/${jobId}/multiout-test-0.png`,
      requestedIndexes: [3, 0, 2],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({
      ok: true,
      paths: [
        `outputs/jobs/${jobId}/multiout-test-0.png`,
        `outputs/jobs/${jobId}/multiout-test-2.png`,
        `outputs/jobs/${jobId}/multiout-test-3.png`,
      ],
    });
  });

  it("falls back to the primary output when nothing was selected", async () => {
    // What a form with no checkboxes posts — every caller that predates this
    // ticket, unchanged.
    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: `outputs/jobs/${jobId}/multiout-test-0.png`,
      requestedIndexes: [],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({ ok: true, paths: [`outputs/jobs/${jobId}/multiout-test-0.png`] });
  });

  it("refuses an empty selection on a job with no primary output", async () => {
    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({ ok: false, error: "Output path is missing." });
  });

  it("refuses an index that belongs to another job", async () => {
    // The tampering case: index 0 exists on both jobs, but the query is scoped
    // by jobId, so another job's row can never be reached from this one.
    const result = await resolveSelectedOutputPaths({
      jobId: otherJobId,
      fallbackPath: null,
      requestedIndexes: [0, 1],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({
      ok: false,
      error: "Some selected outputs no longer exist for this job.",
    });
  });

  it("refuses an index that does not exist at all", async () => {
    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [99],
      allowedExts: ASSET_EXTS,
    });

    expect(result.ok).toBe(false);
  });

  it("refuses a file whose extension is not attachable", async () => {
    const relative = await addOutput(jobId, 10, "multiout-test-10.mp4");
    expect(relative).toContain(".mp4");

    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [10],
      allowedExts: ASSET_EXTS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Only image outputs");
  });

  it("refuses a row whose file is gone from disk", async () => {
    await addOutput(jobId, 11, "multiout-test-11.png", false);

    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [11],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({ ok: false, error: "Output file not found on disk." });
  });

  it("refuses a stored path that escapes the outputs root", async () => {
    // Defence in depth: nothing writes such a row today, and the check exists
    // so that a future writer — or a hand-edited database — cannot turn this
    // into an arbitrary file copy.
    await ctx.db.insert(ctx.schema.generationJobOutputs).values({
      jobId,
      outputIndex: 12,
      path: "uploads/reference-images/asset-1/secret.png",
      kind: "image",
      sourceFilename: "x.png",
    });

    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [12],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({ ok: false, error: "Output path is not in the expected location." });
  });

  it("refuses a traversal that escapes to a file which really exists", async () => {
    // Added after a mutation survived: the two neighbouring tests below were
    // both caught by `fs.access` failing on a path that does not exist, so
    // removing the confinement check entirely still left them green. This one
    // points at a REAL file outside the outputs root, which makes the
    // resolve-based confinement the only thing that can refuse it.
    const escapeTarget = path.join(process.cwd(), "public", "uploads", "multiout-escape-test.png");
    await fs.mkdir(path.dirname(escapeTarget), { recursive: true });
    await fs.writeFile(escapeTarget, "outside the outputs root");
    escapeTargets.push(escapeTarget);

    await ctx.db.insert(ctx.schema.generationJobOutputs).values({
      jobId,
      outputIndex: 14,
      path: "outputs/jobs/../../uploads/multiout-escape-test.png",
      kind: "image",
      sourceFilename: "x.png",
    });

    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [14],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({ ok: false, error: "Output path is not in the expected location." });
  });

  it("orders by index, not by filename", async () => {
    // Added after a mutation survived: the fixtures above are named
    // `multiout-test-0..3`, so alphabetical order happened to match index
    // order and sorting by path passed the ordering test. These names are
    // deliberately the reverse of their indexes.
    const workflowId = await insertComfyWorkflow(ctx);
    const orderJob = await insertGenerationJob(ctx, workflowId, { status: "done" });
    orderJobIds.push(orderJob);

    await addOutput(orderJob, 0, "zzz-first.png");
    await addOutput(orderJob, 1, "mmm-second.png");
    await addOutput(orderJob, 2, "aaa-third.png");

    const result = await resolveSelectedOutputPaths({
      jobId: orderJob,
      fallbackPath: null,
      requestedIndexes: [0, 1, 2],
      allowedExts: ASSET_EXTS,
    });

    expect(result).toEqual({
      ok: true,
      paths: [
        `outputs/jobs/${orderJob}/zzz-first.png`,
        `outputs/jobs/${orderJob}/mmm-second.png`,
        `outputs/jobs/${orderJob}/aaa-third.png`,
      ],
    });
  });

  it("refuses a traversal even when it starts with the expected prefix", async () => {
    await ctx.db.insert(ctx.schema.generationJobOutputs).values({
      jobId,
      outputIndex: 13,
      path: "outputs/jobs/../../../../etc/passwd.png",
      kind: "image",
      sourceFilename: "x.png",
    });

    const result = await resolveSelectedOutputPaths({
      jobId,
      fallbackPath: null,
      requestedIndexes: [13],
      allowedExts: ASSET_EXTS,
    });

    expect(result.ok).toBe(false);
  });
});

describe("parseRequestedIndexes", () => {
  it("parses, de-duplicates and sorts", () => {
    expect(parseRequestedIndexes(["3", "0", "3", "1"])).toEqual([0, 1, 3]);
  });

  it("accepts an empty selection", () => {
    expect(parseRequestedIndexes([])).toEqual([]);
  });

  it("refuses anything that is not a non-negative integer", () => {
    expect(parseRequestedIndexes(["-1"])).toBeNull();
    expect(parseRequestedIndexes(["1.5"])).toBeNull();
    expect(parseRequestedIndexes(["abc"])).toBeNull();
    expect(parseRequestedIndexes([""])).toBeNull();
    expect(parseRequestedIndexes(["1", "oops"])).toBeNull();
  });
});
