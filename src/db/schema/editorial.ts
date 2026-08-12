import { index, int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects, sequences, shots } from "./core";

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
