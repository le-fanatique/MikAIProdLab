import { asc, eq } from "drizzle-orm";
import type { TempDb } from "./tempDb";

/**
 * Minimal row builders for the write-action tests. They insert only the
 * NOT NULL columns plus whatever the caller wants to observe, so a snapshot
 * comparison stays readable.
 */

export async function insertProject(
  { db, schema }: TempDb,
  name = "Test project"
): Promise<number> {
  const [row] = await db
    .insert(schema.projects)
    .values({ name })
    .returning({ id: schema.projects.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// PROJ.DELETE.1 — comfy_workflows / generation_jobs / shot_videos /
// shot_reference_images builders, same "insert only NOT NULL columns plus
// whatever the caller wants to observe" convention as every builder above.
// ---------------------------------------------------------------------------

export async function insertComfyWorkflow(
  { db, schema }: TempDb,
  values: Partial<typeof schema.comfyWorkflows.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.comfyWorkflows)
    .values({ name: "Workflow", kind: "video", workflowJson: "{}", ...values })
    .returning({ id: schema.comfyWorkflows.id });
  return row.id;
}

export async function insertGenerationJob(
  { db, schema }: TempDb,
  workflowId: number,
  values: Partial<typeof schema.generationJobs.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.generationJobs)
    .values({ workflowId, status: "done", ...values })
    .returning({ id: schema.generationJobs.id });
  return row.id;
}

// WF.DETACH.1 — look_tests builder, same "insert only NOT NULL columns plus
// whatever the caller wants to observe" convention as every builder above.
export async function insertLookTest(
  { db, schema }: TempDb,
  projectId: number,
  workflowId: number,
  values: Partial<typeof schema.lookTests.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.lookTests)
    .values({
      projectId,
      source: "custom",
      mode: "image",
      subject: "Test subject",
      action: "Test action",
      styleSourceKind: "working-draft",
      styleSnapshot: "{}",
      styleCompiledText: "compiled",
      workflowId,
      workflowKind: "image",
      ...values,
    })
    .returning({ id: schema.lookTests.id });
  return row.id;
}

export async function insertShotVideo(
  { db, schema }: TempDb,
  shotId: number,
  values: Partial<typeof schema.shotVideos.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.shotVideos)
    .values({ shotId, source: "generation", videoPath: "uploads/shot-videos/fixture.mp4", ...values })
    .returning({ id: schema.shotVideos.id });
  return row.id;
}

export async function insertShotReferenceImage(
  { db, schema }: TempDb,
  shotId: number,
  values: Partial<typeof schema.shotReferenceImages.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.shotReferenceImages)
    .values({ shotId, imagePath: "uploads/reference-images/fixture.jpg", ...values })
    .returning({ id: schema.shotReferenceImages.id });
  return row.id;
}

export async function insertAsset(
  { db, schema }: TempDb,
  projectId: number,
  values: Partial<typeof schema.assets.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.assets)
    .values({ projectId, name: "Asset", type: "character", ...values })
    .returning({ id: schema.assets.id });
  return row.id;
}

export async function insertSequence(
  { db, schema }: TempDb,
  projectId: number,
  values: Partial<typeof schema.sequences.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequences)
    .values({ projectId, title: "Sequence", ...values })
    .returning({ id: schema.sequences.id });
  return row.id;
}

export async function insertShot(
  { db, schema }: TempDb,
  sequenceId: number,
  values: Partial<typeof schema.shots.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.shots)
    .values({ sequenceId, title: "Shot", ...values })
    .returning({ id: schema.shots.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// IND.VIDEOSPLIT.1 — sequence_video_drafts / sequence_video_split_runs /
// sequence_video_split_segments / shot_video_candidates builders, mirroring
// the same "insert only NOT NULL columns plus whatever the caller wants to
// observe" convention above.
// ---------------------------------------------------------------------------

export async function insertSequenceVideoDraft(
  { db, schema }: TempDb,
  sequenceId: number,
  values: Partial<typeof schema.sequenceVideoDrafts.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceVideoDrafts)
    .values({ sequenceId, videoPath: "uploads/sequence-video-drafts/fixture.mp4", ...values })
    .returning({ id: schema.sequenceVideoDrafts.id });
  return row.id;
}

export async function insertSplitRun(
  { db, schema }: TempDb,
  sequenceId: number,
  sequenceVideoDraftId: number,
  values: Partial<typeof schema.sequenceVideoSplitRuns.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceVideoSplitRuns)
    .values({
      sequenceId,
      sequenceVideoDraftId,
      sourceVideoPathSnapshot: "uploads/sequence-video-drafts/fixture.mp4",
      sourceDurationSeconds: 100,
      engineVersion: "test-fixture-v1",
      sceneThreshold: 0.35,
      minSegmentDurationSeconds: 0,
      expectedShotCount: 0,
      expectedShotOrderSnapshot: "[]",
      status: "ready",
      ...values,
    })
    .returning({ id: schema.sequenceVideoSplitRuns.id });
  return row.id;
}

export async function insertSplitSegment(
  { db, schema }: TempDb,
  splitRunId: number,
  values: Partial<typeof schema.sequenceVideoSplitSegments.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceVideoSplitSegments)
    .values({
      splitRunId,
      orderIndex: 0,
      startSeconds: 0,
      endSeconds: 1,
      boundaryProvenance: "manual",
      status: "pending",
      ...values,
    })
    .returning({ id: schema.sequenceVideoSplitSegments.id });
  return row.id;
}

