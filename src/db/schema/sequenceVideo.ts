import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { sequences, shots } from "./core";
import { comfyWorkflows, generationJobs } from "./generation";
import { sequenceStoryboardImages } from "./storyboard";

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
