// ---------------------------------------------------------------------------
// llmWorkspace.ts — LLMW.STORAGE.1 (B6a)
//
// The one table §4.2 authorizes for this ticket: `llm_templates`, the
// editable copy the workshop creates from a code descriptor or from an
// imported JSON file. Convention copied literally from `comfyWorkflows`
// (`src/db/schema/generation.ts:7-23`), the precedent §4.2 designates.
//
// The eight `OperationDescriptor` code descriptors
// (`src/lib/llmWorkspace/descriptors/`) remain the source of truth for
// production and are never seeded into this table by this ticket — see
// `docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.2 and the ticket's §1. This table
// only ever stores what the workshop itself creates or duplicates.
//
// `anchorKind` is a deliberate, sole denormalization of `templateJson`'s own
// `anchor.entity`: B6b filters the entity selector by anchor kind, and the
// list groups without deserializing every row.
// ---------------------------------------------------------------------------

import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./core";

export const llmTemplates = sqliteTable("llm_templates", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // STYLE.LLM.LOOKFEEDBACK.CORE.1 widens `EntityKind` (`../lib/llmWorkspace/types.ts`)
  // with `"lookResult"`. This `enum` option is TypeScript-only — drizzle-kit
  // emits a plain `text NOT NULL` column for it (verified against
  // `drizzle/0050_mighty_lockheed.sql`, and re-verified with `db:generate`
  // producing no new migration for this change) — so widening it here is not
  // a schema change and needs no migration, unlike a real `CHECK` constraint
  // would. Left out of sync it would only break `tsc` at the two call sites
  // that duplicate/import a built-in descriptor into this table
  // (`src/actions/llmTemplates.ts`), not silently accept a bad value at
  // runtime.
  anchorKind: text("anchor_kind", {
    enum: ["project", "sequence", "shot", "asset", "lookResult"],
  }).notNull(),
  projectId: int("project_id").references(() => projects.id, { onDelete: "set null" }),
  templateJson: text("template_json").notNull(),
  sourceFilename: text("source_filename"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type LlmTemplate = typeof llmTemplates.$inferSelect;
export type NewLlmTemplate = typeof llmTemplates.$inferInsert;
