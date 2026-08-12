import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects, sequences } from "./core";

// ---------------------------------------------------------------------------
// Project Style (STYLE.1.A) — durable Working Draft + immutable published
// version history for one Project's artistic direction.
//
// Five tables:
//   - projectStyleDrafts        — at most ONE mutable draft per Project
//                                 (DB-enforced via a unique index on
//                                 projectId, unlike sequence_results'
//                                 applicative-only "at most one active"
//                                 convention — this ticket explicitly
//                                 requires a real DB constraint here).
//                                 Carries an integer `revision`, bumped on
//                                 every mutation, for optimistic-concurrency
//                                 (no prior precedent in this schema; new
//                                 for this ticket, checked-and-incremented
//                                 inside each mutating transaction).
//   - projectStyleSections      — sparse, user-labeled "specialized
//                                 sections" per pillar (e.g. "Costume
//                                 language"), living relational rows so they
//                                 stay individually editable/orderable —
//                                 never hidden in an opaque JSON blob, per
//                                 the ticket's explicit rule for the
//                                 mutable, actively-queried draft.
//   - projectStyleRules         — atomic manual rules on the draft. Only
//                                 `instruction` is required; every other
//                                 column is optional metadata.
//   - projectStyleVersions      — one row per `Publish Style`, IMMUTABLE
//                                 (no action in this ticket ever UPDATEs or
//                                 DELETEs a row here). `contentSnapshot` is
//                                 the canonical JSON-in-TEXT snapshot of the
//                                 exact structured content at publish time
//                                 (direction brief + both pillars' sections
//                                 + rules) — the same "small, read-as-a-
//                                 whole structure" convention already used
//                                 by sequenceResults.cutManifest/
//                                 editorialSnapshot, explicitly allowed by
//                                 the ticket "en complement de champs
//                                 relationnels justifies" for an immutable
//                                 version row. `compiledText` is the exact
//                                 output of the pure compiler
//                                 (src/lib/projectStyle/compileStyleSnapshot.ts)
//                                 for that same snapshot, stored so it never
//                                 needs recomputing to display history.
//                                 versionNumber is DB-uniquely constrained
//                                 per Project (monotonic, no silent
//                                 collision).
//   - projectStyleActivePointers — the ONLY mutable row that ever changes
//                                 which version is "active" for a Project.
//                                 Kept deliberately separate from
//                                 projectStyleVersions (never a boolean
//                                 column on the version row itself) so
//                                 "change the active version" is always an
//                                 UPDATE on this one pointer row, never a
//                                 write to any version row — the mechanism
//                                 that makes "changing the active version
//                                 never mutates an old version" a structural
//                                 guarantee, not just a code convention.
//
// All five tables cascade-delete from `projects` (directly, or via
// projectStyleDrafts -> projectStyleSections/projectStyleRules), so
// deleting a Project cleans up all of its Style data automatically under
// `PRAGMA foreign_keys=ON` (already enabled in src/db/index.ts) — no
// separate cleanup action needed.
// ---------------------------------------------------------------------------

export const projectStyleDrafts = sqliteTable(
  "project_style_drafts",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    directionBrief: text("direction_brief"),
    worldGeneralDirection: text("world_general_direction"),
    worldNegativeConstraints: text("world_negative_constraints"),
    visualGeneralDirection: text("visual_general_direction"),
    visualNegativeConstraints: text("visual_negative_constraints"),
    // Optimistic-concurrency counter — every mutating action re-checks the
    // caller's `expectedRevision` against this column inside its
    // transaction and bumps it by 1 on success; a mismatch is refused
    // outright, never silently overwritten or merged.
    revision: int("revision").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_drafts_project_id_unique").on(table.projectId)]
);

export type ProjectStyleDraft = typeof projectStyleDrafts.$inferSelect;
export type NewProjectStyleDraft = typeof projectStyleDrafts.$inferInsert;

export const projectStyleSections = sqliteTable(
  "project_style_sections",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    draftId: int("draft_id")
      .notNull()
      .references(() => projectStyleDrafts.id, { onDelete: "cascade" }),
    pillar: text("pillar", { enum: ["world", "visual"] }).notNull(),
    heading: text("heading").notNull(),
    content: text("content").notNull(),
    orderIndex: int("order_index").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("project_style_sections_draft_idx").on(table.draftId, table.pillar, table.orderIndex)]
);

export type ProjectStyleSection = typeof projectStyleSections.$inferSelect;
export type NewProjectStyleSection = typeof projectStyleSections.$inferInsert;

