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
      // REFROLE.MVP.1 — general roles from the shared catalogue
      // (src/lib/referenceImageRoles.ts). TypeScript-level widening only.
      "storyboard_frame",
      "continuity_anchor",
      "camera",
      "motion",
      "rhythm",
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
    // GEN.SEEDANCE.3 — "first_frame"/"last_frame" added; REFROLE.MVP.1 —
    // remaining general roles from the shared catalogue
    // (src/lib/referenceImageRoles.ts) added. TypeScript-level widening
    // only (no DB CHECK constraint on this column); no migration.
    enum: [
      "reference",
      "keyframe",
      "style",
      "lighting",
      "character",
      "environment",
      "first_frame",
      "last_frame",
      "storyboard_frame",
      "continuity_anchor",
      "camera",
      "motion",
      "rhythm",
      "other",
    ],
  }),
  notes: text("notes"),
  /** SEQGEN.STORYBOARD.EXTRACT.1-FIX2 — set only when this reference shares its file with a `storyboard_images` draft (e.g. an extracted panel auto-added as a Shot reference); null for every manually-uploaded/captured reference. Set-null on delete: losing the draft row never deletes this reference or its file — deletion safety is re-checked against `storyboard_images.image_path` directly at delete time, not solely via this column. */
  sourceStoryboardImageId: int("source_storyboard_image_id").references(() => storyboardImages.id, {
    onDelete: "set null",
  }),
  /** SEQGEN.PUSH.2 — set only for a `first_frame` row auto-extracted from a pushed `shot_video_candidates` clip; null for every manually-uploaded/captured reference (mirrors `sourceStoryboardImageId`'s own convention). REVISE (round 2) — deliberately NO `onDelete` clause: SQLite does not enforce a `SET NULL`/`CASCADE` action declared here for a column added via `ALTER TABLE ADD COLUMN` (confirmed via `PRAGMA foreign_key_list` — the exact same real-world characteristic `sourceStoryboardImageId` above already has, out of scope to fix here). The FK is therefore genuinely `NO ACTION`/RESTRICT: `deleteShotVideoCandidate` (`src/actions/sequenceVideoPush.ts`) MUST explicitly null out every referencing row's provenance pointer in the SAME transaction as the candidate delete — never left to a DB-level guarantee this column cannot actually provide. Unique (nullable-safe: SQLite treats NULLs as distinct) so a retried/no-op push can never create a second first-frame row for the same candidate. */
  sourceShotVideoCandidateId: int("source_shot_video_candidate_id").references(() => shotVideoCandidates.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
},
(table) => [unique("shot_reference_images_source_candidate_unique").on(table.sourceShotVideoCandidateId)]
);

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
    // SEQGEN.STORYBOARD.3 — Sequence-level generation target (a single
    // contact-sheet storyboard image spanning every Shot of a Sequence,
    // not one Shot/Asset). Application-level rule (see
    // assertSingleGenerationTarget in src/actions/generation.ts): exactly
    // one of shotId/assetId/sequenceId is set per job, never a DB CHECK
    // constraint — consistent with every other applicative-only rule in
    // this schema (e.g. "at most one approved draft" on storyboardImages).
    sequenceId: int("sequence_id")
      .references(() => sequences.id, { onDelete: "cascade" }),
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
// Storyboard image drafts (SEQGEN.STORYBOARD.2) — dedicated, durable storage
// for storyboard-generation results. Deliberately separate from both
// `shots.approvedVideoPath` (an approved Shot *video*, never a storyboard
// image) and `shot_reference_images` (user-curated references, not
// generation drafts/provenance). A Sequence is derived via `shots.shotId`
// and is intentionally not duplicated here. Multiple drafts per Shot are
// allowed; "at most one approved draft active per Shot" is an application
// rule (see approveStoryboardDraft in src/actions/storyboard.ts), not a DB
// constraint.
// ---------------------------------------------------------------------------
export const storyboardImages = sqliteTable("storyboard_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  shotId: int("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  /** The generation job this draft was captured from, if still known. Nullable: the job row itself is not required to persist forever. */
  jobId: int("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
  /** The workflow used to generate this draft, if still known. */
  workflowId: int("workflow_id").references(() => comfyWorkflows.id, { onDelete: "set null" }),
  imagePath: text("image_path").notNull(),
  status: text("status", { enum: ["draft", "approved", "rejected"] })
    .notNull()
    .default("draft"),
  /** The exact compiled prompt text at generation time — a provenance snapshot, never re-derived later. */
  promptSnapshot: text("prompt_snapshot"),
  /** JSON array of the reference images actually selected for this generation (asset/shot refId, label, role) — a provenance snapshot, not a live relation. */
  referencesSnapshot: text("references_snapshot"),
  /** SEQGEN.STORYBOARD.EXTRACT.1 — set only for a draft created by confirming a panel-extraction region; null for every other draft (generation, manual upload). Set-null on delete: losing the origin region never deletes this draft. */
  extractionRegionId: int("extraction_region_id").references(
    () => sequenceStoryboardExtractionRegions.id,
    { onDelete: "set null" }
  ),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  approvedAt: text("approved_at"),
});

