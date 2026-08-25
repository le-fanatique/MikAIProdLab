import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects, sequences, shots } from "./core";
import { projectStyleVersions } from "./projectStyle";

export const assets = sqliteTable("assets", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: int("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["character", "environment", "prop", "vehicle", "crowd", "other"],
  }).notNull(),
  description: text("description"),
  notes: text("notes"),
  // Asset Bible (ASSET.BIBLE.1) — optional textual guidance for the future
  // Prompt Compiler. Deliberately separate from description/notes, which
  // remain the free-form text used as the asset image generation prompt.
  visualIdentity: text("visual_identity"),
  usageRules: text("usage_rules"),
  forbiddenVariations: text("forbidden_variations"),
  // SCHEMA.ASSET_SOURCING.1 (S1a) — sourcing metadata `normalizeCandidate`
  // (src/actions/llm/assetExtraction.ts) already produces for each LLM
  // extraction candidate, now persisted instead of discarded by
  // `createSelectedAssets`. Nullable and additive: every hand-created asset,
  // and every asset created before this column existed, has all three null.
  sourceLevel: text("source_level", {
    enum: ["outline", "sequence", "shot", "story"],
  }),
  sourceExcerpt: text("source_excerpt"),
  duplicateWarning: text("duplicate_warning"),
  // SCHEMA.BIBLE_FRESHNESS.1 (S1b) — deterministic fingerprint (sha256 hex,
  // see src/lib/assetBible/freshness.ts) of `description`/`notes` exactly as
  // they stood the moment the Asset Bible (visualIdentity/usageRules/
  // forbiddenVariations) was last written by `updateAssetDetailsInline`
  // (src/actions/assets.ts). Nullable and informative only: `null` means "no
  // Bible generated since this column existed", the case for every asset
  // that predates it — a normal state, not an error. Deliberately a sibling
  // of `computeAssetContentFingerprint` (src/lib/projectStyle/assetAlignment/
  // fingerprint.ts), not an extension of it: that function's five-field order
  // is load-bearing for `asset_style_alignments` rows already stored in the
  // DB, and widening it would silently reclassify every already-reviewed
  // asset as "desynced" from the Project Style.
  bibleSourceFingerprint: text("bible_source_fingerprint"),
  // LLMW.LIGHTING.1 (B15a) — §5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md.
  // Nullable, no default, present on every Asset row (not only
  // `type: "environment"`: SQLite has no conditional column, and §5.9 asks
  // for no type constraint). It is a Sequence's own environment Asset that
  // makes this field earn its place — `SEQ.LIGHTING`'s resolver reads it
  // through `sequence_assets` when the Sequence's own field is empty.
  lighting: text("lighting"),
  // ASSET.PROMPTCARD.1 — §4/§9 of docs/SHOT_PROMPT_SD25_AUDIT.md. The short,
  // approved form of the Asset Bible: 3 to 5 geometric anchors an engine can
  // hold onto (the audit's own count), never a paragraph. It never carries an
  // invariant that belongs to one Shot (a pose, an expression, a state for
  // this plan only) — that stays a Shot-level concern, exactly as `lighting`
  // above never carries a Shot's own rig. `visualIdentity`/`description`
  // remain the source of truth this card is drafted from; writing this
  // column never rewrites them. Nullable, no default: every asset created
  // before this column existed, and every asset the author has not yet
  // curated a card for, is `null` — a normal state, not an error.
  promptCard: text("prompt_card"),
  orderIndex: int("order_index").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const shotAssets = sqliteTable(
  "shot_assets",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    shotId: int("shot_id")
      .notNull()
      .references(() => shots.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("shot_asset_uniq").on(table.shotId, table.assetId)]
);

