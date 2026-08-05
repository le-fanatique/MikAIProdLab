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
    // STYLE.1.G.CORE.1 — the 4th generation target: a Look Development test
    // (never a Shot/Asset/Sequence). Same application-level "exactly one
    // target" rule as the three columns above — see
    // isSingleGenerationTarget in src/lib/comfy/generationTarget.ts, now
    // widened to this 4th column. A Look job must never be treated as a
    // Shot/Asset/Sequence job by any existing switch — every such switch
    // was audited (see claude_report.md) and either extended explicitly or
    // left alone where a Look target genuinely cannot reach it (e.g.
    // Shot-only retry/delete helpers, which a Look job never calls).
    // STYLE.1.G.CORE.1 retake: the real DB FK is NO ACTION because
    // SQLite's ALTER TABLE ADD COLUMN never emits ON DELETE from the
    // schema declaration.  Deletion is handled explicitly by
    // deleteProject's synchronous transaction.  Changing this to
    // "no action" makes schema.ts honest about the actual DB state.
    lookTestId: int("look_test_id")
      .references(() => lookTests.id, { onDelete: "no action" }),
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
    // COMFY.PROVIDER.1 — the ComfyUI runtime provider (local server vs Comfy
    // Cloud) this job was actually queued against, captured durably at
    // creation time so a later Settings switch can never make an in-flight
    // or historical job get polled/downloaded from the wrong backend.
    // Additive column, NOT NULL DEFAULT 'local': existing rows backfill to
    // 'local' automatically (they all predate Cloud support), new rows
    // always stamp the provider active at creation time explicitly — see
    // src/actions/generation.ts / sequenceGeneration.ts / sequenceVideoGeneration.ts.
    runtimeProvider: text("runtime_provider", { enum: ["local", "cloud"] })
      .notNull()
      .default("local"),
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
// Shot Videos (SHOT.VIDEO.LIBRARY.1) — a Shot's durable, unified, reusable
// video library: every video a Shot has ever produced/saved, regardless of
// whether it is currently `shots.approvedVideoPath`. `shots.approvedVideoPath`
// remains the single source of truth for which video is "the" approved one
// — a row here becomes the approved one ONLY by equality
// (`shots.approvedVideoPath === videoPath`), exactly mirroring
// `shot_video_candidates`'s own established convention. Adding a row here
// NEVER approves it automatically.
//
// Two sources, deliberately not a duplicated file-owning model:
//   - "generation": this row OWNS its own durable file
//     (`uploads/shot-videos/shot-<id>/<uuid>.<ext>`, the same convention
//     `approveVideoOutput` already used pre-ticket), copied once from a
//     `generation_jobs.outputPath` and never re-copied. `generationJobId`
//     is the provenance pointer — nullable because the source job may since
//     have been deleted (a runtime log, never required for the durable copy
//     to remain valid) or, for backfilled legacy `approvedVideoPath` rows,
//     never reconstructible at all.
//   - "sequence_split": this row NEVER owns a file — it mirrors an existing
//     `shot_video_candidates` row (the established, hardened, single owner
//     of that clip's file and its full Split Run/Segment provenance chain).
//     `sourceCandidateId` is NOT NULL for this source and is UNIQUE: exactly
//     one library row per candidate, so a re-push (already idempotent on
//     `shot_video_candidates` via its own unique `splitSegmentId`) can never
//     fan out into two library rows either. `onDelete: "cascade"` on
//     `sourceCandidateId` — deleting the candidate (via the existing,
//     unchanged `deleteShotVideoCandidate`, which already refuses an
//     approved candidate and quarantines its file) deletes this mirror row
//     in the very same transaction; there is never a library row left
//     pointing at a file that action has already removed.
//
// `videoPath` is UNIQUE across the whole table — the two sources can never
// coincidentally (or through a retried operation) register the same durable
// file twice.
// ---------------------------------------------------------------------------

export const shotVideos = sqliteTable(
  "shot_videos",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    // REVISE (round 1, finding 4) — deliberately NO `onDelete` action
    // (defaults to RESTRICT under `PRAGMA foreign_keys=ON`), NOT cascade:
    // mirrors `shot_video_candidates.shotId`'s own established convention
    // exactly, so this table is protected against EVERY path that could
    // delete a Shot row — not just `deleteShot` itself, but also a cascaded
    // delete from removing the Shot's own parent Sequence
    // (`sequences.id -> shots.sequenceId` IS cascade). `deleteShot`
    // (src/actions/shots.ts) is the explicit, atomic, user-facing guard;
    // this FK is the fail-safe that turns any path that bypasses it into a
    // clean, loud FK error instead of a silently orphaned durable file.
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id),
    source: text("source", { enum: ["generation", "sequence_split"] }).notNull(),
    videoPath: text("video_path").notNull(),
    /** Only ever set when actually probed (e.g. a Split segment's known exact boundaries) — never a guessed/derived value. Null is a legitimate, honestly-unknown state. */
    durationSeconds: real("duration_seconds"),
    /** Set only for source="generation". Nullable — see header comment. UNIQUE (nullable-safe: SQLite treats NULLs as distinct) — the DB itself, not just an app-level SELECT-before-INSERT, is what actually closes the concurrent-double-save race (REVISE round 1, finding 2): two simultaneous saves of the same job can now only ever leave one committed row, never two. */
    generationJobId: int("generation_job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    /** Set only for source="sequence_split", and unique. See header comment. */
    sourceCandidateId: int("source_candidate_id").references(() => shotVideoCandidates.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("shot_videos_video_path_unique").on(table.videoPath),
    unique("shot_videos_source_candidate_id_unique").on(table.sourceCandidateId),
    unique("shot_videos_generation_job_id_unique").on(table.generationJobId),
    index("shot_videos_shot_id_idx").on(table.shotId),
  ]
);

