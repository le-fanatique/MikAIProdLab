import { index, int, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { shots } from "./core";
import { storyboardImages } from "./storyboard";
import { shotVideoCandidates } from "./shotVideo";

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

// ---------------------------------------------------------------------------
// Shot Video References (SHOT.VIDEO.REFERENCES.1) — a separate, durable,
// user-uploaded creative-source collection per Shot, structurally mirroring
// `shot_reference_images` above. Deliberately NOT `shot_videos`: this table
// is never a Shot Output, never approvable directly, never read by Editorial
// "Latest generation"/OpenReel/the current video-input generation contract.
// `onDelete: "cascade"` mirrors `shot_reference_images.shotId`'s own
// convention (not `shot_videos.shotId`'s RESTRICT) — a cascaded row delete
// never implies a cascaded FILE delete (SQLite cannot do that), so every
// Shot/Sequence/Project delete path that can cascade this table's rows must
// explicitly quarantine/restore its files with the same discipline as any
// other durable upload (see `src/lib/shotReferenceVideos/fileCleanup.ts`).
// ---------------------------------------------------------------------------

export const shotReferenceVideos = sqliteTable(
  "shot_reference_videos",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    orderIndex: int("order_index").notNull().default(0),
    videoPath: text("video_path").notNull(),
    sourceFilename: text("source_filename"),
    label: text("label"),
    // B17a — the role column the image tables have and this one lacked.
    // `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.6: the guide keys its video
    // modes on roles (camera replication, motion imitation, rhythm matching),
    // and those three already exist in `src/lib/referenceImageRoles.ts` —
    // they were offered on images only. Nullable and with no DB CHECK, exactly
    // like `asset_reference_images.image_role`, so an existing row stays valid
    // and the vocabulary can widen without a migration.
    videoRole: text("video_role"),
    notes: text("notes"),
    /** Probed from the actual uploaded/copied media at publish time — never guessed. */
    durationSeconds: real("duration_seconds"),
    width: int("width"),
    height: int("height"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("shot_reference_videos_video_path_unique").on(table.videoPath),
    index("shot_reference_videos_shot_id_idx").on(table.shotId),
  ]
);

export type ShotReferenceVideo = typeof shotReferenceVideos.$inferSelect;
export type NewShotReferenceVideo = typeof shotReferenceVideos.$inferInsert;
