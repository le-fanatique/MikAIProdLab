import { index, int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
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
  shotPrompt: text("shot_prompt"),
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
  // Asset Bible (ASSET.BIBLE.1) — optional textual guidance for the future
  // Prompt Compiler. Deliberately separate from description/notes, which
  // remain the free-form text used as the asset image generation prompt.
  visualIdentity: text("visual_identity"),
  usageRules: text("usage_rules"),
  forbiddenVariations: text("forbidden_variations"),
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

export const assetReferenceImages = sqliteTable("asset_reference_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  assetId: int("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull().default(0),
  imagePath: text("image_path").notNull(),
  sourceFilename: text("source_filename"),
  label: text("label"),
  // ASSET.BIBLE.2 — widened to the Seedance MVP role list while keeping every
  // legacy value readable (this column has no DB CHECK constraint, so
  // widening it is purely a TypeScript-level change; existing rows with a
  // legacy value are never rewritten).
  imageRole: text("image_role", {
    enum: [
      // legacy (pre-ASSET.BIBLE.2)
      "reference",
      "keyframe",
      "character",
      "environment",
      // MVP roles (ASSET.BIBLE.2) — "lighting", "style", "other" already
      // existed above and are reused as-is, not duplicated here.
      "identity",
      "full_body",
      "expression",
      "pose",
      "costume",
      "environment_view",
      "lighting",
      "prop_state",
      "style",
      // GEN.SEEDANCE.3 — First/Last Frame roles. TypeScript-level widening
      // only (this column has no DB CHECK constraint); no migration.
      "first_frame",
      "last_frame",
      "other",
    ],
  }),
  notes: text("notes"),
  // ASSET.BIBLE.2 — Seedance-specific metadata, additive and independent of
  // `label`/`notes` above.
  variantState: text("variant_state"),
  usageNotes: text("usage_notes"),
  approvedForGeneration: int("approved_for_generation", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type AssetReferenceImage = typeof assetReferenceImages.$inferSelect;
export type NewAssetReferenceImage = typeof assetReferenceImages.$inferInsert;

export const shotReferenceImages = sqliteTable("shot_reference_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  shotId: int("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull().default(0),
  imagePath: text("image_path").notNull(),
  sourceFilename: text("source_filename"),
  label: text("label"),
  imageRole: text("image_role", {
    // GEN.SEEDANCE.3 — "first_frame"/"last_frame" added, TypeScript-level
    // widening only (no DB CHECK constraint on this column); no migration.
    enum: [
      "reference",
      "keyframe",
      "style",
      "lighting",
      "character",
      "environment",
      "first_frame",
      "last_frame",
      "other",
    ],
  }),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ShotReferenceImage = typeof shotReferenceImages.$inferSelect;
export type NewShotReferenceImage = typeof shotReferenceImages.$inferInsert;

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .references(() => shots.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .references(() => assets.id, { onDelete: "cascade" }),
    workflowId: int("workflow_id")
      .notNull()
      .references(() => comfyWorkflows.id),
    status: text("status", {
      enum: ["pending", "uploading", "queued", "running", "done", "failed", "timeout"],
    })
      .notNull()
      .default("pending"),
    promptId: text("prompt_id"),
    clientId: text("client_id"),
    outputPath: text("output_path"),
    errorMessage: text("error_message"),
    // GEN.SEEDANCE.1 — serialized GenerationSnapshot (see
    // src/lib/comfy/generationSnapshot.ts): workflow id, context, selections
    // and their order, Dynamic Batch expansion info, warnings, final
    // prompt/inputs, override indication and the exact queued payload.
    // Never a binary file — text/JSON only. Nullable: jobs created before
    // this ticket, and jobs that fail before a snapshot could be built,
    // simply have none.
    payloadSnapshot: text("payload_snapshot"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  }
);

export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;

// ---------------------------------------------------------------------------
// Editorial timeline items — gap-aware montage layer for a sequence.
// Shots stay the narrative/production structure; these items carry the
// editorial arrangement: order, gaps, per-occurrence trims. Time positions
// are still derived by accumulating item durations for now — startSeconds
// below is additive-only (nullable, unread) until a future backfill ticket.
// ---------------------------------------------------------------------------

export const sequenceEditorialItems = sqliteTable(
  "sequence_editorial_items",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["shot", "gap"] }).notNull(),
    shotId: int("shot_id")
      .references(() => shots.id, { onDelete: "cascade" }), // null for gap items
    orderIndex: int("order_index").notNull().default(0),
    // gap: required by future actions; shot: editorial item duration
    durationSeconds: real("duration_seconds"),
    // Trims are per editorial item (per occurrence), not per shot
    trimInSeconds: real("trim_in_seconds"),
    trimOutSeconds: real("trim_out_seconds"),
    // Single-track V1 — column reserved for future multi-track
    trackIndex: int("track_index").notNull().default(0),
    // Absolute position in seconds — additive, nullable, not yet backfilled
    // or read by any code. NULL means "not backfilled yet" (never default 0,
    // which would collide every unbackfilled item at the same position).
    startSeconds: real("start_seconds"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("sequence_editorial_items_seq_order_idx").on(
      table.sequenceId,
      table.orderIndex
    ),
  ]
);

export type SequenceEditorialItem = typeof sequenceEditorialItems.$inferSelect;
export type NewSequenceEditorialItem = typeof sequenceEditorialItems.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence results — the published, playable output of a sequence
// (SEQUENCE.RESULT.1, see docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md).
//
// A sequence can have several results (every publish creates a new row —
// nothing is overwritten); at most one is meant to have status "active" at
// a time (the one the viewer shows). Uniqueness of "active" is applicative,
// not DB-enforced: src/actions/sequenceResults.ts's setActiveSequenceResult
// demotes any other active row for the same sequence inside a transaction
// before promoting the target — see that file's doc comment for why a
// partial unique index was not used for V1.
//
// cutManifest/editorialSnapshot/warnings are stored as JSON-in-TEXT,
// following this schema's existing convention (comfyWorkflows.workflowJson,
// appSettings's JSON-valued keys) rather than adding new tables for what
// are, for now, small/append-only structures read as a whole.
// ---------------------------------------------------------------------------

export const sequenceResults = sqliteTable(
  "sequence_results",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    sourceMode: text("source_mode", { enum: ["basic", "advanced"] }).notNull(),
    status: text("status", {
      enum: ["draft", "published", "active", "archived", "outdated"],
    })
      .notNull()
      .default("draft"),
    videoPath: text("video_path"),
    durationSeconds: real("duration_seconds"),
    // JSON: SequenceResultCutManifest — see src/types/sequenceResult.ts
    cutManifest: text("cut_manifest"),
    // JSON: EditorialSnapshot (src/lib/editorial/editorialSnapshot.ts) this
    // result was built from — lets a future staleness check compare this
    // result's source structure against the sequence's current one.
    editorialSnapshot: text("editorial_snapshot"),
    notes: text("notes"),
    // JSON: string[]
    warnings: text("warnings"),
    publishedAt: text("published_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("sequence_results_sequence_idx").on(table.sequenceId, table.status),
  ]
);

export type SequenceResult = typeof sequenceResults.$inferSelect;
export type NewSequenceResult = typeof sequenceResults.$inferInsert;

// ---------------------------------------------------------------------------
// Film results — the published, playable output of a whole Project,
// assembled from its sequences' active Sequence Results
// (FILM.RESULT.1.A, see docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §2/§9's
// "Project → Sequences → Sequence Results → Film Result" vision).
//
// Same shape/conventions as sequence_results, one level up: several rows
// per project (every "create draft" is a new row), at most one meant to be
// "active" at a time (applicative uniqueness — same demote-then-promote
// transaction pattern as setActiveSequenceResult, see
// src/actions/filmResults.ts), JSON-in-TEXT for the manifest/snapshot/
// warnings columns.
//
// This ticket does not render a video — videoPath stays null until a
// future FILM.RESULT.1.B actually assembles one; a Film Result here is a
// manifest-only "draft" describing which Sequence Results *would* be used.
// ---------------------------------------------------------------------------

export const filmResults = sqliteTable(
  "film_results",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["draft", "published", "active", "archived", "outdated"],
    })
      .notNull()
      .default("draft"),
    videoPath: text("video_path"),
    durationSeconds: real("duration_seconds"),
    // JSON: FilmResultManifest — see src/types/filmResult.ts
    sequenceResultManifest: text("sequence_result_manifest"),
    // JSON: FilmProjectSnapshot — a fingerprint of which Sequence Results
    // (by id/status) this Film Result was built from, for a future
    // staleness check analogous to OPENREEL.CONFLICT.1's editorialSnapshot.
    projectSnapshot: text("project_snapshot"),
    notes: text("notes"),
    // JSON: string[]
    warnings: text("warnings"),
    publishedAt: text("published_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("film_results_project_idx").on(table.projectId, table.status),
  ]
);

export type FilmResult = typeof filmResults.$inferSelect;
export type NewFilmResult = typeof filmResults.$inferInsert;
