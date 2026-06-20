import { int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const projects = sqliteTable("projects", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pitch: text("pitch"),
  story: text("story"),
  description: text("description"),
  status: text("status", { enum: ["draft", "active", "archived"] })
    .notNull()
    .default("draft"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const sequences = sqliteTable("sequences", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"),
  description: text("description"),
  narrativePurpose: text("narrative_purpose"),
  mood: text("mood"),
  locationHint: text("location_hint"),
  orderIndex: int("order_index").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const shots = sqliteTable("shots", {
  id: int("id").primaryKey({ autoIncrement: true }),
  sequenceId: int("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  shotCode: text("shot_code"),
  title: text("title").notNull(),
  description: text("description"),
  durationSeconds: real("duration_seconds"),
  actionPitch: text("action_pitch"),
  cameraPitch: text("camera_pitch"),
  continuityNotes: text("continuity_notes"),
  framing: text("framing"),
  cameraMovement: text("camera_movement"),
  continuityIn: text("continuity_in"),
  continuityOut: text("continuity_out"),
  orderIndex: int("order_index").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const assets = sqliteTable("assets", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["character", "environment", "prop", "vehicle", "crowd", "other"],
  }).notNull(),
  description: text("description"),
  notes: text("notes"),
  orderIndex: int("order_index").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const shotAssets = sqliteTable(
  "shot_assets",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("shot_asset_uniq").on(table.shotId, table.assetId)]
);

export const sequenceAssets = sqliteTable(
  "sequence_assets",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("sequence_asset_uniq").on(table.sequenceId, table.assetId)]
);

export const motionBeats = sqliteTable("motion_beats", {
  id: int("id").primaryKey({ autoIncrement: true }),
  shotId: int("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull().default(0),
  beatType: text("beat_type", {
    enum: ["action", "camera", "performance", "transition", "continuity", "other"],
  }).notNull(),
  label: text("label").notNull(),
  description: text("description"),
  timingPosition: text("timing_position", {
    enum: ["start", "middle", "end"],
  }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const promptSegments = sqliteTable("prompt_segments", {
  id: int("id").primaryKey({ autoIncrement: true }),
  shotId: int("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull().default(0),
  label: text("label").notNull(),
  promptText: text("prompt_text").notNull(),
  startSeconds: real("start_seconds"),
  durationSeconds: real("duration_seconds"),
  segmentType: text("segment_type", {
    enum: ["shot", "action", "camera", "transition", "other"],
  }),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ShotAsset = typeof shotAssets.$inferSelect;
export type NewShotAsset = typeof shotAssets.$inferInsert;
export type SequenceAsset = typeof sequenceAssets.$inferSelect;
export type NewSequenceAsset = typeof sequenceAssets.$inferInsert;
export type MotionBeat = typeof motionBeats.$inferSelect;
export type NewMotionBeat = typeof motionBeats.$inferInsert;
export type PromptSegment = typeof promptSegments.$inferSelect;
export type NewPromptSegment = typeof promptSegments.$inferInsert;

export const comfyWorkflows = sqliteTable("comfy_workflows", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  description: text("description"),
  workflowJson: text("workflow_json").notNull(),
  sourceFilename: text("source_filename"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ComfyWorkflow = typeof comfyWorkflows.$inferSelect;
export type NewComfyWorkflow = typeof comfyWorkflows.$inferInsert;
