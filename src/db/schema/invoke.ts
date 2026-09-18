import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5, §6.
//
// "The Invoke board is the return address": every MikAI entity that can push
// an image to InvokeAI owns exactly one board there, and any image landing
// in that board is understood to belong back to that entity (lot 2 reads
// this table to poll; lot 1 only ever creates/reads it).
//
// INVOKE.PUSH.1 wrote only `ownerType` "shot" / "asset". INVOKE.PUSH.2 widens
// the enum to "shot_storyboard" / "sequence_storyboard" — a shot storyboard
// draft (`storyboard_images`) and a sequence storyboard draft
// (`sequence_storyboard_images`) each get their own board, distinct from the
// shot's own board: the return address is what decides which table a pushed
// image re-imports into in lot 2 (docs/INVOKE_ROUNDTRIP_SPEC.md §7 decision
// 6). INVOKE.STYLE.1 widens it once more to "project_style" — a Project's
// own Style reference board (`project_style_reference_images`), owned by the
// project itself rather than by a shot/asset/sequence. This column carries
// no `CHECK` constraint in SQLite (Drizzle's `{ enum: [...] }` is
// TypeScript-only), so widening it is not a migration — verified against
// drizzle/0068_loving_adam_warlock.sql before this comment was written.
// ---------------------------------------------------------------------------

export const invokeBoards = sqliteTable(
  "invoke_boards",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    ownerType: text("owner_type", {
      enum: ["shot", "asset", "shot_storyboard", "sequence_storyboard", "project_style"],
    }).notNull(),
    ownerId: int("owner_id").notNull(),
    /** InvokeAI's own board id (its `board_id`, a string, never MikAI's `id`). */
    boardId: text("board_id").notNull(),
    boardName: text("board_name").notNull(),
    /**
     * Last total image count this board was seen to have (§5.3's count-only
     * poll: `GET /api/v1/images/?board_id=…&limit=0`). Column posed now,
     * written and read starting lot 2 — this ticket only ever inserts 0 and
     * never re-reads it.
     */
    lastKnownImageCount: int("last_known_image_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // One board per owning entity.
    unique("invoke_boards_owner_unique").on(table.ownerType, table.ownerId),
    // One entity per Invoke board — a board id InvokeAI issued is never
    // shared between two MikAI entities.
    unique("invoke_boards_board_id_unique").on(table.boardId),
  ]
);

export type InvokeBoard = typeof invokeBoards.$inferSelect;

// ---------------------------------------------------------------------------
// What MikAI has pushed to Invoke — so lot 2's import never re-imports an
// image MikAI itself just sent out. The unique constraint on `imageName` is
// what carries the idempotence (docs/INVOKE_ROUNDTRIP_SPEC.md §6,
// `generation_job_outputs_job_index_unique` named as the precedent), not an
// application-level check.
// ---------------------------------------------------------------------------

export const invokePushedImages = sqliteTable(
  "invoke_pushed_images",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    invokeBoardId: int("invoke_board_id")
      .notNull()
      .references(() => invokeBoards.id, { onDelete: "cascade" }),
    /** InvokeAI's `image_name` for the pushed image — unique: a given Invoke image is only ever pushed once by MikAI. */
    imageName: text("image_name").notNull(),
    /** The MikAI-side source path of the image that was pushed (public/-relative, like every other stored reference path in this repository). */
    sourceImagePath: text("source_image_path").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("invoke_pushed_images_image_name_unique").on(table.imageName)]
);

export type InvokePushedImage = typeof invokePushedImages.$inferSelect;

// ---------------------------------------------------------------------------
// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3, ticket §1.4. What MikAI
// has already imported FROM a board, so a repeated sync (a second focus
// event, a concurrent tab) never re-imports the same Invoke image twice. Not
// a "direction" column on `invoke_pushed_images` (ticket §1.4): a pushed
// image and an imported image are not the same fact, and the same
// `image_name` can legitimately appear in both tables for the same board (an
// image MikAI pushed, then separately re-saved into the same board by the
// author in Invoke, is a real re-import candidate the moment it stops being
// literally the pushed image — `invoke_pushed_images` already excludes it by
// itself; this table's own job is only "already brought back once").
//
// The unique constraint on `imageName` carries the idempotence (ticket §1.4,
// same precedent as `invoke_pushed_images` above:
// `generation_job_outputs_job_index_unique`), not an application-level
// check: two concurrent syncs racing to import the same Invoke image can
// both attempt the insert, but only one commits.
// ---------------------------------------------------------------------------

export const invokeImportedImages = sqliteTable(
  "invoke_imported_images",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    invokeBoardId: int("invoke_board_id")
      .notNull()
      .references(() => invokeBoards.id, { onDelete: "cascade" }),
    /** InvokeAI's `image_name` for the imported image — unique: a given Invoke image is only ever imported once. */
    imageName: text("image_name").notNull(),
    /** Which MikAI table received the row: one of the four destination tables in ticket §1.3 (`shot_reference_images`, `asset_reference_images`, `storyboard_images`, `sequence_storyboard_images`). */
    destinationTable: text("destination_table").notNull(),
    /** The id of the row created in `destinationTable`. */
    destinationId: int("destination_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("invoke_imported_images_image_name_unique").on(table.imageName)]
);

export type InvokeImportedImage = typeof invokeImportedImages.$inferSelect;
