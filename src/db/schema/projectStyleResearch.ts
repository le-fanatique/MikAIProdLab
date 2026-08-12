import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./core";
import { projectStyleInfluences, projectStyleRules } from "./projectStyle";

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
