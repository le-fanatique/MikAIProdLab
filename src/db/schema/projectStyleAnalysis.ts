import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./core";
import { projectStyleReferenceImages, projectStyleRules } from "./projectStyle";

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