export type StoryboardImage = typeof storyboardImages.$inferSelect;
export type NewStoryboardImage = typeof storyboardImages.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence Storyboard image drafts (SEQGEN.STORYBOARD.3) — the Sequence-level
// twin of `storyboardImages` above: a single contact-sheet storyboard image
// covering every Shot of a Sequence, stored at the Sequence level and never
// attached to any one Shot. Deliberately a separate table, not a reuse of
// `storyboardImages` (Shot-level) or `sequenceResults` (published editorial
// video output) — same reasoning as that table's own header comment.
// Multiple drafts per Sequence are allowed by design ("conserver plusieurs
// versions"); nothing here auto-approves or auto-replaces an existing draft.
// ---------------------------------------------------------------------------
export const sequenceStoryboardImages = sqliteTable("sequence_storyboard_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  sequenceId: int("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  /** The generation job this draft was captured from, if still known. Nullable: the job row itself is not required to persist forever. */
  jobId: int("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
  /** The workflow used to generate this draft, if still known. */
  workflowId: int("workflow_id").references(() => comfyWorkflows.id, { onDelete: "set null" }),
  imagePath: text("image_path").notNull(),
  status: text("status", { enum: ["draft", "approved", "rejected"] })
    .notNull()
    .default("draft"),
  /** The exact composed Sequence Storyboard prompt text at generation time (including the @ImageN mapping and the Sequence Generation Package block) — a provenance snapshot, never re-derived later. */
  promptSnapshot: text("prompt_snapshot"),
  /** JSON array of the casting references actually selected for this generation (refId, Asset, role, in @ImageN order) — a provenance snapshot, not a live relation. */
  referencesSnapshot: text("references_snapshot"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  approvedAt: text("approved_at"),
});

export type SequenceStoryboardImage = typeof sequenceStoryboardImages.$inferSelect;
export type NewSequenceStoryboardImage = typeof sequenceStoryboardImages.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence video drafts (SEQGEN.VIDEO.1) — a single generated video covering
// the ordered Shot progression of a Sequence, generated from an explicitly
// chosen `sequenceStoryboardImages` draft via a `kind="video"` ComfyUI
// workflow. Deliberately its own table, not a reuse of `sequenceResults`
// (the published/active editorial output — see that table's own header
// comment) or `generationJobs.outputPath` (tied to the job's own lifecycle:
// deleting/retrying a job removes that file, see deleteGenerationJob). This
// is a durable, pre-split raw draft: `SEQGEN.SPLIT.1` will later analyze one
// of these to detect cut candidates, and `SEQGEN.PUSH.1` will attach the
// resulting clips to Shots — neither happens here. Multiple drafts per
// Sequence are allowed by design, same as `sequenceStoryboardImages`.
// ---------------------------------------------------------------------------
export const sequenceVideoDrafts = sqliteTable("sequence_video_drafts", {
  id: int("id").primaryKey({ autoIncrement: true }),
  sequenceId: int("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  /** The Sequence Storyboard contact sheet this video was generated from — the mandatory visual anchor. Set-null on delete: `deleteSequenceStoryboardImage` explicitly blocks deleting a draft still referenced here (mirrors the existing `sequenceStoryboardExtractions` in-use guard), so in practice this only ever goes null if the source row is removed through some other path. */
  sourceStoryboardImageId: int("source_storyboard_image_id").references(
    () => sequenceStoryboardImages.id,
    { onDelete: "set null" }
  ),
  /** The generation job this draft was captured from, if still known. Nullable: the job row itself is not required to persist forever. */
  jobId: int("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
  /** The workflow used to generate this draft, if still known. */
  workflowId: int("workflow_id").references(() => comfyWorkflows.id, { onDelete: "set null" }),
  videoPath: text("video_path").notNull(),
  status: text("status", { enum: ["draft", "approved", "rejected"] })
    .notNull()
    .default("draft"),
  /** The exact composed Sequence Video prompt text at generation time (see buildSequenceVideoPrompt) — a provenance snapshot, never re-derived later. */
  promptSnapshot: text("prompt_snapshot"),
  /** JSON provenance of the images actually sent (the source storyboard board plus any optional casting references, in payload order) — a provenance snapshot, not a live relation. */
  referencesSnapshot: text("references_snapshot"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  approvedAt: text("approved_at"),
});

export type SequenceVideoDraft = typeof sequenceVideoDrafts.$inferSelect;
export type NewSequenceVideoDraft = typeof sequenceVideoDrafts.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence video split detection (SEQGEN.SPLIT.1) — analyzes an explicitly
// chosen `sequenceVideoDrafts` row with the already-bundled FFmpeg to propose
// cut candidates and a segment-to-Shot mapping, lets the user review/correct
// it, then persists an immutable, versioned "Split Plan" the future
// SEQGEN.PUSH.1 will consume. Mirrors the versioned-run +
// editable-child-rows architecture already established by
// `sequenceStoryboardExtractions`/`sequenceStoryboardExtractionRegions`
// below — deliberately its own pair of tables, never folded into
// `sequenceVideoDrafts` (a draft's own generation provenance, not a review
// manifest), `generationJobs` (job-lifecycle-bound, not durable/editable),
// `shots` or `sequenceResults`/the Storyboard image tables. No clip file is
// ever cut here and no Shot is ever mutated — this is purely a validated
// manifest.
// ---------------------------------------------------------------------------

export const sequenceVideoSplitRuns = sqliteTable("sequence_video_split_runs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  sequenceId: int("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  /** The source video this run analyzed. No onDelete action (defaults to RESTRICT under `PRAGMA foreign_keys=ON`, already enabled in src/db/index.ts) — a draft that is the source of any split run can never be deleted out from under it, matching the same in-use guard already enforced for `sequenceStoryboardImages` vs `sequenceVideoDrafts`/`sequenceStoryboardExtractions`. */
  sequenceVideoDraftId: int("sequence_video_draft_id")
    .notNull()
    .references(() => sequenceVideoDrafts.id),
  /** Snapshot of the draft's own `videoPath` at run creation — read-only provenance, independent of whatever the draft row says later. */
  sourceVideoPathSnapshot: text("source_video_path_snapshot").notNull(),
  sourceDurationSeconds: real("source_duration_seconds").notNull(),
  sourceFps: real("source_fps"),
  sourceWidth: int("source_width"),
  sourceHeight: int("source_height"),
  /** Detection engine identifier/version string (e.g. "ffmpeg-scene-v1") — never assume a fixed algorithm; a later engine change must remain distinguishable per run. */
  engineVersion: text("engine_version").notNull(),
  /** The exact `select='gt(scene,X)'` threshold used for this run — explicit, bounded, persisted, never hidden. */
  sceneThreshold: real("scene_threshold").notNull(),
  minSegmentDurationSeconds: real("min_segment_duration_seconds").notNull(),
  /** Free-text JSON extension point for additional detection parameters, mirroring sequenceStoryboardExtractions.paramsJson's own convention — no new column needed for future tuning knobs. */
  paramsJson: text("params_json"),
  /** Raw, unfiltered ffmpeg scene-cut candidates ([{ timestampSeconds, score }]) — kept separately from the (editable) proposed segments below so the original detection is never lost to manual corrections. */
  rawCandidatesJson: text("raw_candidates_json"),
  expectedShotCount: int("expected_shot_count").notNull(),
  /** JSON array of `shots.id` in `orderIndex` order, captured at run creation — the only reliable way to detect later that the Shot list/order changed (staleness), never guessed by re-querying at validation time. */
  expectedShotOrderSnapshot: text("expected_shot_order_snapshot").notNull(),
  status: text("status", { enum: ["detecting", "ready", "failed", "validated"] })
    .notNull()
    .default("detecting"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  validatedAt: text("validated_at"),
});

export type SequenceVideoSplitRun = typeof sequenceVideoSplitRuns.$inferSelect;
export type NewSequenceVideoSplitRun = typeof sequenceVideoSplitRuns.$inferInsert;

export const sequenceVideoSplitSegments = sqliteTable("sequence_video_split_segments", {
  id: int("id").primaryKey({ autoIncrement: true }),
  splitRunId: int("split_run_id")
    .notNull()
    .references(() => sequenceVideoSplitRuns.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull(),
  startSeconds: real("start_seconds").notNull(),
  endSeconds: real("end_seconds").notNull(),
  /** Null only for a purely manual boundary (Split/Merge) that never derived from a detected candidate. */
  confidence: real("confidence"),
  /** "scene" = derived from an FFmpeg scene-cut candidate; "timing-fallback" = no reliable candidate near this boundary, positioned from the Shot's own expected duration instead (low-confidence, clearly marked); "manual" = the user moved/created/merged this boundary directly. */
  boundaryProvenance: text("boundary_provenance", { enum: ["scene", "timing-fallback", "manual"] })
    .notNull()
    .default("scene"),
  targetShotId: int("target_shot_id").references(() => shots.id, { onDelete: "set null" }),
  /** SEQGEN.SPLIT.1 audit — refined from the ticket's suggested `mapped|skipped` to add `pending` (see claude_report.md "Ajustement du modele Lot D"): a segment exists (detected or evenly split) before any explicit mapping, exactly mirroring `sequenceStoryboardExtractionRegions.status`'s own `pending -> assigned` step. */
  status: text("status", { enum: ["pending", "mapped", "skipped"] })
    .notNull()
    .default("pending"),
  thumbnailPath: text("thumbnail_path"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type SequenceVideoSplitSegment = typeof sequenceVideoSplitSegments.$inferSelect;
export type NewSequenceVideoSplitSegment = typeof sequenceVideoSplitSegments.$inferInsert;

// ---------------------------------------------------------------------------
// Shot video candidates (SEQGEN.PUSH.1) — a physically-cut clip produced by
// pushing a `validated` Split Plan, attached to the Shot its segment was
// mapped to. Deliberately a durable candidate, never an auto-approved Shot
// output: `shots.approvedVideoPath` is the single source of truth for which
// output is "the" approved one, and a row here becomes the approved one
// ONLY by equality (`shots.approvedVideoPath === clipPath`), never by a
// duplicated boolean column that could drift out of sync.
//
// `splitSegmentId` is unique — at most one candidate per Split Segment, so a
// re-push can never silently duplicate clips for the same cut. Provenance
// beyond the immediate segment (source draft, detection run params, etc.)
// is NOT duplicated here: `splitRunId` is the source of truth, walked back
// through `sequence_video_split_runs -> sequence_video_drafts` whenever
// full provenance is needed, exactly as the ticket requires.
//
// No `onDelete` action on `shotId`/`splitRunId`/`splitSegmentId` (defaults
// to RESTRICT under `PRAGMA foreign_keys=ON`) — mirrors the same
// in-use-guard convention already used by `sequenceVideoSplitRuns.sequenceVideoDraftId`
// and `sequenceStoryboardImages`/`sequenceVideoDrafts`. Deleting a Shot,
// Split Run, or Segment that still has a candidate must go through an
// explicit application-level guard (see `deleteShot` in
// `src/actions/shots.ts`), never a raw FK error or an orphaned file.
// ---------------------------------------------------------------------------

export const shotVideoCandidates = sqliteTable(
  "shot_video_candidates",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id),
    splitRunId: int("split_run_id")
      .notNull()
      .references(() => sequenceVideoSplitRuns.id),
    splitSegmentId: int("split_segment_id")
      .notNull()
      .references(() => sequenceVideoSplitSegments.id),
    clipPath: text("clip_path").notNull(),
    /** Exact snapshot of the segment boundaries used for this cut at push time — independent of whatever the (immutable, but defensively re-read) segment row says later. */
    sourceStartSeconds: real("source_start_seconds").notNull(),
    sourceEndSeconds: real("source_end_seconds").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("shot_video_candidates_split_segment_id_unique").on(table.splitSegmentId), index("shot_video_candidates_shot_id_idx").on(table.shotId)]
);

export type ShotVideoCandidate = typeof shotVideoCandidates.$inferSelect;
export type NewShotVideoCandidate = typeof shotVideoCandidates.$inferInsert;

// ---------------------------------------------------------------------------
// Shot Storyboard thumbnail selection (SEQGEN.PUSH.2) — at most one explicit,
// durable thumbnail choice per Shot, always a `shot_reference_images` row
// (never a `storyboard_images` draft — an approved draft is a content
// approval, this is a presentation preference and the two are deliberately
// NOT conflated). `source` records whether the current selection came from
// an explicit user action (`manual`) or an automatic push
// (`automatic_push`): a `manual` selection is never overwritten by a future
// push; an existing `automatic_push` selection MAY be replaced by a newer
// push's first frame. The Storyboard grid must treat a valid row here as its
// first-priority thumbnail source, falling back to its existing legacy
// heuristic (`storyboard_images`) only when no row exists or its referenced
// image no longer does.
//
// `shotId` is UNIQUE — enforces "at most one" at the DB level, not just by
// convention. No `onDelete` action on `referenceImageId` (defaults to
// RESTRICT) — the selector row must always be explicitly cleared, in the
// SAME transaction as any Reference Image deletion that would otherwise
// orphan it (see `deleteShotReferenceImage` in
// `src/actions/shotReferenceImages.ts`), never left to a raw FK error.
// ---------------------------------------------------------------------------

export const shotStoryboardThumbnails = sqliteTable(
  "shot_storyboard_thumbnails",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    referenceImageId: int("reference_image_id")
      .notNull()
      .references(() => shotReferenceImages.id),
    source: text("source", { enum: ["manual", "automatic_push"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("shot_storyboard_thumbnails_shot_id_unique").on(table.shotId)]
);

export type ShotStoryboardThumbnail = typeof shotStoryboardThumbnails.$inferSelect;
export type NewShotStoryboardThumbnail = typeof shotStoryboardThumbnails.$inferInsert;

// ---------------------------------------------------------------------------
// Storyboard panel extraction (SEQGEN.STORYBOARD.EXTRACT.1) — detects
// bordered/gutter-separated panels in an existing `sequenceStoryboardImages`
// contact sheet, lets the user review/correct the proposed regions, then
// crops confirmed regions into Shot-level `storyboardImages` drafts. Kept
// as its own dedicated tables (not folded into `sequenceStoryboardImages`,
// which stores whole contact sheets, not per-panel provenance) so the
// source image, detection run and each region's own coordinates/status can
// be re-edited or re-extracted without losing history. Nothing here ever
// auto-approves a Shot draft or mutates `shots.approvedVideoPath`/
// `shotReferenceImages`.
// ---------------------------------------------------------------------------

export const sequenceStoryboardExtractions = sqliteTable("sequence_storyboard_extractions", {
  id: int("id").primaryKey({ autoIncrement: true }),
  sequenceId: int("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  /** The contact sheet this extraction analyzed. Nullable via set-null: the source draft can be deleted later without losing this extraction's own history. */
  sourceStoryboardImageId: int("source_storyboard_image_id").references(
    () => sequenceStoryboardImages.id,
    { onDelete: "set null" }
  ),
  /** Snapshot of the source image's relative path at detection time — kept even if the source draft row above is later deleted. */
  sourceImagePath: text("source_image_path").notNull(),
  sourceWidth: int("source_width").notNull(),
  sourceHeight: int("source_height").notNull(),
  detectionMode: text("detection_mode", { enum: ["border"] }).notNull().default("border"),
  status: text("status", {
    enum: ["detecting", "ready", "failed", "confirmed"],
  })
    .notNull()
    .default("detecting"),
  /** JSON: detection/crop parameters (e.g. padding, max cells) — a provenance snapshot, not live config. */
  paramsJson: text("params_json"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type SequenceStoryboardExtraction = typeof sequenceStoryboardExtractions.$inferSelect;
export type NewSequenceStoryboardExtraction = typeof sequenceStoryboardExtractions.$inferInsert;

export const sequenceStoryboardExtractionRegions = sqliteTable(
  "sequence_storyboard_extraction_regions",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    extractionId: int("extraction_id")
      .notNull()
      .references(() => sequenceStoryboardExtractions.id, { onDelete: "cascade" }),
    orderIndex: int("order_index").notNull().default(0),
    /** Source-image pixel space (never display/scaled space) — x/y/width/height of the full detected cell. */
    x: int("x").notNull(),
    y: int("y").notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    /** Best-effort illustration/caption split within this cell — the y-offset (from the cell's own top) where a caption band was detected, if any. Null when no reliable split was found (the full cell is used as-is). */
    illustrationHeight: int("illustration_height"),
    textSeparationDetected: int("text_separation_detected", { mode: "boolean" })
      .notNull()
      .default(false),
    confidence: real("confidence").notNull(),
    /** "grid-fallback" (SEQGEN.STORYBOARD.EXTRACT.1-FIX1) — an equal-cell grid proposed when primary detection was ambiguous; always low confidence, text-only enum change so no migration is needed (SQLite text columns carry no CHECK constraint from Drizzle). */
    detectionMode: text("detection_mode", { enum: ["border", "manual", "grid-fallback"] })
      .notNull()
      .default("border"),
    status: text("status", {
      enum: ["pending", "assigned", "skipped", "extracted"],
    })
      .notNull()
      .default("pending"),
    targetShotId: int("target_shot_id").references(() => shots.id, { onDelete: "set null" }),
    /** Set once this region has actually been cropped and copied into permanent storage. */
    cropImagePath: text("crop_image_path"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  }
);

export type SequenceStoryboardExtractionRegion = typeof sequenceStoryboardExtractionRegions.$inferSelect;
export type NewSequenceStoryboardExtractionRegion = typeof sequenceStoryboardExtractionRegions.$inferInsert;

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
