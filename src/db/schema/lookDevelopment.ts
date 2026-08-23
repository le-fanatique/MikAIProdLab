import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./core";
import { projectStyleReferenceImages, projectStyleVersions } from "./projectStyle";
import { comfyWorkflows, generationJobs } from "./generation";

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
      .references(() => comfyWorkflows.id, { onDelete: "set null" }),
    // WF.DETACH.1 — stamped with the workflow's name at deletion time, and
    // only then (see deleteComfyWorkflow in src/actions/comfyWorkflows.ts).
    // Same contract as generation_jobs.workflow_name — see that column's
    // comment.
    workflowName: text("workflow_name"),
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