export type ShotVideo = typeof shotVideos.$inferSelect;
export type NewShotVideo = typeof shotVideos.$inferInsert;

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

// ---------------------------------------------------------------------------
// Project Style (STYLE.1.A) — durable Working Draft + immutable published
// version history for one Project's artistic direction.
//
// Five tables:
//   - projectStyleDrafts        — at most ONE mutable draft per Project
//                                 (DB-enforced via a unique index on
//                                 projectId, unlike sequence_results'
//                                 applicative-only "at most one active"
//                                 convention — this ticket explicitly
//                                 requires a real DB constraint here).
//                                 Carries an integer `revision`, bumped on
//                                 every mutation, for optimistic-concurrency
//                                 (no prior precedent in this schema; new
//                                 for this ticket, checked-and-incremented
//                                 inside each mutating transaction).
//   - projectStyleSections      — sparse, user-labeled "specialized
//                                 sections" per pillar (e.g. "Costume
//                                 language"), living relational rows so they
//                                 stay individually editable/orderable —
//                                 never hidden in an opaque JSON blob, per
//                                 the ticket's explicit rule for the
//                                 mutable, actively-queried draft.
//   - projectStyleRules         — atomic manual rules on the draft. Only
//                                 `instruction` is required; every other
//                                 column is optional metadata.
//   - projectStyleVersions      — one row per `Publish Style`, IMMUTABLE
//                                 (no action in this ticket ever UPDATEs or
//                                 DELETEs a row here). `contentSnapshot` is
//                                 the canonical JSON-in-TEXT snapshot of the
//                                 exact structured content at publish time
//                                 (direction brief + both pillars' sections
//                                 + rules) — the same "small, read-as-a-
//                                 whole structure" convention already used
//                                 by sequenceResults.cutManifest/
//                                 editorialSnapshot, explicitly allowed by
//                                 the ticket "en complement de champs
//                                 relationnels justifies" for an immutable
//                                 version row. `compiledText` is the exact
//                                 output of the pure compiler
//                                 (src/lib/projectStyle/compileStyleSnapshot.ts)
//                                 for that same snapshot, stored so it never
//                                 needs recomputing to display history.
//                                 versionNumber is DB-uniquely constrained
//                                 per Project (monotonic, no silent
//                                 collision).
//   - projectStyleActivePointers — the ONLY mutable row that ever changes
//                                 which version is "active" for a Project.
//                                 Kept deliberately separate from
//                                 projectStyleVersions (never a boolean
//                                 column on the version row itself) so
//                                 "change the active version" is always an
//                                 UPDATE on this one pointer row, never a
//                                 write to any version row — the mechanism
//                                 that makes "changing the active version
//                                 never mutates an old version" a structural
//                                 guarantee, not just a code convention.
//
// All five tables cascade-delete from `projects` (directly, or via
// projectStyleDrafts -> projectStyleSections/projectStyleRules), so
// deleting a Project cleans up all of its Style data automatically under
// `PRAGMA foreign_keys=ON` (already enabled in src/db/index.ts) — no
// separate cleanup action needed.
// ---------------------------------------------------------------------------

export const projectStyleDrafts = sqliteTable(
  "project_style_drafts",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    directionBrief: text("direction_brief"),
    worldGeneralDirection: text("world_general_direction"),
    worldNegativeConstraints: text("world_negative_constraints"),
    visualGeneralDirection: text("visual_general_direction"),
    visualNegativeConstraints: text("visual_negative_constraints"),
    // Optimistic-concurrency counter — every mutating action re-checks the
    // caller's `expectedRevision` against this column inside its
    // transaction and bumps it by 1 on success; a mismatch is refused
    // outright, never silently overwritten or merged.
    revision: int("revision").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_drafts_project_id_unique").on(table.projectId)]
);

export type ProjectStyleDraft = typeof projectStyleDrafts.$inferSelect;
export type NewProjectStyleDraft = typeof projectStyleDrafts.$inferInsert;

export const projectStyleSections = sqliteTable(
  "project_style_sections",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    draftId: int("draft_id")
      .notNull()
      .references(() => projectStyleDrafts.id, { onDelete: "cascade" }),
    pillar: text("pillar", { enum: ["world", "visual"] }).notNull(),
    heading: text("heading").notNull(),
    content: text("content").notNull(),
    orderIndex: int("order_index").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("project_style_sections_draft_idx").on(table.draftId, table.pillar, table.orderIndex)]
);

export type ProjectStyleSection = typeof projectStyleSections.$inferSelect;
export type NewProjectStyleSection = typeof projectStyleSections.$inferInsert;

export const projectStyleRules = sqliteTable(
  "project_style_rules",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    draftId: int("draft_id")
      .notNull()
      .references(() => projectStyleDrafts.id, { onDelete: "cascade" }),
    instruction: text("instruction").notNull(),
    pillar: text("pillar", { enum: ["world", "visual"] }),
    section: text("section"),
    category: text("category"),
    strength: text("strength", { enum: ["Required", "Preferred", "Avoid"] }),
    applicability: text("applicability"),
    provenanceNotes: text("provenance_notes"),
    // No `proposed` status here on purpose — STYLE.1.A has no candidate-rule
    // pipeline yet (that is STYLE.1.C.CORE's research-feed scope). A rule
    // this ticket creates is manual and immediately real; only its
    // inclusion in compiled output is togglable via `disabled`.
    status: text("status", { enum: ["approved", "disabled"] })
      .notNull()
      .default("approved"),
    orderIndex: int("order_index").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("project_style_rules_draft_idx").on(table.draftId, table.orderIndex)]
);

export type ProjectStyleRule = typeof projectStyleRules.$inferSelect;
export type NewProjectStyleRule = typeof projectStyleRules.$inferInsert;