export async function insertShotVideoCandidate(
  { db, schema }: TempDb,
  values: {
    shotId: number;
    splitRunId: number;
    splitSegmentId: number;
  } & Partial<typeof schema.shotVideoCandidates.$inferInsert>
): Promise<number> {
  const [row] = await db
    .insert(schema.shotVideoCandidates)
    .values({
      clipPath: "uploads/shot-videos/fixture-clip.mp4",
      sourceStartSeconds: 0,
      sourceEndSeconds: 1,
      ...values,
    })
    .returning({ id: schema.shotVideoCandidates.id });
  return row.id;
}

export async function readSplitRun({ db, schema }: TempDb, runId: number) {
  const [row] = await db.select().from(schema.sequenceVideoSplitRuns).where(eq(schema.sequenceVideoSplitRuns.id, runId));
  return row;
}

export async function readSplitSegments({ db, schema }: TempDb, splitRunId: number) {
  return db
    .select()
    .from(schema.sequenceVideoSplitSegments)
    .where(eq(schema.sequenceVideoSplitSegments.splitRunId, splitRunId))
    .orderBy(asc(schema.sequenceVideoSplitSegments.orderIndex));
}

// ---------------------------------------------------------------------------
// IND.STORYBOARD.1 — sequence_storyboard_images / sequence_storyboard_extractions
// / sequence_storyboard_extraction_regions builders, same convention as the
// IND.VIDEOSPLIT.1 builders above.
// ---------------------------------------------------------------------------

export async function insertSequenceStoryboardImage(
  { db, schema }: TempDb,
  sequenceId: number,
  values: Partial<typeof schema.sequenceStoryboardImages.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceStoryboardImages)
    .values({
      sequenceId,
      imagePath: "uploads/sequence-storyboard-images/fixture.jpg",
      ...values,
    })
    .returning({ id: schema.sequenceStoryboardImages.id });
  return row.id;
}

export async function insertStoryboardExtraction(
  { db, schema }: TempDb,
  sequenceId: number,
  values: Partial<typeof schema.sequenceStoryboardExtractions.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceStoryboardExtractions)
    .values({
      sequenceId,
      sourceImagePath: "uploads/sequence-storyboard-images/fixture.jpg",
      sourceWidth: 1000,
      sourceHeight: 800,
      status: "ready",
      ...values,
    })
    .returning({ id: schema.sequenceStoryboardExtractions.id });
  return row.id;
}

export async function insertExtractionRegion(
  { db, schema }: TempDb,
  extractionId: number,
  values: Partial<typeof schema.sequenceStoryboardExtractionRegions.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceStoryboardExtractionRegions)
    .values({
      extractionId,
      orderIndex: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      confidence: 1,
      detectionMode: "border",
      status: "pending",
      ...values,
    })
    .returning({ id: schema.sequenceStoryboardExtractionRegions.id });
  return row.id;
}

export async function readExtraction({ db, schema }: TempDb, extractionId: number) {
  const [row] = await db
    .select()
    .from(schema.sequenceStoryboardExtractions)
    .where(eq(schema.sequenceStoryboardExtractions.id, extractionId));
  return row;
}

export async function readExtractionRegions({ db, schema }: TempDb, extractionId: number) {
  return db
    .select()
    .from(schema.sequenceStoryboardExtractionRegions)
    .where(eq(schema.sequenceStoryboardExtractionRegions.extractionId, extractionId))
    .orderBy(asc(schema.sequenceStoryboardExtractionRegions.orderIndex));
}

export async function readStoryboardImagesByShot({ db, schema }: TempDb, shotId: number) {
  return db.select().from(schema.storyboardImages).where(eq(schema.storyboardImages.shotId, shotId));
}

export async function readShotReferenceImages({ db, schema }: TempDb, shotId: number) {
  return db
    .select()
    .from(schema.shotReferenceImages)
    .where(eq(schema.shotReferenceImages.shotId, shotId))
    .orderBy(asc(schema.shotReferenceImages.orderIndex));
}

// ---------------------------------------------------------------------------
// IND.EDITORIAL.3 — sequence_editorial_items builders/readers, same
// convention as the IND.VIDEOSPLIT.1 / IND.STORYBOARD.1 builders above.
// ---------------------------------------------------------------------------

export async function insertEditorialItem(
  { db, schema }: TempDb,
  sequenceId: number,
  values: Partial<typeof schema.sequenceEditorialItems.$inferInsert> = {}
): Promise<number> {
  const [row] = await db
    .insert(schema.sequenceEditorialItems)
    .values({
      sequenceId,
      type: "shot",
      orderIndex: 0,
      trackIndex: 0,
      ...values,
    })
    .returning({ id: schema.sequenceEditorialItems.id });
  return row.id;
}

export async function readEditorialItems({ db, schema }: TempDb, sequenceId: number) {
  return db
    .select()
    .from(schema.sequenceEditorialItems)
    .where(eq(schema.sequenceEditorialItems.sequenceId, sequenceId))
    .orderBy(
      asc(schema.sequenceEditorialItems.trackIndex),
      asc(schema.sequenceEditorialItems.orderIndex)
    );
}

export async function readEditorialItem({ db, schema }: TempDb, itemId: number) {
  const [row] = await db
    .select()
    .from(schema.sequenceEditorialItems)
    .where(eq(schema.sequenceEditorialItems.id, itemId));
  return row;
}

// Full-row readers: the write tests compare every column, not only the field
// under test, so a collateral write cannot pass unnoticed.

export async function readAsset({ db, schema }: TempDb, assetId: number) {
  const [row] = await db.select().from(schema.assets).where(eq(schema.assets.id, assetId));
  return row;
}

export async function readSequence({ db, schema }: TempDb, sequenceId: number) {
  const [row] = await db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.id, sequenceId));
  return row;
}

export async function readShot({ db, schema }: TempDb, shotId: number) {
  const [row] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  return row;
}

export async function readProject({ db, schema }: TempDb, projectId: number) {
  const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  return row;
}
