import { int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { sequences, shots } from "./core";
import { comfyWorkflows, generationJobs } from "./generation";
import { shotReferenceImages } from "./references";

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