export const projectStyleVersions = sqliteTable(
  "project_style_versions",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNumber: int("version_number").notNull(),
    // JSON: StyleSnapshot (src/lib/projectStyle/styleSnapshot.ts) — the
    // exact structured content published, immutable from here on.
    contentSnapshot: text("content_snapshot").notNull(),
    // Exact output of compileStyleSnapshot(contentSnapshot) at publish time.
    compiledText: text("compiled_text").notNull(),
    publishedAt: text("published_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_versions_project_version_unique").on(table.projectId, table.versionNumber),
    index("project_style_versions_project_idx").on(table.projectId, table.versionNumber),
  ]
);

export type ProjectStyleVersion = typeof projectStyleVersions.$inferSelect;
export type NewProjectStyleVersion = typeof projectStyleVersions.$inferInsert;

export const projectStyleActivePointers = sqliteTable(
  "project_style_active_pointers",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    activeVersionId: int("active_version_id").references(() => projectStyleVersions.id, { onDelete: "set null" }),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_active_pointers_project_id_unique").on(table.projectId)]
);

export type ProjectStyleActivePointer = typeof projectStyleActivePointers.$inferSelect;
export type NewProjectStyleActivePointer = typeof projectStyleActivePointers.$inferInsert;

// ---------------------------------------------------------------------------
// Project Style — References And Influence Data (STYLE.1.B.CORE).
//
// Six tables, all Project-scoped and separate from the existing Asset/Shot
// reference-image tables (`assetReferenceImages`/`shotReferenceImages`),
// which are generation-input roles, not Style research/provenance data:
//
//   - projectStyleReferenceImages    — one uploaded Reference Board image.
//                                      Domains and consumers are relational
//                                      facts (below), never a JSON blob, per
//                                      the ticket's explicit rule.
//   - projectStyleReferenceDomains   — zero/one/many free-text analysis
//                                      domains per reference. Unique per
//                                      (referenceId, domain) — the action
//                                      layer normalizes/case-folds before
//                                      insert, this is the DB-level backstop.
//   - projectStyleReferenceConsumers — zero/one/many intended consumers per
//                                      reference, from a fixed enum. Unique
//                                      per (referenceId, consumer).
//   - projectStyleInfluences         — one Creative Influence dossier
//                                      (person/studio/work/movement).
//   - projectStyleInfluenceDomains   — zero/one/many weighted domains per
//                                      influence (primary/supporting/accent).
//                                      Unique per (influenceId, domain).
//   - projectStyleInfluenceReferences — many-to-many link from an influence
//                                      to a Project Style reference image
//                                      ("supporting references"). The action
//                                      layer verifies both rows share the
//                                      same projectId before insert — SQLite
//                                      cannot express a cross-table equality
//                                      check as a plain FK/CHECK constraint.
//                                      Unique per (influenceId, referenceId).
//
// All six cascade-delete from `projects` (directly, or via
// projectStyleReferenceImages/projectStyleInfluences -> their child rows),
// so deleting a Project removes every DB row automatically under
// `PRAGMA foreign_keys=ON`. The underlying uploaded FILES are NOT covered by
// any FK — see the explicit file-cleanup step added to `deleteProject`
// (src/actions/projects.ts) for STYLE.1.B.CORE.
// ---------------------------------------------------------------------------

