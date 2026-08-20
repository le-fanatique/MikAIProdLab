import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import {
  insertProject,
  insertSequence,
  insertShot,
  insertShotVideo,
  insertShotReferenceImage,
  insertComfyWorkflow,
  insertGenerationJob,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// projectDelete — PROJ.DELETE.1. `deleteProject` (src/actions/projects.ts)
// used to throw `FOREIGN KEY constraint failed` for every real Project in
// the database: eleven-plus `NO ACTION` foreign keys inside the Project
// subtree, several on columns whose `schema.ts` declaration claims
// `cascade`/`set null` but whose real DB definition is `NO ACTION` (SQLite
// does not honor an `onDelete` clause added through `ALTER TABLE ADD
// COLUMN`). This file locks down that the delete now actually completes,
// removes every row of the subtree, removes the files it OWNS, and never
// touches a file a surviving row (even outside the deleted Project) still
// needs.
//
// Real files are written under the ACTUAL repo's `public/` directory (the
// same convention already established by
// tests/actions/sequenceVideoSplit.test.ts and
// tests/actions/storyboardExtraction.test.ts) — never against
// `data/mikailab.db`, only against `tempDb`. Every family this file's
// confinement check validates by a flat root prefix (shot_videos,
// shot_reference_images) is written under a dedicated, obviously-test-only
// subfolder so it can never collide with a real production id. The ONE
// family whose confinement is genuinely job-id-scoped
// (`generation_jobs.outputPath`, confined to `outputs/jobs/<jobId>/`) is
// deliberately exercised with `outputPath: null` instead of a real file —
// writing into `outputs/jobs/<id>/` under the real `public/` tree for
// whatever small id the temp DB happens to assign would risk colliding with
// a real job's output directory. The relational fix for that column (the
// documented main NO ACTION culprit, `generation_jobs.sequence_id`) is
// still fully exercised via the DB row itself.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let deleteProject: typeof import("@/actions/projects")["deleteProject"];

const TEST_SUBFOLDER = "proj-delete-1-test";
const SHOT_VIDEOS_TEST_DIR = path.join(process.cwd(), "public", "uploads", "shot-videos", TEST_SUBFOLDER);
const REFERENCE_IMAGES_TEST_DIR = path.join(process.cwd(), "public", "uploads", "reference-images", TEST_SUBFOLDER);

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ deleteProject } = await import("@/actions/projects"));
  await mkdir(SHOT_VIDEOS_TEST_DIR, { recursive: true });
  await mkdir(REFERENCE_IMAGES_TEST_DIR, { recursive: true });
});

afterAll(async () => {
  ctx.cleanup();
  await rm(path.join(process.cwd(), "public", "uploads", "shot-videos", TEST_SUBFOLDER), { recursive: true, force: true }).catch(() => {});
  await rm(path.join(process.cwd(), "public", "uploads", "reference-images", TEST_SUBFOLDER), { recursive: true, force: true }).catch(() => {});
});

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

