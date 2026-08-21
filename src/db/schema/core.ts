import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const projects = sqliteTable("projects", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pitch: text("pitch"),
  story: text("story"),
  outline: text("outline"),
  description: text("description"),
  status: text("status", { enum: ["draft", "active", "archived"] })
    .notNull()
    .default("draft"),
  // UX.MEDIA.PREVIEW.1 — additive, nullable: optional decorative background
  // for this Project's navigation row. Existing rows stay null (no
  // historical value implied). `rowBackgroundOpacity` is only meaningful
  // once `rowBackgroundImagePath` is set.
  rowBackgroundImagePath: text("row_background_image_path"),
  rowBackgroundOpacity: real("row_background_opacity"),
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
  sequenceCode: text("sequence_code"),
  title: text("title").notNull(),
  summary: text("summary"),
  description: text("description"),
  narrativePurpose: text("narrative_purpose"),
  mood: text("mood"),
  locationHint: text("location_hint"),
  sequencePrompt: text("sequence_prompt"),
  // LLMW.LIGHTING.1 (B15a) — §5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md.
  // Nullable, no default. `SEQ.LIGHTING` reads this field first, and falls
  // back to this sequence's environment Asset(s) only when it is empty
  // (after trim()) — the resolver, not this column, carries that rule.
  lighting: text("lighting"),
  orderIndex: int("order_index").notNull().default(0),
  // UX.MEDIA.PREVIEW.1 — same additive contract as projects.rowBackground*.
  rowBackgroundImagePath: text("row_background_image_path"),
  rowBackgroundOpacity: real("row_background_opacity"),
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
  shotSize: text("shot_size"),
  cameraMovement: text("camera_movement"),
  // B19b — the three axes that had never been opened. Nullable, no default;
  // camera_pitch (kept, see below) remains the sole source of angle/position
  // for existing shots until B19f's LLM conversion pass.
  cameraPosition: text("camera_position"),
  movementSpeed: text("movement_speed"),
  cameraSubject: text("camera_subject"),
  continuityIn: text("continuity_in"),
  continuityOut: text("continuity_out"),
  shotPrompt: text("shot_prompt"),
  // LLMW.JAR.1 (B12a) — the narrative prompt jar (§5.3): a generated
  // narrative prompt, stored separately from `shotPrompt` because it is not
  // reproducible. Nullable, no default, never merged into `shotPrompt`.
  narrativePrompt: text("narrative_prompt"),
  // LLMW.LIGHTING.1 (B15a) — §5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md.
  // Nullable, no default: the Shot's own lighting, at the finest grain.
  lighting: text("lighting"),
  approvedVideoPath: text("approved_video_path"),
  // Non-destructive editorial trim of the approved video (seconds, nullable)
  trimInSeconds: real("trim_in_seconds"),
  trimOutSeconds: real("trim_out_seconds"),
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

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