export const projectStyleReferenceImages = sqliteTable("project_style_reference_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  imagePath: text("image_path").notNull(),
  sourceFilename: text("source_filename"),
  label: text("label"),
  sourceUrl: text("source_url"),
  provenanceNotes: text("provenance_notes"),
  whatInterestsMe: text("what_interests_me"),
  whatToAvoid: text("what_to_avoid"),
  approvedForAnalysis: int("approved_for_analysis", { mode: "boolean" }).notNull().default(false),
  approvedForGeneration: int("approved_for_generation", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ProjectStyleReferenceImage = typeof projectStyleReferenceImages.$inferSelect;
export type NewProjectStyleReferenceImage = typeof projectStyleReferenceImages.$inferInsert;

export const projectStyleReferenceDomains = sqliteTable(
  "project_style_reference_domains",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_reference_domains_unique").on(table.referenceId, table.domain)]
);

export type ProjectStyleReferenceDomain = typeof projectStyleReferenceDomains.$inferSelect;
export type NewProjectStyleReferenceDomain = typeof projectStyleReferenceDomains.$inferInsert;

export const projectStyleReferenceConsumers = sqliteTable(
  "project_style_reference_consumers",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    consumer: text("consumer", { enum: ["asset", "storyboard", "image", "video", "shot"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_reference_consumers_unique").on(table.referenceId, table.consumer)]
);

export type ProjectStyleReferenceConsumer = typeof projectStyleReferenceConsumers.$inferSelect;
export type NewProjectStyleReferenceConsumer = typeof projectStyleReferenceConsumers.$inferInsert;

export const projectStyleInfluences = sqliteTable("project_style_influences", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  subjectType: text("subject_type", { enum: ["person", "studio", "work", "movement"] }).notNull(),
  subjectName: text("subject_name").notNull(),
  disambiguation: text("disambiguation"),
  roleOrDiscipline: text("role_or_discipline"),
  periodOrWorks: text("period_or_works"),
  whatInterestsMe: text("what_interests_me"),
  whatToAvoid: text("what_to_avoid"),
  researchNotes: text("research_notes"),
  status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ProjectStyleInfluence = typeof projectStyleInfluences.$inferSelect;
export type NewProjectStyleInfluence = typeof projectStyleInfluences.$inferInsert;

export const projectStyleInfluenceDomains = sqliteTable(
  "project_style_influence_domains",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    weight: text("weight", { enum: ["primary", "supporting", "accent"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_influence_domains_unique").on(table.influenceId, table.domain)]
);

export type ProjectStyleInfluenceDomain = typeof projectStyleInfluenceDomains.$inferSelect;
export type NewProjectStyleInfluenceDomain = typeof projectStyleInfluenceDomains.$inferInsert;

export const projectStyleInfluenceReferences = sqliteTable(
  "project_style_influence_references",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_influence_references_unique").on(table.influenceId, table.referenceId)]
);

export type ProjectStyleInfluenceReference = typeof projectStyleInfluenceReferences.$inferSelect;
export type NewProjectStyleInfluenceReference = typeof projectStyleInfluenceReferences.$inferInsert;

// ---------------------------------------------------------------------------
// Project Style — Research Domain (STYLE.1.C.CORE).
//
// Eleven additive tables for the Research lifecycle of one Creative Influence:
//   discovered -> reviewed -> saved -> synthesized -> proposed -> approved
//
// All tables cascade-delete from `projects` (directly or via
// projectStyleInfluences -> research child rows). Influence deletion refuses
// when any saved source exists (application-level guard).
//
// All timestamps are ISO text, matching the existing Style schema convention.
// ---------------------------------------------------------------------------

export const projectStyleResearchLeases = sqliteTable(
  "project_style_research_leases",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    operation: text("operation", { enum: ["search", "synthesis"] }).notNull(),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_leases_influence_op_unique").on(table.influenceId, table.operation),
  ]
);

export type ProjectStyleResearchLease = typeof projectStyleResearchLeases.$inferSelect;
export type NewProjectStyleResearchLease = typeof projectStyleResearchLeases.$inferInsert;

export const projectStyleResearchRuns = sqliteTable(
  "project_style_research_runs",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    runNumber: int("run_number").notNull(),
    requestKey: text("request_key").notNull(),
    query: text("query").notNull(),
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull(),
    contractVersion: int("contract_version").notNull(),
    maxResults: int("max_results").notNull(),
    maxToolCalls: int("max_tool_calls").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_runs_influence_run_unique").on(table.influenceId, table.runNumber),
    unique("project_style_research_runs_influence_request_unique").on(table.influenceId, table.requestKey),
  ]
);

export type ProjectStyleResearchRun = typeof projectStyleResearchRuns.$inferSelect;
export type NewProjectStyleResearchRun = typeof projectStyleResearchRuns.$inferInsert;

export const projectStyleResearchSources = sqliteTable(
  "project_style_research_sources",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    normalizedUrl: text("normalized_url").notNull(),
    urlHash: text("url_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    title: text("title").notNull(),
    publisherHost: text("publisher_host").notNull(),
    authorOrPublisher: text("author_or_publisher"),
    sourceType: text("source_type", {
      enum: ["article", "interview", "review", "documentation", "portfolio", "other"],
    }).notNull(),
    sourceTier: text("source_tier", { enum: ["primary", "secondary", "unknown"] }).notNull(),
    boundedExcerpt: text("bounded_excerpt").notNull(),
    relevanceSummary: text("relevance_summary"),
    usefulnessRationale: text("usefulness_rationale"),
    confidence: text("confidence", { enum: ["high", "medium", "low", "unknown"] }).notNull(),
    uncertainty: text("uncertainty"),
    userNotes: text("user_notes"),
    status: text("status", { enum: ["active", "withdrawn"] }).notNull().default("active"),
    revision: int("revision").notNull().default(1),
    savedAt: text("saved_at").notNull(),
    withdrawnAt: text("withdrawn_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_sources_influence_url_evidence_unique").on(
      table.influenceId, table.urlHash, table.evidenceHash
    ),
  ]
);

export type ProjectStyleResearchSource = typeof projectStyleResearchSources.$inferSelect;
export type NewProjectStyleResearchSource = typeof projectStyleResearchSources.$inferInsert;

export const projectStyleResearchCandidates = sqliteTable(
  "project_style_research_candidates",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    runId: int("run_id")
      .notNull()
      .references(() => projectStyleResearchRuns.id, { onDelete: "cascade" }),
    ordinal: int("ordinal").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    urlHash: text("url_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    title: text("title").notNull(),
    publisherHost: text("publisher_host").notNull(),
    authorOrPublisher: text("author_or_publisher"),
    sourceType: text("source_type", {
      enum: ["article", "interview", "review", "documentation", "portfolio", "other"],
    }).notNull(),
    sourceTier: text("source_tier", { enum: ["primary", "secondary", "unknown"] }).notNull(),
    boundedExcerpt: text("bounded_excerpt").notNull(),
    relevanceSummary: text("relevance_summary"),
    usefulnessRationale: text("usefulness_rationale"),
    confidence: text("confidence", { enum: ["high", "medium", "low", "unknown"] }).notNull(),
    uncertainty: text("uncertainty"),
    state: text("state", { enum: ["pending_review", "saved", "dismissed"] }).notNull().default("pending_review"),
    decisionRevision: int("decision_revision").notNull().default(0),
    savedSourceId: int("saved_source_id").references(() => projectStyleResearchSources.id, { onDelete: "set null" }),
    decidedAt: text("decided_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_candidates_run_ordinal_unique").on(table.runId, table.ordinal),
    unique("project_style_research_candidates_run_url_evidence_unique").on(table.runId, table.urlHash, table.evidenceHash),
  ]
);

export type ProjectStyleResearchCandidate = typeof projectStyleResearchCandidates.$inferSelect;
export type NewProjectStyleResearchCandidate = typeof projectStyleResearchCandidates.$inferInsert;

export const projectStyleResearchSourceDomains = sqliteTable(
  "project_style_research_source_domains",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sourceId: int("source_id")
      .notNull()
      .references(() => projectStyleResearchSources.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_source_domains_unique").on(table.sourceId, table.domain),
  ]
);

export type ProjectStyleResearchSourceDomain = typeof projectStyleResearchSourceDomains.$inferSelect;
export type NewProjectStyleResearchSourceDomain = typeof projectStyleResearchSourceDomains.$inferInsert;

export const projectStyleResearchSyntheses = sqliteTable(
  "project_style_research_syntheses",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    versionNumber: int("version_number").notNull(),
    requestKey: text("request_key").notNull(),
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull(),
    contractVersion: int("contract_version").notNull(),
    inputSnapshot: text("input_snapshot").notNull(),
    summary: text("summary").notNull(),
    promptHash: text("prompt_hash").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_syntheses_influence_version_unique").on(table.influenceId, table.versionNumber),
    unique("project_style_research_syntheses_influence_request_unique").on(table.influenceId, table.requestKey),
  ]
);

export type ProjectStyleResearchSynthesis = typeof projectStyleResearchSyntheses.$inferSelect;
export type NewProjectStyleResearchSynthesis = typeof projectStyleResearchSyntheses.$inferInsert;

export const projectStyleResearchSynthesisSources = sqliteTable(
  "project_style_research_synthesis_sources",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    synthesisId: int("synthesis_id")
      .notNull()
      .references(() => projectStyleResearchSyntheses.id, { onDelete: "cascade" }),
    sourceId: int("source_id")
      .notNull()
      .references(() => projectStyleResearchSources.id),
    sourceRevision: int("source_revision").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_synthesis_sources_unique").on(table.synthesisId, table.sourceId),
  ]
);

export type ProjectStyleResearchSynthesisSource = typeof projectStyleResearchSynthesisSources.$inferSelect;
export type NewProjectStyleResearchSynthesisSource = typeof projectStyleResearchSynthesisSources.$inferInsert;

export const projectStyleResearchClaims = sqliteTable(
  "project_style_research_claims",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    synthesisId: int("synthesis_id")
      .notNull()
      .references(() => projectStyleResearchSyntheses.id, { onDelete: "cascade" }),
    claimKey: text("claim_key").notNull(),
    kind: text("kind", {
      enum: ["shared_trait", "limited_observation", "disagreement", "uncertainty", "project_principle"],
    }).notNull(),
    text: text("text").notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    uncertainty: text("uncertainty"),
    orderIndex: int("order_index").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_claims_synthesis_key_unique").on(table.synthesisId, table.claimKey),
    unique("project_style_research_claims_synthesis_order_unique").on(table.synthesisId, table.orderIndex),
  ]
);

export type ProjectStyleResearchClaim = typeof projectStyleResearchClaims.$inferSelect;
export type NewProjectStyleResearchClaim = typeof projectStyleResearchClaims.$inferInsert;

export const projectStyleResearchClaimSources = sqliteTable(
  "project_style_research_claim_sources",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    claimId: int("claim_id")
      .notNull()
      .references(() => projectStyleResearchClaims.id, { onDelete: "cascade" }),
    sourceId: int("source_id")
      .notNull()
      .references(() => projectStyleResearchSources.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_claim_sources_unique").on(table.claimId, table.sourceId),
  ]
);

export type ProjectStyleResearchClaimSource = typeof projectStyleResearchClaimSources.$inferSelect;
export type NewProjectStyleResearchClaimSource = typeof projectStyleResearchClaimSources.$inferInsert;

export const projectStyleResearchCandidateRules = sqliteTable(
  "project_style_research_candidate_rules",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    synthesisId: int("synthesis_id")
      .notNull()
      .references(() => projectStyleResearchSyntheses.id, { onDelete: "cascade" }),
    orderIndex: int("order_index").notNull(),
    status: text("status", { enum: ["proposed", "rejected", "approved"] }).notNull().default("proposed"),
    revision: int("revision").notNull().default(1),
    originalInstruction: text("original_instruction").notNull(),
    originalPillar: text("original_pillar", { enum: ["world", "visual"] }),
    originalSection: text("original_section"),
    originalCategory: text("original_category"),
    originalStrength: text("original_strength", { enum: ["Required", "Preferred", "Avoid"] }),
    originalApplicability: text("original_applicability"),
    instruction: text("instruction").notNull(),
    pillar: text("pillar", { enum: ["world", "visual"] }),
    section: text("section"),
    category: text("category"),
    strength: text("strength", { enum: ["Required", "Preferred", "Avoid"] }),
    applicability: text("applicability"),
    rationale: text("rationale").notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    uncertainty: text("uncertainty"),
    approvedDraftRuleId: int("approved_draft_rule_id").references(() => projectStyleRules.id, { onDelete: "set null" }),
    approvedSnapshot: text("approved_snapshot"),
    approvedAt: text("approved_at"),
    rejectedAt: text("rejected_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_candidate_rules_synthesis_order_unique").on(table.synthesisId, table.orderIndex),
  ]
);

export type ProjectStyleResearchCandidateRule = typeof projectStyleResearchCandidateRules.$inferSelect;
export type NewProjectStyleResearchCandidateRule = typeof projectStyleResearchCandidateRules.$inferInsert;

export const projectStyleResearchCandidateRuleSources = sqliteTable(
  "project_style_research_candidate_rule_sources",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    candidateRuleId: int("candidate_rule_id")
      .notNull()
      .references(() => projectStyleResearchCandidateRules.id, { onDelete: "cascade" }),
    sourceId: int("source_id")
      .notNull()
      .references(() => projectStyleResearchSources.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_research_candidate_rule_sources_unique").on(table.candidateRuleId, table.sourceId),
  ]
);

export type ProjectStyleResearchCandidateRuleSource = typeof projectStyleResearchCandidateRuleSources.$inferSelect;
export type NewProjectStyleResearchCandidateRuleSource = typeof projectStyleResearchCandidateRuleSources.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence Style Override (STYLE.1.D.CORE).
//
// One additive table: at most one override row per Sequence (DB-unique on
// sequenceId). Its presence/absence is the entire contract:
//   no row   -> Sequence resolves the Project's currently active Style
//               version dynamically, every time it is read;
//   row present -> Sequence resolves this row's own frozen contentSnapshot/
//               compiledText instead, forever, until Reset deletes the row.
// There is no partial merge and no Shot-level override — every Shot in a
// Sequence resolves exactly this same result (see
// src/lib/projectStyle/resolveSequenceStyle.ts).
//
// sourceProjectStyleVersionId is provenance only ("customized from v1") — it
// is never re-read to recompute this row's content after creation, and a
// later publish/activate on the Project never touches this row.
// ---------------------------------------------------------------------------

export const sequenceStyleOverrides = sqliteTable(
  "sequence_style_overrides",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    sourceProjectStyleVersionId: int("source_project_style_version_id")
      .notNull()
      .references(() => projectStyleVersions.id),
    // JSON: StyleSnapshot — copied byte-exactly from the source version's
    // contentSnapshot at creation time, then only ever replaced whole by an
    // explicit update, never merged field-by-field.
    contentSnapshot: text("content_snapshot").notNull(),
    // Exact output of compileStyleSnapshot(contentSnapshot) for this row's
    // own content — recomputed server-side on every update, never trusted
    // from the client.
    compiledText: text("compiled_text").notNull(),
    // Optimistic-concurrency counter — every mutating action re-checks the
    // caller's `expectedRevision` against this column inside its
    // transaction and bumps it by 1 on success; a mismatch is refused
    // outright, never silently overwritten or merged.
    revision: int("revision").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("sequence_style_overrides_sequence_id_unique").on(table.sequenceId),
    index("sequence_style_overrides_source_version_idx").on(table.sourceProjectStyleVersionId),
  ]
);

export type SequenceStyleOverride = typeof sequenceStyleOverrides.$inferSelect;
export type NewSequenceStyleOverride = typeof sequenceStyleOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// asset_style_alignments — STYLE.1.F.CORE
//
// The durable, informational-only marker for the latest explicit Asset ->
// Project Style review ("Align with Project Style"). One row per Asset
// (unique on assetId), upserted by the apply action every time a proposal
// is explicitly applied — never by generation, which performs zero writes.
//
// Deliberately does NOT store the temporary LLM proposal, the raw LLM
// response, the prompt, or any provider payload/secret — only enough to
// answer "was this exact Asset content reviewed against this exact
// (immutable) Style version, and is that still true now": the Style
// version identity and a deterministic fingerprint of the Asset's five
// editable fields as they stood right after the review (see
// src/lib/projectStyle/assetAlignment/fingerprint.ts). The read model
// (src/actions/assetAlignment.ts) compares this fingerprint and version
// against the Asset's live content and the Project's live active version to
// derive "aligned" / "style-changed" / "asset-changed" — this table never
// re-derives or caches that comparison itself.
// ---------------------------------------------------------------------------

export const assetStyleAlignments = sqliteTable(
  "asset_style_alignments",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    projectStyleVersionId: int("project_style_version_id")
      .notNull()
      .references(() => projectStyleVersions.id, { onDelete: "cascade" }),
    // Deterministic fingerprint (sha256 hex) of the Asset's five editable
    // fields exactly as they stood immediately after this review was
    // applied — never re-read/re-hashed from a later DB state.
    assetContentFingerprint: text("asset_content_fingerprint").notNull(),
    reviewedAt: text("reviewed_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("asset_style_alignments_asset_id_unique").on(table.assetId),
    index("asset_style_alignments_version_idx").on(table.projectStyleVersionId),
  ]
);

export type AssetStyleAlignment = typeof assetStyleAlignments.$inferSelect;
export type NewAssetStyleAlignment = typeof assetStyleAlignments.$inferInsert;

// ---------------------------------------------------------------------------
// look_tests / look_test_references / look_test_results — STYLE.1.G.CORE.1
//
// Look Development: test an explicit Style source (a Working Draft at an
// exact revision, or a specific immutable published version) against an
// editable subject/action, ordered Project Style references and a real
// compatible workflow — BEFORE that Style is ever published. Never creates
// or mutates an Asset, Shot or Sequence.
//
// A `look_tests` row is immutable once created (see
// src/lib/lookDevelopment/ — no update path exists for its Style
// source/subject/action/workflow; "editable" in the product spec describes
// the FORM the user fills before creating a row, not the row itself).
// Duplicating a test creates a new row copying only its definition, never
// its job/result/notes/status history — see duplicateLookTest.
//
// Working-Draft-sourced tests remain historically inspectable after the
// draft is edited, published or reset: `styleSnapshot`/`styleCompiledText`
// below are this row's OWN immutable copy, captured once at creation time,
// never re-read from the mutable draft rows later. `styleDraftRevision` is
// kept only as provenance (which revision was actually reviewed), never as
// the sole source of the compiled content.
// ---------------------------------------------------------------------------

export const lookTests = sqliteTable(
  "look_tests",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["from-story", "neutral-benchmark", "custom"] }).notNull(),
    mode: text("mode", { enum: ["image", "video"] }).notNull(),
    subject: text("subject").notNull(),
    action: text("action").notNull(),
    styleSourceKind: text("style_source_kind", { enum: ["working-draft", "published-version"] }).notNull(),
    // Set only when styleSourceKind === "working-draft" — the Working
    // Draft's `revision` (project_style_drafts.revision) at the exact
    // moment this test's snapshot was captured. Provenance only; the
    // compiled content below never depends on re-reading the draft later.
    styleDraftRevision: int("style_draft_revision"),
    // Set only when styleSourceKind === "published-version" — real FK to
    // the exact immutable version reviewed. The version itself never
    // changes, but this row still keeps its own snapshot/compiledText copy
    // below so a test stays fully inspectable even if that were ever lost.
    // Cascade: a Project delete cascades both this row (via projectId) and
    // the referenced Style version (via its own projectId). The REAL fix
    // for Project-delete's FK failure was elsewhere — see deleteProject's
    // explicit pre-delete of generation_jobs by lookTestId in
    // src/actions/projects.ts, required because
    // `generation_jobs.look_test_id` (added via `ALTER TABLE ... ADD
    // COLUMN ... REFERENCES`) never gets an `ON DELETE` clause from
    // SQLite/drizzle-kit regardless of what onDelete this schema
    // declares — see that file's own comment for the full diagnosis.
    styleVersionId: int("style_version_id").references(() => projectStyleVersions.id, { onDelete: "cascade" }),
    // JSON: StyleSnapshot (src/lib/projectStyle/styleSnapshot.ts) — this
    // row's own immutable copy, captured once at creation, byte-identical
    // to the source reviewed at that moment. Never re-derived later.
    styleSnapshot: text("style_snapshot").notNull(),
    // Exact output of compileStyleSnapshot(styleSnapshot) at creation time.
    styleCompiledText: text("style_compiled_text").notNull(),
    workflowId: int("workflow_id")
      .notNull()
      .references(() => comfyWorkflows.id),
    // Frozen at creation — the library workflow's `kind` could change
    // later; this test's own compatibility decision must never silently
    // change retroactively.
    workflowKind: text("workflow_kind", { enum: ["image", "video"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("look_tests_project_idx").on(table.projectId),
    index("look_tests_style_version_idx").on(table.styleVersionId),
  ]
);

export type LookTest = typeof lookTests.$inferSelect;
export type NewLookTest = typeof lookTests.$inferInsert;

/** Ordered, deduplicated (unique per test+reference) selection of Project Style reference images actually compiled into a test's prompt — provenance only, the images themselves are never copied or mutated. */
export const lookTestReferences = sqliteTable(
  "look_test_references",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    lookTestId: int("look_test_id")
      .notNull()
      .references(() => lookTests.id, { onDelete: "cascade" }),
    referenceImageId: int("reference_image_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "no action" }),
    orderIndex: int("order_index").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("look_test_references_test_reference_unique").on(table.lookTestId, table.referenceImageId),
    index("look_test_references_test_idx").on(table.lookTestId, table.orderIndex),
  ]
);

export type LookTestReference = typeof lookTestReferences.$inferSelect;
export type NewLookTestReference = typeof lookTestReferences.$inferInsert;

/** The durable Look Development output — never dependent solely on generation_jobs' mutable cache (its outputPath/status can be superseded by retry/cleanup). One row per generation_jobs row (UNIQUE), published only from a real "done" job — see src/lib/lookDevelopment/publishLookResult.ts. `projectId` is denormalized (never re-derived from a join) so a Project deletion cascades this row directly, with no orphaned file left behind (the same row's `filePath` is quarantined+removed by the deleting action before the row itself disappears — see the Scope E proofs). */
export const lookTestResults = sqliteTable(
  "look_test_results",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    lookTestId: int("look_test_id")
      .notNull()
      .references(() => lookTests.id, { onDelete: "cascade" }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    generationJobId: int("generation_job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    // Relative to the dedicated Look Development storage root — see
    // LOOK_DEV_STORAGE_ROOT in src/lib/lookDevelopment/paths.ts. Never
    // under the generic outputs/jobs cache directly.
    filePath: text("file_path").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["candidate", "rejected", "look-target"] })
      .notNull()
      .default("candidate"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("look_test_results_generation_job_id_unique").on(table.generationJobId),
    index("look_test_results_test_idx").on(table.lookTestId),
    index("look_test_results_project_status_idx").on(table.projectId, table.status),
  ]
);

export type LookTestResult = typeof lookTestResults.$inferSelect;
export type NewLookTestResult = typeof lookTestResults.$inferInsert;

// ---------------------------------------------------------------------------
// Project Style — Reference Board Multimodal Analysis (STYLE.1.B.ANALYSIS.CORE).
//
// Five additive tables backing the Reference Board
// "Approved for Style analysis" badge:
//   - projectStyleReferenceAnalysisRuns           — one durable, Project-scoped
//                                                    multimodal analysis Run.
//   - projectStyleReferenceAnalysisRunReferences  — frozen, ordered provenance
//                                                    of the 1..4 References a
//                                                    Run actually analyzed.
//                                                    Never pixels/base64.
//   - projectStyleReferenceAnalysisObservations   — per-image visual
//                                                    observations, reviewable
//                                                    (proposed/accepted/
//                                                    rejected), never Style
//                                                    Rules.
//   - projectStyleReferenceAnalysisCandidateRules — group-level candidate
//                                                    rules proposed by a Run,
//                                                    editable then approved/
//                                                    rejected. Same discipline
//                                                    as
//                                                    projectStyleResearchCandidateRules,
//                                                    minus any Influence/
//                                                    Synthesis FK.
//   - projectStyleReferenceAnalysisCandidateRuleReferences — many-to-many
//                                                    provenance from a
//                                                    Candidate Rule to the
//                                                    References that support
//                                                    it.
//
// All five cascade-delete from `projects` (directly, or via
// projectStyleReferenceAnalysisRuns -> its own child rows). Every FK back to
// `projectStyleReferenceImages` is `NO ACTION` — a Reference used by a Run
// cannot be deleted out from under frozen provenance; the application layer
// (`deleteProjectStyleReferenceAction`) is the primary guard, this FK is only
// the last-resort race backstop (same pattern as `lookTestReferences`).
// ---------------------------------------------------------------------------

export const projectStyleReferenceAnalysisRuns = sqliteTable(
  "project_style_reference_analysis_runs",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    contractVersion: int("contract_version").notNull(),
    // JSON: bounded input snapshot (selected reference ids/revisions/labels/
    // domains/consumers at acquisition time) — never pixels, base64 or a
    // secret.
    inputSnapshot: text("input_snapshot").notNull(),
    promptHash: text("prompt_hash").notNull(),
    summary: text("summary"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    completedAt: text("completed_at"),
  },
  (table) => [
    unique("project_style_ref_analysis_runs_project_request_unique").on(table.projectId, table.requestKey),
    index("project_style_ref_analysis_runs_project_idx").on(table.projectId),
  ]
);

export type ProjectStyleReferenceAnalysisRun = typeof projectStyleReferenceAnalysisRuns.$inferSelect;
export type NewProjectStyleReferenceAnalysisRun = typeof projectStyleReferenceAnalysisRuns.$inferInsert;

export const projectStyleReferenceAnalysisRunReferences = sqliteTable(
  "project_style_reference_analysis_run_references",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    runId: int("run_id")
      .notNull()
      .references(() => projectStyleReferenceAnalysisRuns.id, { onDelete: "cascade" }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "no action" }),
    ordinal: int("ordinal").notNull(),
    // Opaque per-Run label ("R1".."R4") the prompt/output use to identify
    // this image — never the DB id, which is never shown to the provider.
    referenceKey: text("reference_key").notNull(),
    // JSON: bounded non-sensitive snapshot (label, whatInterestsMe,
    // whatToAvoid, domains) captured at acquisition time — never pixels or
    // base64.
    referenceSnapshot: text("reference_snapshot").notNull(),
    imageSha256: text("image_sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_ref_analysis_run_refs_run_reference_unique").on(table.runId, table.referenceId),
    unique("project_style_ref_analysis_run_refs_run_ordinal_unique").on(table.runId, table.ordinal),
    unique("project_style_ref_analysis_run_refs_run_key_unique").on(table.runId, table.referenceKey),
  ]
);