describe("deleteProject", () => {
  it("removes a fully populated project — every row of its subtree, and every file it owns — while a survivor file and another project stay intact", async () => {
    // --- the project to delete, populated across the FK graph ---
    const projectId = await insertProject(ctx, "Project to delete");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);

    const ownedVideoRelative = `uploads/shot-videos/${TEST_SUBFOLDER}/owned-${shotId}.mp4`;
    await writeFile(path.join(process.cwd(), "public", ownedVideoRelative), Buffer.from("owned shot video", "utf8"));
    const shotVideoId = await insertShotVideo(ctx, shotId, { videoPath: ownedVideoRelative });

    const ownedImageRelative = `uploads/reference-images/${TEST_SUBFOLDER}/owned-${shotId}.jpg`;
    await writeFile(path.join(process.cwd(), "public", ownedImageRelative), Buffer.from("owned reference image", "utf8"));
    const shotReferenceImageId = await insertShotReferenceImage(ctx, shotId, { imagePath: ownedImageRelative });

    // A generation_jobs row whose ONLY target is the Sequence — the exact,
    // documented main NO ACTION culprit (`generation_jobs.sequence_id`).
    // `outputPath: null` — see this file's own header comment for why no
    // real file is written for this family.
    const workflowId = await insertComfyWorkflow(ctx);
    const jobId = await insertGenerationJob(ctx, workflowId, { sequenceId, outputPath: null });

    // --- a survivor file: a DIFFERENT project's reference image points at
    // the exact same physical file as the deleted project's own reference
    // image above. Must NOT be deleted. ---
    const survivorProjectId = await insertProject(ctx, "Survivor project");
    const survivorSequenceId = await insertSequence(ctx, survivorProjectId);
    const survivorShotId = await insertShot(ctx, survivorSequenceId);
    const sharedRelative = `uploads/reference-images/${TEST_SUBFOLDER}/shared.jpg`;
    await writeFile(path.join(process.cwd(), "public", sharedRelative), Buffer.from("shared reference image", "utf8"));
    await insertShotReferenceImage(ctx, shotId, { imagePath: sharedRelative });
    const survivorReferenceImageId = await insertShotReferenceImage(ctx, survivorShotId, { imagePath: sharedRelative });

    expect(await fileExists(path.join(process.cwd(), "public", ownedVideoRelative))).toBe(true);
    expect(await fileExists(path.join(process.cwd(), "public", ownedImageRelative))).toBe(true);
    expect(await fileExists(path.join(process.cwd(), "public", sharedRelative))).toBe(true);

    const target = await captureRedirect(() => deleteProject(projectId));
    expect(target).toBe("/projects");

    // Every row of the deleted project's own subtree is gone.
    const { schema, db } = ctx;
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))).toHaveLength(0);
    expect(await db.select().from(schema.sequences).where(eq(schema.sequences.id, sequenceId))).toHaveLength(0);
    expect(await db.select().from(schema.shots).where(eq(schema.shots.id, shotId))).toHaveLength(0);
    expect(await db.select().from(schema.shotVideos).where(eq(schema.shotVideos.id, shotVideoId))).toHaveLength(0);
    expect(await db.select().from(schema.shotReferenceImages).where(eq(schema.shotReferenceImages.id, shotReferenceImageId))).toHaveLength(0);
    expect(await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, jobId))).toHaveLength(0);

    // Owned files are actually gone from disk.
    expect(await fileExists(path.join(process.cwd(), "public", ownedVideoRelative))).toBe(false);
    expect(await fileExists(path.join(process.cwd(), "public", ownedImageRelative))).toBe(false);

    // The survivor file, and the row outside the deleted project that
    // designates it, are both untouched.
    expect(await fileExists(path.join(process.cwd(), "public", sharedRelative))).toBe(true);
    const survivorRows = await db.select().from(schema.shotReferenceImages).where(eq(schema.shotReferenceImages.id, survivorReferenceImageId));
    expect(survivorRows).toHaveLength(1);
    expect(survivorRows[0].imagePath).toBe(sharedRelative);

    // The other project is fully intact.
    const survivorProjectRows = await db.select().from(schema.projects).where(eq(schema.projects.id, survivorProjectId));
    expect(survivorProjectRows).toHaveLength(1);
    expect(survivorProjectRows[0].name).toBe("Survivor project");
    expect(await db.select().from(schema.sequences).where(eq(schema.sequences.id, survivorSequenceId))).toHaveLength(1);
    expect(await db.select().from(schema.shots).where(eq(schema.shots.id, survivorShotId))).toHaveLength(1);
  });

  it("refuses an unconfined stored path and deletes nothing — no row, no file", async () => {
    const projectId = await insertProject(ctx, "Unconfined project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId);

    // A legitimate, confined, real file — proof that an abort elsewhere
    // never touches it either.
    const legitRelative = `uploads/reference-images/${TEST_SUBFOLDER}/legit-${shotId}.jpg`;
    await writeFile(path.join(process.cwd(), "public", legitRelative), Buffer.from("legit reference image", "utf8"));
    const legitId = await insertShotReferenceImage(ctx, shotId, { imagePath: legitRelative });

    // An unconfined stored path — never produced by the real upload path,
    // defense in depth against a corrupted/tampered row.
    const unconfinedVideoId = await insertShotVideo(ctx, shotId, { videoPath: "uploads/not-shot-videos/evil.mp4" });

    await expect(deleteProject(projectId)).rejects.toThrow(/unconfined stored path/);

    // Nothing was deleted: every row and the legitimate file survive.
    const { schema, db } = ctx;
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))).toHaveLength(1);
    expect(await db.select().from(schema.sequences).where(eq(schema.sequences.id, sequenceId))).toHaveLength(1);
    expect(await db.select().from(schema.shots).where(eq(schema.shots.id, shotId))).toHaveLength(1);
    expect(await db.select().from(schema.shotReferenceImages).where(eq(schema.shotReferenceImages.id, legitId))).toHaveLength(1);
    expect(await db.select().from(schema.shotVideos).where(eq(schema.shotVideos.id, unconfinedVideoId))).toHaveLength(1);
    expect(await fileExists(path.join(process.cwd(), "public", legitRelative))).toBe(true);
  });

  it("deletes an empty project without error", async () => {
    const projectId = await insertProject(ctx, "Empty project");
    const target = await captureRedirect(() => deleteProject(projectId));
    expect(target).toBe("/projects");
    const { schema, db } = ctx;
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))).toHaveLength(0);
  });
});