export const projectStyleRules = sqliteTable(
  "project_style_rules",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    draftId: int("draft_id")
      .notNull()
      .references(() => projectStyleDrafts.id, { onDelete: "cascade" }),
    instruction: text("instruction").notNull(),
    pillar: text("pillar", { enum: ["world", "visual"] }),
    section: text("section"),
    category: text("category"),
    strength: text("strength", { enum: ["Required", "Preferred", "Avoid"] }),
    applicability: text("applicability"),
    provenanceNotes: text("provenance_notes"),
    // No `proposed` status here on purpose — STYLE.1.A has no candidate-rule
    // pipeline yet (that is STYLE.1.C.CORE's research-feed scope). A rule
    // this ticket creates is manual and immediately real; only its
    // inclusion in compiled output is togglable via `disabled`.
    status: text("status", { enum: ["approved", "disabled"] })
      .notNull()
      .default("approved"),
    orderIndex: int("order_index").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index("project_style_rules_draft_idx").on(table.draftId, table.orderIndex)]
);

export type ProjectStyleRule = typeof projectStyleRules.$inferSelect;
export type NewProjectStyleRule = typeof projectStyleRules.$inferInsert;

export const projectStyleVersions = sqliteTable(
  "project_style_versions",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNumber: int("version_number").notNull(),
    // JSON: StyleSnapshot (src/lib/projectStyle/styleSnapshot.ts) — the
    // exact structured content published, immutable from here on.
    contentSnapshot: text("content_snapshot").notNull(),
    // Exact output of compileStyleSnapshot(contentSnapshot) at publish time.
    compiledText: text("compiled_text").notNull(),
    publishedAt: text("published_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("project_style_versions_project_version_unique").on(table.projectId, table.versionNumber),
    index("project_style_versions_project_idx").on(table.projectId, table.versionNumber),
  ]
);

export type ProjectStyleVersion = typeof projectStyleVersions.$inferSelect;
export type NewProjectStyleVersion = typeof projectStyleVersions.$inferInsert;

export const projectStyleActivePointers = sqliteTable(
  "project_style_active_pointers",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    activeVersionId: int("active_version_id").references(() => projectStyleVersions.id, { onDelete: "set null" }),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_active_pointers_project_id_unique").on(table.projectId)]
);

export type ProjectStyleActivePointer = typeof projectStyleActivePointers.$inferSelect;
export type NewProjectStyleActivePointer = typeof projectStyleActivePointers.$inferInsert;

// ---------------------------------------------------------------------------
// Project Style — References And Influence Data (STYLE.1.B.CORE).
//
// Six tables, all Project-scoped and separate from the existing Asset/Shot
// reference-image tables (`assetReferenceImages`/`shotReferenceImages`),
// which are generation-input roles, not Style research/provenance data:
//
//   - projectStyleReferenceImages    — one uploaded Reference Board image.
//                                      Domains and consumers are relational
//                                      facts (below), never a JSON blob, per
//                                      the ticket's explicit rule.
//   - projectStyleReferenceDomains   — zero/one/many free-text analysis
//                                      domains per reference. Unique per
//                                      (referenceId, domain) — the action
//                                      layer normalizes/case-folds before
//                                      insert, this is the DB-level backstop.
//   - projectStyleReferenceConsumers — zero/one/many intended consumers per
//                                      reference, from a fixed enum. Unique
//                                      per (referenceId, consumer).
//   - projectStyleInfluences         — one Creative Influence dossier
//                                      (person/studio/work/movement).
//   - projectStyleInfluenceDomains   — zero/one/many weighted domains per
//                                      influence (primary/supporting/accent).
//                                      Unique per (influenceId, domain).
//   - projectStyleInfluenceReferences — many-to-many link from an influence
//                                      to a Project Style reference image
//                                      ("supporting references"). The action
//                                      layer verifies both rows share the
//                                      same projectId before insert — SQLite
//                                      cannot express a cross-table equality
//                                      check as a plain FK/CHECK constraint.
//                                      Unique per (influenceId, referenceId).
//
// All six cascade-delete from `projects` (directly, or via
// projectStyleReferenceImages/projectStyleInfluences -> their child rows),
// so deleting a Project removes every DB row automatically under
// `PRAGMA foreign_keys=ON`. The underlying uploaded FILES are NOT covered by
// any FK — see the explicit file-cleanup step added to `deleteProject`
// (src/actions/projects.ts) for STYLE.1.B.CORE.
// ---------------------------------------------------------------------------

