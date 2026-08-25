import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertAsset,
  insertComfyWorkflow,
  insertGenerationJob,
  readShotReferenceImages,
} from "./helpers/fixtures";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// REFROLE.INTENT.1 §4 filet — "a render is not a keyframe":
//
//   - a generation output saved as a Shot or Asset reference must no longer
//     carry `imageRole: "keyframe"` (it must carry no role at all, inviting
//     the author to classify it — never a guessed role);
//   - a captured video frame (shotReferenceImages.ts's own insert, untouched
//     by this ticket) must still carry `imageRole: "keyframe"`, exactly as
//     before.
//
// Real files are written under `public/outputs/jobs/<jobId>/` (the same
// convention `tests/comfy/selectedOutputs.test.ts` uses) because the action
// under test both copies real bytes and writes a real row.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let attachOutputAsShotReference: typeof import("@/actions/generation")["attachOutputAsShotReference"];
let attachOutputAsAssetReference: typeof import("@/actions/generation")["attachOutputAsAssetReference"];
let captureVideoFrame: typeof import("@/actions/shotReferenceImages")["captureVideoFrame"];

const jobOutputDirs: string[] = [];
const copiedReferenceDirs: string[] = [];

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function writeJobOutput(jobId: number, filename: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "outputs", "jobs", String(jobId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), "not-a-real-image");
  jobOutputDirs.push(dir);
  return `outputs/jobs/${jobId}/${filename}`;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ attachOutputAsShotReference, attachOutputAsAssetReference } = await import("@/actions/generation"));
  ({ captureVideoFrame } = await import("@/actions/shotReferenceImages"));
});

afterAll(async () => {
  for (const dir of jobOutputDirs) await fs.rm(dir, { recursive: true, force: true });
  for (const dir of copiedReferenceDirs) await fs.rm(dir, { recursive: true, force: true });
  ctx.cleanup();
});

describe("attachOutputAsShotReference — REFROLE.INTENT.1", () => {
  it("attaches a generation output with no imageRole ('keyframe' is no longer written)", async () => {
    const workflowId = await insertComfyWorkflow(ctx);
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const outputPath = await writeJobOutput(1001, "refrole-shot-output.png");
    const jobId = await insertGenerationJob(ctx, workflowId, { shotId, status: "done", outputPath });
    copiedReferenceDirs.push(path.join(process.cwd(), "public", "uploads", "reference-images", `shot-${shotId}`));

    await captureRedirect(() =>
      attachOutputAsShotReference(
        formData({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotId: String(shotId),
          jobId: String(jobId),
        })
      )
    );

    const rows = await readShotReferenceImages(ctx, shotId);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Generated Output");
    expect(rows[0].imageRole).toBeNull();
  });
});

describe("attachOutputAsAssetReference — REFROLE.INTENT.1", () => {
  it("attaches a generation output with no imageRole ('keyframe' is no longer written)", async () => {
    const workflowId = await insertComfyWorkflow(ctx);
    const projectId = await insertProject(ctx);
    const assetId = await insertAsset(ctx, projectId);
    const outputPath = await writeJobOutput(1002, "refrole-asset-output.png");
    const jobId = await insertGenerationJob(ctx, workflowId, { assetId, status: "done", outputPath });
    copiedReferenceDirs.push(path.join(process.cwd(), "public", "uploads", "reference-images", `asset-${assetId}`));

    await captureRedirect(() =>
      attachOutputAsAssetReference(
        formData({
          projectId: String(projectId),
          assetId: String(assetId),
          jobId: String(jobId),
        })
      )
    );

    const rows = await ctx.db
      .select()
      .from(ctx.schema.assetReferenceImages)
      .where(eq(ctx.schema.assetReferenceImages.assetId, assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Generated Output");
    expect(rows[0].imageRole).toBeNull();
  });
});

describe("captureVideoFrame — a captured video frame still carries imageRole 'keyframe', untouched by REFROLE.INTENT.1", () => {
  it("attaching a captured frame to a Shot writes imageRole: 'keyframe'", async () => {
    const projectId = await insertProject(ctx);
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);
    const imageFile = new File([Buffer.from("not-a-real-image")], "frame.png", { type: "image/png" });

    const result = await captureVideoFrame({
      projectId,
      sourceShotId: shotId,
      sourceSequenceId: sequenceId,
      imageFile,
      frameNumber: 3,
      destination: { type: "shot", shotId, sequenceId },
    });
    expect(result.ok).toBe(true);
    if (result.ok) copiedReferenceDirs.push(path.dirname(path.join(process.cwd(), "public", result.imagePath)));

    const rows = await readShotReferenceImages(ctx, shotId);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Captured Frame");
    expect(rows[0].imageRole).toBe("keyframe");
  });
});
