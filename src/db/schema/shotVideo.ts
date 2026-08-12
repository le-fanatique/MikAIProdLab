import { index, int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { shots } from "./core";
import { generationJobs } from "./generation";
import { sequenceVideoSplitRuns, sequenceVideoSplitSegments } from "./sequenceVideo";

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
    // SHOT.VIDEO.REFERENCES.1 — "reference_copy" added: a physical copy
    // published into this library by the explicit "Add to Shot Videos"
    // bridge from a Shot Video Reference (see `shot_reference_videos`
    // above). It is a normal, deletable, explicitly-approvable library
    // entry like any other row here — the ONLY special handling is that
    // Editorial "Latest generation" (`pickLatestGenerationSources`'s only
    // caller, `resolveLatestGenerationRaw` in
    // src/lib/editorial/videoSourceMode.ts) excludes it before picking a
    // winner. "Approved only" is unaffected: it only ever reads
    // `shots.approvedVideoPath`, set generically by `approveShotVideoPath`
    // regardless of source.
    source: text("source", { enum: ["generation", "sequence_split", "reference_copy"] }).notNull(),
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
