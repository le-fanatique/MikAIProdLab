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