export type ProjectStyleReferenceAnalysisRunReference = typeof projectStyleReferenceAnalysisRunReferences.$inferSelect;
export type NewProjectStyleReferenceAnalysisRunReference = typeof projectStyleReferenceAnalysisRunReferences.$inferInsert;

export const projectStyleReferenceAnalysisObservations = sqliteTable(
  "project_style_reference_analysis_observations",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    runId: int("run_id")
      .notNull()
      .references(() => projectStyleReferenceAnalysisRuns.id, { onDelete: "cascade" }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "no action" }),
    orderIndex: int("order_index").notNull(),
    domain: text("domain"),
    originalObservation: text("original_observation").notNull(),
    observation: text("observation").notNull(),
    rationale: text("rationale"),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    uncertainty: text("uncertainty"),
    status: text("status", { enum: ["proposed", "accepted", "rejected"] }).notNull().default("proposed"),
    revision: int("revision").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_ref_analysis_observations_run_order_unique").on(table.runId, table.orderIndex),
  ]
);

export type ProjectStyleReferenceAnalysisObservation = typeof projectStyleReferenceAnalysisObservations.$inferSelect;
export type NewProjectStyleReferenceAnalysisObservation = typeof projectStyleReferenceAnalysisObservations.$inferInsert;

export const projectStyleReferenceAnalysisCandidateRules = sqliteTable(
  "project_style_reference_analysis_candidate_rules",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: int("run_id")
      .notNull()
      .references(() => projectStyleReferenceAnalysisRuns.id, { onDelete: "cascade" }),
    orderIndex: int("order_index").notNull(),
    status: text("status", { enum: ["proposed", "rejected", "approved"] }).notNull().default("proposed"),
    revision: int("revision").notNull().default(1),
    originalInstruction: text("original_instruction").notNull(),
    originalPillar: text("original_pillar", { enum: ["world", "visual"] }),
    originalSection: text("original_section"),
    originalCategory: text("original_category"),
    originalStrength: text("original_strength", { enum: ["Required", "Preferred", "Avoid"] }),
    originalApplicability: text("original_applicability"),
    instruction: text("instruction").notNull(),
    pillar: text("pillar", { enum: ["world", "visual"] }),
    section: text("section"),
    category: text("category"),
    strength: text("strength", { enum: ["Required", "Preferred", "Avoid"] }),
    applicability: text("applicability"),
    rationale: text("rationale").notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    uncertainty: text("uncertainty"),
    approvedDraftRuleId: int("approved_draft_rule_id").references(() => projectStyleRules.id, { onDelete: "set null" }),
    approvedSnapshot: text("approved_snapshot"),
    approvedAt: text("approved_at"),
    rejectedAt: text("rejected_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_ref_analysis_cand_rules_run_order_unique").on(table.runId, table.orderIndex),
  ]
);

export type ProjectStyleReferenceAnalysisCandidateRule = typeof projectStyleReferenceAnalysisCandidateRules.$inferSelect;
export type NewProjectStyleReferenceAnalysisCandidateRule = typeof projectStyleReferenceAnalysisCandidateRules.$inferInsert;

export const projectStyleReferenceAnalysisCandidateRuleReferences = sqliteTable(
  "project_style_reference_analysis_candidate_rule_references",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    candidateRuleId: int("candidate_rule_id")
      .notNull()
      .references(() => projectStyleReferenceAnalysisCandidateRules.id, { onDelete: "cascade" }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "no action" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_ref_analysis_cand_rule_refs_unique").on(table.candidateRuleId, table.referenceId),
  ]
);

export type ProjectStyleReferenceAnalysisCandidateRuleReference = typeof projectStyleReferenceAnalysisCandidateRuleReferences.$inferSelect;
export type NewProjectStyleReferenceAnalysisCandidateRuleReference = typeof projectStyleReferenceAnalysisCandidateRuleReferences.$inferInsert;