export const projectStyleReferenceImages = sqliteTable("project_style_reference_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  imagePath: text("image_path").notNull(),
  sourceFilename: text("source_filename"),
  label: text("label"),
  sourceUrl: text("source_url"),
  provenanceNotes: text("provenance_notes"),
  whatInterestsMe: text("what_interests_me"),
  whatToAvoid: text("what_to_avoid"),
  approvedForAnalysis: int("approved_for_analysis", { mode: "boolean" }).notNull().default(false),
  approvedForGeneration: int("approved_for_generation", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ProjectStyleReferenceImage = typeof projectStyleReferenceImages.$inferSelect;
export type NewProjectStyleReferenceImage = typeof projectStyleReferenceImages.$inferInsert;

export const projectStyleReferenceDomains = sqliteTable(
  "project_style_reference_domains",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_reference_domains_unique").on(table.referenceId, table.domain)]
);

export type ProjectStyleReferenceDomain = typeof projectStyleReferenceDomains.$inferSelect;
export type NewProjectStyleReferenceDomain = typeof projectStyleReferenceDomains.$inferInsert;

export const projectStyleReferenceConsumers = sqliteTable(
  "project_style_reference_consumers",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    consumer: text("consumer", { enum: ["asset", "storyboard", "image", "video", "shot"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_reference_consumers_unique").on(table.referenceId, table.consumer)]
);

export type ProjectStyleReferenceConsumer = typeof projectStyleReferenceConsumers.$inferSelect;
export type NewProjectStyleReferenceConsumer = typeof projectStyleReferenceConsumers.$inferInsert;

export const projectStyleInfluences = sqliteTable("project_style_influences", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  subjectType: text("subject_type", { enum: ["person", "studio", "work", "movement"] }).notNull(),
  subjectName: text("subject_name").notNull(),
  disambiguation: text("disambiguation"),
  roleOrDiscipline: text("role_or_discipline"),
  periodOrWorks: text("period_or_works"),
  whatInterestsMe: text("what_interests_me"),
  whatToAvoid: text("what_to_avoid"),
  researchNotes: text("research_notes"),
  status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type ProjectStyleInfluence = typeof projectStyleInfluences.$inferSelect;
export type NewProjectStyleInfluence = typeof projectStyleInfluences.$inferInsert;

export const projectStyleInfluenceDomains = sqliteTable(
  "project_style_influence_domains",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    weight: text("weight", { enum: ["primary", "supporting", "accent"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_influence_domains_unique").on(table.influenceId, table.domain)]
);

export type ProjectStyleInfluenceDomain = typeof projectStyleInfluenceDomains.$inferSelect;
export type NewProjectStyleInfluenceDomain = typeof projectStyleInfluenceDomains.$inferInsert;

export const projectStyleInfluenceReferences = sqliteTable(
  "project_style_influence_references",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    influenceId: int("influence_id")
      .notNull()
      .references(() => projectStyleInfluences.id, { onDelete: "cascade" }),
    referenceId: int("reference_id")
      .notNull()
      .references(() => projectStyleReferenceImages.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("project_style_influence_references_unique").on(table.influenceId, table.referenceId)]
);

export type ProjectStyleInfluenceReference = typeof projectStyleInfluenceReferences.$inferSelect;
export type NewProjectStyleInfluenceReference = typeof projectStyleInfluenceReferences.$inferInsert;

// ---------------------------------------------------------------------------
// Sequence Style Override (STYLE.1.D.CORE).
//
// One additive table: at most one override row per Sequence (DB-unique on
// sequenceId). Its presence/absence is the entire contract:
//   no row   -> Sequence resolves the Project's currently active Style
//               version dynamically, every time it is read;
//   row present -> Sequence resolves this row's own frozen contentSnapshot/
//               compiledText instead, forever, until Reset deletes the row.
// There is no partial merge and no Shot-level override — every Shot in a
// Sequence resolves exactly this same result (see
// src/lib/projectStyle/resolveSequenceStyle.ts).
//
// sourceProjectStyleVersionId is provenance only ("customized from v1") — it
// is never re-read to recompute this row's content after creation, and a
// later publish/activate on the Project never touches this row.
// ---------------------------------------------------------------------------

export const sequenceStyleOverrides = sqliteTable(
  "sequence_style_overrides",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    sourceProjectStyleVersionId: int("source_project_style_version_id")
      .notNull()
      .references(() => projectStyleVersions.id),
    // JSON: StyleSnapshot — copied byte-exactly from the source version's
    // contentSnapshot at creation time, then only ever replaced whole by an
    // explicit update, never merged field-by-field.
    contentSnapshot: text("content_snapshot").notNull(),
    // Exact output of compileStyleSnapshot(contentSnapshot) for this row's
    // own content — recomputed server-side on every update, never trusted
    // from the client.
    compiledText: text("compiled_text").notNull(),
    // Optimistic-concurrency counter — every mutating action re-checks the
    // caller's `expectedRevision` against this column inside its
    // transaction and bumps it by 1 on success; a mismatch is refused
    // outright, never silently overwritten or merged.
    revision: int("revision").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("sequence_style_overrides_sequence_id_unique").on(table.sequenceId),
    index("sequence_style_overrides_source_version_idx").on(table.sourceProjectStyleVersionId),
  ]
);

export type SequenceStyleOverride = typeof sequenceStyleOverrides.$inferSelect;
export type NewSequenceStyleOverride = typeof sequenceStyleOverrides.$inferInsert;
