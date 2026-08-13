import { eq } from "drizzle-orm";
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