export const sequenceAssets = sqliteTable(
  "sequence_assets",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    sequenceId: int("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [unique("sequence_asset_uniq").on(table.sequenceId, table.assetId)]
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ShotAsset = typeof shotAssets.$inferSelect;
export type NewShotAsset = typeof shotAssets.$inferInsert;
export type SequenceAsset = typeof sequenceAssets.$inferSelect;
export type NewSequenceAsset = typeof sequenceAssets.$inferInsert;

export const assetReferenceImages = sqliteTable("asset_reference_images", {
  id: int("id").primaryKey({ autoIncrement: true }),
  assetId: int("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  orderIndex: int("order_index").notNull().default(0),
  imagePath: text("image_path").notNull(),
  sourceFilename: text("source_filename"),
  label: text("label"),
  // ASSET.BIBLE.2 — widened to the Seedance MVP role list while keeping every
  // legacy value readable (this column has no DB CHECK constraint, so
  // widening it is purely a TypeScript-level change; existing rows with a
  // legacy value are never rewritten).
  imageRole: text("image_role", {
    enum: [
      // legacy (pre-ASSET.BIBLE.2)
      "reference",
      "keyframe",
      "character",
      "environment",
      // MVP roles (ASSET.BIBLE.2) — "lighting", "style", "other" already
      // existed above and are reused as-is, not duplicated here.
      "identity",
      "full_body",
      "expression",
      "pose",
      "costume",
      "environment_view",
      "lighting",
      "prop_state",
      "style",
      // GEN.SEEDANCE.3 — First/Last Frame roles. TypeScript-level widening
      // only (this column has no DB CHECK constraint); no migration.
      "first_frame",
      "last_frame",
      // REFROLE.MVP.1 — general roles from the shared catalogue
      // (src/lib/referenceImageRoles.ts). TypeScript-level widening only.
      "storyboard_frame",
      "continuity_anchor",
      "camera",
      "motion",
      "rhythm",
      "other",
    ],
  }),
  notes: text("notes"),
  // ASSET.BIBLE.2 — Seedance-specific metadata, additive and independent of
  // `label`/`notes` above.
  variantState: text("variant_state"),
  usageNotes: text("usage_notes"),
  approvedForGeneration: int("approved_for_generation", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export type AssetReferenceImage = typeof assetReferenceImages.$inferSelect;
export type NewAssetReferenceImage = typeof assetReferenceImages.$inferInsert;

// ---------------------------------------------------------------------------
// asset_style_alignments — STYLE.1.F.CORE
//
// The durable, informational-only marker for the latest explicit Asset ->
// Project Style review ("Align with Project Style"). One row per Asset
// (unique on assetId), upserted by the apply action every time a proposal
// is explicitly applied — never by generation, which performs zero writes.
//
// Deliberately does NOT store the temporary LLM proposal, the raw LLM
// response, the prompt, or any provider payload/secret — only enough to
// answer "was this exact Asset content reviewed against this exact
// (immutable) Style version, and is that still true now": the Style
// version identity and a deterministic fingerprint of the Asset's five
// editable fields as they stood right after the review (see
// src/lib/projectStyle/assetAlignment/fingerprint.ts). The read model
// (src/actions/assetAlignment.ts) compares this fingerprint and version
// against the Asset's live content and the Project's live active version to
// derive "aligned" / "style-changed" / "asset-changed" — this table never
// re-derives or caches that comparison itself.
// ---------------------------------------------------------------------------

export const assetStyleAlignments = sqliteTable(
  "asset_style_alignments",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    assetId: int("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    projectStyleVersionId: int("project_style_version_id")
      .notNull()
      .references(() => projectStyleVersions.id, { onDelete: "cascade" }),
    // Deterministic fingerprint (sha256 hex) of the Asset's five editable
    // fields exactly as they stood immediately after this review was
    // applied — never re-read/re-hashed from a later DB state.
    assetContentFingerprint: text("asset_content_fingerprint").notNull(),
    reviewedAt: text("reviewed_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    unique("asset_style_alignments_asset_id_unique").on(table.assetId),
    index("asset_style_alignments_version_idx").on(table.projectStyleVersionId),
  ]
);

export type AssetStyleAlignment = typeof assetStyleAlignments.$inferSelect;
export type NewAssetStyleAlignment = typeof assetStyleAlignments.$inferInsert;
