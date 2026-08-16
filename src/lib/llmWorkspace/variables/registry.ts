import "server-only";

// ---------------------------------------------------------------------------
// variables/registry.ts — LLMW.DESCRIPTOR.FORMAT.1a (B1b-1) / 1b (B1b-2)
//
// The closed variable registry (§3.1). B1b-1 delivered the first three
// entries (`PROJECT.IDENTITY`, `SEQ.CONTEXT`, `SEQ.CURRENT_PROMPT`) plus the
// resolver contract; B1b-2 adds the remaining ten, widens `PROJECT.IDENTITY`
// with `outline`, and reads two variables' bounds (`ASSET.SEQ_APPEARANCES`
// limit 5, `ASSET.SHOT_APPEARANCES` limit 10, `ASSET.REFERENCES` limit 5)
// straight from the queries `fetchAssetContextInput`
// (`src/actions/llm/assetDescription.ts`) already runs — the bound is part
// of the variable's contract (§3.1), not the caller's. Every resolver
// follows the settled resolver contract (§3.1, "Resolver contract (settled
// in B1a)"):
//
//   - async, reads the database;
//   - receives the already-verified anchor id — it never re-checks
//     ownership and never widens the chain the caller resolved;
//   - returns typed data, never a formatted string — formatting belongs to
//     the template/prompt builder.
//
// `resolveAssetBibleContext(projectId, assetId)` and
// `resolveAssetStyleContext(projectId)` are the existing precedent this
// generalises (`src/lib/prompts/assetBibleContext.ts`,
// `src/lib/projectStyle/assetAlignment/resolveAssetStyleContext.ts`).
// `PROJECT.STYLE` below wraps the latter directly rather than
// re-implementing style resolution — a second implementation would be
// exactly the divergence risk §3.1 exists to prevent.
// ---------------------------------------------------------------------------

import {
  assetReferenceImages,
  assets,
  projects,
  sequenceAssets,
  sequences,
  shotAssets,
  shotReferenceImages,
  shots,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type { VariableId } from "../types";

// `@/db` is deliberately NOT imported at module scope, directly or
// transitively. `src/db/index.ts` binds one `better-sqlite3` handle at
// first import from `DB_PATH` — a top-level `import { db } from "@/db"`
// here would bind that handle at module load, before any test's
// `setupTempDb()` (or the global `tests/setup/dbGuard.ts` floor) has a
// chance to redirect `DB_PATH`. Every resolver below imports `@/db`
// dynamically, inside its own body, so the binding happens at call time
// instead — after whichever `DB_PATH` the caller intended is already in
// place. This is a resolver-level fix, not specific to the two descriptors
// that surfaced it: any future consumer of this registry inherits the same
// safety.
//
// `resolveAssetStyleContext` (`PROJECT.STYLE`'s resolver) is imported
// dynamically for the same reason, not just as a style preference: it was a
// static import here, and it transitively imports `resolveActiveProjectStyle`
// (`src/lib/projectStyle/resolveSequenceStyle.ts`), which itself has a
// top-level `import { db } from "@/db"` — one call-site removed from the
// exact defect this fix closes for the resolvers above. `resolveProjectStyle`
// below imports it dynamically so the whole chain binds at call time too.

// ---------------------------------------------------------------------------
// PROJECT.IDENTITY — anchors: project, sequence, shot, asset. B1b-1
// exercised only the project anchor; B1b-2's operations still call this
// resolver with a `projectId` directly (the runner that derives `projectId`
// from a non-project anchor chain is B2's concern). `outline` is added per
// §3.1's correction: `fetchAssetContextInput` reads `project.outline`.
// ---------------------------------------------------------------------------

export type ProjectIdentityData = {
  name: string;
  pitch: string | null;
  story: string | null;
  description: string | null;
  outline: string | null;
};

export async function resolveProjectIdentity(projectId: number): Promise<ProjectIdentityData> {
  const { db } = await import("@/db");
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error(`resolveProjectIdentity: project ${projectId} not found.`);
  }
  return {
    name: project.name,
    pitch: project.pitch,
    story: project.story,
    description: project.description,
    outline: project.outline,
  };
}

// ---------------------------------------------------------------------------
// PROJECT.IDENTITY render forms — LLMW.DESCRIPTOR.RENDER.1 (B1c). Named
// render forms live beside the resolver they format, per §3.1 ("A variable
// owns named render forms beside its resolver"). Each name matches the
// `render` string of the `{variable, render}` block that references it.
// ---------------------------------------------------------------------------

/**
 * `story.generate`'s user message — verbatim from `buildStoryFromPitchPrompt`
 * (`src/lib/prompts/story-from-pitch.ts`). Unlike the Asset-context render
 * form below, `pitch` / `description` are never omitted: an absent value
 * falls back to a fixed placeholder rather than dropping the line.
 */
export function renderProjectIdentityStoryContextLines(data: ProjectIdentityData): string {
  return [
    `Project title: ${data.name}`,
    `Pitch: ${data.pitch ?? "Not provided"}`,
    `Additional notes: ${data.description ?? "None"}`,
  ].join("\n");
}

/**
 * `outline.generate`'s user message context — verbatim from
 * `buildOutlineFromStoryPrompt` (`src/lib/prompts/outline-from-story.ts`).
 * Unlike `story.contextLines`, `pitch` / `story` are dropped entirely when
 * empty rather than falling back to a placeholder, and no `description` is
 * read at all.
 */
export function renderProjectIdentityOutlineContextLines(data: ProjectIdentityData): string {
  const lines: string[] = [`Project title: ${data.name}`];
  if (data.pitch?.trim()) lines.push(`Pitch: ${data.pitch}`);
  if (data.story?.trim()) lines.push(`Story: ${data.story}`);
  return lines.join("\n");
}

/**
 * `outline.generate`'s `{parameter: "targetSections", render}` block (§4.1
 * correction 4). Not a `VariableId` — `targetSections` is an
 * `intent.parameters` entry, not a context variable — but moved here from
 * `descriptors/outline.ts` per §3.1's correction: "the runner imports no
 * operation's module", found by B2a and fixed here. Render functions live
 * beside the resolvers, in `PARAMETER_RENDER_FORMS` /
 * `MODE_RENDER_FORMS` below, exactly like `VARIABLE_RENDER_FORMS` — never
 * inside a descriptor module, so a descriptor stays pure data (§4.2 stores
 * it as JSON).
 */
export function renderOutlineTargetSectionsBullet(targetSections: number | null | undefined): string {
  const sectionInstruction =
    targetSections != null
      ? `Write exactly ${targetSections} sections.`
      : "Choose a natural number of sections based on the story structure (typically 4 to 8).";
  return `- ${sectionInstruction}`;
}

// ---------------------------------------------------------------------------
// PROJECT.STYLE — anchors: project, sequence, shot, asset. World / Visual /
// Rules segments of the Project's active published Style, wrapping
// `resolveAssetStyleContext` (STYLE.1.F.CORE) verbatim — the same call site
// `generateAssetBibleDraft` and the asset-description actions already go
// through. `mode: "none"` when no Style is active; consumers subset the
// segments they need (e.g. `fetchAssetContextInput` uses only world + rules,
// never visual).
// ---------------------------------------------------------------------------

export type ProjectStyleData =
  | { mode: "none" }
  | { mode: "active"; worldSegment: string; visualSegment: string; rulesSegment: string };

export async function resolveProjectStyle(projectId: number): Promise<ProjectStyleData> {
  const { resolveAssetStyleContext } = await import(
    "@/lib/projectStyle/assetAlignment/resolveAssetStyleContext"
  );
  const resolved = await resolveAssetStyleContext(projectId);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  if (resolved.context.mode === "none") {
    return { mode: "none" };
  }
  return {
    mode: "active",
    worldSegment: resolved.context.segments.worldSegment,
    visualSegment: resolved.context.segments.visualSegment,
    rulesSegment: resolved.context.segments.rulesSegment,
  };
}

// ---------------------------------------------------------------------------
// SEQ.CONTEXT — anchors: sequence
// ---------------------------------------------------------------------------

export type SeqContextData = {
  title: string;
  summary: string | null;
  description: string | null;
  mood: string | null;
  locationHint: string | null;
  // LLMW.DESCRIPTOR.LIST.1 (B7c), §2.2: `buildShotsFromSequencePrompt`
  // (`src/lib/prompts/shots-from-sequence.ts`) reads seven Sequence fields,
  // including `narrativePurpose` — additive, every existing render form
  // destructures the subset it needs and ignores the rest.
  narrativePurpose: string | null;
};

export async function resolveSeqContext(sequenceId: number): Promise<SeqContextData> {
  const { db } = await import("@/db");
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqContext: sequence ${sequenceId} not found.`);
  }
  return {
    title: sequence.title,
    summary: sequence.summary,
    description: sequence.description,
    mood: sequence.mood,
    locationHint: sequence.locationHint,
    narrativePurpose: sequence.narrativePurpose,
  };
}

// ---------------------------------------------------------------------------
// SEQ.CURRENT_PROMPT — anchors: sequence
// ---------------------------------------------------------------------------

export type SeqCurrentPromptData = {
  sequencePrompt: string | null;
};

export async function resolveSeqCurrentPrompt(sequenceId: number): Promise<SeqCurrentPromptData> {
  const { db } = await import("@/db");
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqCurrentPrompt: sequence ${sequenceId} not found.`);
  }
  return { sequencePrompt: sequence.sequencePrompt };
}

// ---------------------------------------------------------------------------
// SHOT.CORE — anchors: shot. Matches `generateShotPromptDraft`'s Shot read
// (`src/actions/llm/shotPrompt.ts`).
// ---------------------------------------------------------------------------

export type ShotCoreData = {
  title: string;
  shotCode: string | null;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
  framing: string | null;
  cameraMovement: string | null;
  durationSeconds: number | null;
};

export async function resolveShotCore(shotId: number): Promise<ShotCoreData> {
  const { db } = await import("@/db");
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new Error(`resolveShotCore: shot ${shotId} not found.`);
  }
  return {
    title: shot.title,
    shotCode: shot.shotCode,
    description: shot.description,
    actionPitch: shot.actionPitch,
    cameraPitch: shot.cameraPitch,
    framing: shot.framing,
    cameraMovement: shot.cameraMovement,
    durationSeconds: shot.durationSeconds,
  };
}

// ---------------------------------------------------------------------------
// SHOT.CURRENT_PROMPT — anchors: shot
// ---------------------------------------------------------------------------

export type ShotCurrentPromptData = {
  shotPrompt: string | null;
};

export async function resolveShotCurrentPrompt(shotId: number): Promise<ShotCurrentPromptData> {
  const { db } = await import("@/db");
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new Error(`resolveShotCurrentPrompt: shot ${shotId} not found.`);
  }
  return { shotPrompt: shot.shotPrompt };
}

// ---------------------------------------------------------------------------
// SHOT.CAST — anchors: shot. No bound: `generateShotPromptDraft`'s cast
// query carries none either (`orderBy(asc(assets.name))`, no `.limit`).
// ---------------------------------------------------------------------------

export type ShotCastEntry = {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
};

export async function resolveShotCast(shotId: number): Promise<ShotCastEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({ name: assets.name, type: assets.type, description: assets.description, notes: assets.notes })
    .from(shotAssets)
    .innerJoin(assets, eq(shotAssets.assetId, assets.id))
    .where(eq(shotAssets.shotId, shotId))
    .orderBy(asc(assets.name));
}

// ---------------------------------------------------------------------------
// SHOT.REFERENCES — anchors: shot. No bound: `generateShotPromptDraft`'s
// reference-image query carries none either
// (`orderBy(asc(shotReferenceImages.orderIndex))`, no `.limit`).
// ---------------------------------------------------------------------------

export type ShotReferenceEntry = {
  label: string | null;
  imageRole: string | null;
  sourceFilename: string | null;
};

export async function resolveShotReferences(shotId: number): Promise<ShotReferenceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      label: shotReferenceImages.label,
      imageRole: shotReferenceImages.imageRole,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shotId))
    .orderBy(asc(shotReferenceImages.orderIndex));
}

// ---------------------------------------------------------------------------
// SEQ.SHOTS — anchors: sequence. LLMW.UC2.RETAKE.1 (B9b) — added for
// `shot.retakeDirected`, which needs "the other Shots in this Sequence" for
// continuity (UC2, §4 of the vision doc); UC1 will read the same variable
// for the same reason (§0 of the ticket).
//
// Fields: `shotCode` (the Shot's human identifier — "au minimum
// l'identifiant" per §4.1 of the ticket; not the DB primary key, which is
// never meaningful prose for the model), `orderIndex`, `title`,
// `description`, `actionPitch` — the five fields §4.1 asks for at minimum,
// and no more: `cameraPitch`/`framing`/`cameraMovement` are not included,
// since UC2's own "other Shots" context (§4 of the vision doc) only asks for
// continuity of story and action, not camera, and every extra field costs
// tokens on every call, on every Shot, in every render.
//
// Bound: `SEQ_SHOTS_LIMIT` (20), ordered by `orderIndex` ascending. No
// existing caller sets this precedent (unlike `ASSET.SEQ_APPEARANCES` /
// `ASSET.SHOT_APPEARANCES`, both copied verbatim from a real query) — declared
// here for the reason the ticket names directly: a thirty-Shot Sequence must
// not produce an unbounded prompt. 20 is an editorial choice, not derived
// from evidence; see `.agents/executor_report.md`.
// ---------------------------------------------------------------------------

const SEQ_SHOTS_LIMIT = 20;

export type SeqShotEntry = {
  shotCode: string | null;
  orderIndex: number;
  title: string;
  description: string | null;
  actionPitch: string | null;
};

export async function resolveSeqShots(sequenceId: number): Promise<SeqShotEntry[]> {
  const { db } = await import("@/db");
  const [sequence] = await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqShots: sequence ${sequenceId} not found.`);
  }
  return db
    .select({
      shotCode: shots.shotCode,
      orderIndex: shots.orderIndex,
      title: shots.title,
      description: shots.description,
      actionPitch: shots.actionPitch,
    })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex))
    .limit(SEQ_SHOTS_LIMIT);
}

/**
 * `shotRetake.otherShotsLines` — `shot.retakeDirected`'s render form for
 * `SEQ.SHOTS`, combined with `SHOT.CORE` in a `{variables: [...]}` block
 * because identifying "the current Shot" requires both (§4.1 of the ticket:
 * "Le shot courant doit être identifiable"). Chosen: **exclusion** — the
 * current Shot is already fully described by its own `SHOT.CORE` block, so
 * repeating it here would cost tokens for no new information. Matched by
 * `shotCode` when both sides have one (the Shot's own human identifier,
 * expected unique within a Sequence — `generateNextCode`,
 * `src/lib/nomenclature.ts`); falls back to `title` when either side's
 * `shotCode` is null, since a resolver anchored on `sequenceId` alone has no
 * `shotId` to exclude by (the resolver contract, §3.1: one anchor id per
 * variable — see `runner.ts`'s `anchorIdForVariable`). A duplicate title
 * among un-coded Shots is a known, accepted limitation of this fallback, not
 * silently masked — see the report.
 */
export function renderSeqShotsOtherShotsLines(shots: SeqShotEntry[], current: ShotCoreData): string {
  const isCurrent = (s: SeqShotEntry) =>
    current.shotCode && s.shotCode ? s.shotCode === current.shotCode : s.title === current.title;
  const others = shots.filter((s) => !isCurrent(s));
  if (others.length === 0) return "";
  const lines: string[] = [`\nOther shots in this sequence:`];
  for (const s of others) {
    const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
    const parts: string[] = [`- ${label}`];
    if (s.description?.trim()) parts.push(s.description.trim());
    if (s.actionPitch?.trim()) parts.push(`action: ${s.actionPitch.trim()}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// ASSET.CORE — anchors: asset
// ---------------------------------------------------------------------------

export type AssetCoreData = {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
};

export async function resolveAssetCore(assetId: number): Promise<AssetCoreData> {
  const { db } = await import("@/db");
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) {
    throw new Error(`resolveAssetCore: asset ${assetId} not found.`);
  }
  return {
    name: asset.name,
    type: asset.type,
    description: asset.description ?? null,
    notes: asset.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// ASSET.BIBLE — anchors: asset
// ---------------------------------------------------------------------------

export type AssetBibleData = {
  visualIdentity: string | null;
  usageRules: string | null;
  forbiddenVariations: string | null;
};

export async function resolveAssetBible(assetId: number): Promise<AssetBibleData> {
  const { db } = await import("@/db");
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) {
    throw new Error(`resolveAssetBible: asset ${assetId} not found.`);
  }
  return {
    visualIdentity: asset.visualIdentity ?? null,
    usageRules: asset.usageRules ?? null,
    forbiddenVariations: asset.forbiddenVariations ?? null,
  };
}

// ---------------------------------------------------------------------------
// ASSET.SEQ_APPEARANCES — anchors: asset. Bound (max 5) and ordering
// (`orderBy(asc(sequences.orderIndex))`) copied verbatim from
// `fetchAssetContextInput`'s `seqRows` query
// (`src/actions/llm/assetDescription.ts`) — the bound is this variable's
// own contract (§3.1), not something a caller can widen.
// ---------------------------------------------------------------------------

const ASSET_SEQ_APPEARANCES_LIMIT = 5;

export type AssetSeqAppearanceEntry = {
  title: string;
  summary: string | null;
  mood: string | null;
  locationHint: string | null;
  narrativePurpose: string | null;
};

export async function resolveAssetSeqAppearances(assetId: number): Promise<AssetSeqAppearanceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      title: sequences.title,
      summary: sequences.summary,
      mood: sequences.mood,
      locationHint: sequences.locationHint,
      narrativePurpose: sequences.narrativePurpose,
    })
    .from(sequenceAssets)
    .innerJoin(sequences, eq(sequenceAssets.sequenceId, sequences.id))
    .where(eq(sequenceAssets.assetId, assetId))
    .orderBy(asc(sequences.orderIndex))
    .limit(ASSET_SEQ_APPEARANCES_LIMIT);
}

// ---------------------------------------------------------------------------
// ASSET.SHOT_APPEARANCES — anchors: asset. Bound (max 10) and ordering
// (`orderBy(asc(shots.orderIndex))`) copied verbatim from
// `fetchAssetContextInput`'s `shotRows` query.
// ---------------------------------------------------------------------------

const ASSET_SHOT_APPEARANCES_LIMIT = 10;

export type AssetShotAppearanceEntry = {
  shotCode: string | null;
  title: string;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
};

export async function resolveAssetShotAppearances(assetId: number): Promise<AssetShotAppearanceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      shotCode: shots.shotCode,
      title: shots.title,
      description: shots.description,
      actionPitch: shots.actionPitch,
      cameraPitch: shots.cameraPitch,
    })
    .from(shotAssets)
    .innerJoin(shots, eq(shotAssets.shotId, shots.id))
    .where(eq(shotAssets.assetId, assetId))
    .orderBy(asc(shots.orderIndex))
    .limit(ASSET_SHOT_APPEARANCES_LIMIT);
}

// ---------------------------------------------------------------------------
// ASSET.REFERENCES — anchors: asset. Bound (max 5) and ordering
// (`orderBy(asc(assetReferenceImages.orderIndex))`) copied verbatim from
// `fetchAssetContextInput`'s `refRows` query.
// ---------------------------------------------------------------------------

const ASSET_REFERENCES_LIMIT = 5;

export type AssetReferenceEntry = {
  label: string | null;
  imageRole: string | null;
  sourceFilename: string | null;
};

export async function resolveAssetReferences(assetId: number): Promise<AssetReferenceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      sourceFilename: assetReferenceImages.sourceFilename,
    })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, assetId))
    .orderBy(asc(assetReferenceImages.orderIndex))
    .limit(ASSET_REFERENCES_LIMIT);
}

// ---------------------------------------------------------------------------
// Shared Asset-context render forms — LLMW.DESCRIPTOR.RENDER.1 (B1c).
//
// `assetDescription.generate`, `assetNotes.generate` and
// `assetDescription.batch` all assemble their user message from the same
// six-variable context, through `buildContextLines`
// (`src/lib/prompts/asset-description-from-context.ts`), shared verbatim by
// their three builders. `buildContextLines` pushes one flat `lines[]` array,
// joined once by `"\n"` at the end; each function below reproduces exactly
// the sub-slice of that array attributable to one variable, itself joined
// internally by `"\n"` — associativity of `join` on a uniform separator
// means concatenating these sub-joins with the same `"\n"` block separator
// reproduces the original array's single join exactly, including every
// conditional line and every already-applied resolver bound (5 Sequences, 10
// Shots, 5 references — `buildContextLines`'s own `.slice(0, n)` calls are
// therefore redundant here, not re-applied).
// ---------------------------------------------------------------------------

/** First line group: `Project: ...` / conditional Pitch / Story / Outline. */
export function renderProjectIdentityAssetContextLines(data: ProjectIdentityData): string {
  const lines: string[] = [`Project: ${data.name}`];
  if (data.pitch?.trim()) lines.push(`Pitch: ${data.pitch.trim().slice(0, 200)}`);
  if (data.story?.trim()) lines.push(`Story: ${data.story.trim().slice(0, 300)}`);
  if (data.outline?.trim()) lines.push(`Outline: ${data.outline.trim().slice(0, 300)}`);
  return lines.join("\n");
}

/** Second line group: `\nAsset: ...` / Type / Current description / Current notes. */
export function renderAssetCoreAssetContextLines(data: AssetCoreData): string {
  const lines: string[] = [`\nAsset: ${data.name}`, `Type: ${data.type}`];
  lines.push(data.description?.trim() ? `Current description: ${data.description.trim()}` : `Current description: (none)`);
  if (data.notes?.trim()) lines.push(`Current notes: ${data.notes.trim()}`);
  return lines.join("\n");
}

/** Third line group: `\nSequences this asset appears in:` plus one `- ...` line per entry. Empty when there are none. */
export function renderAssetSeqAppearancesLines(entries: AssetSeqAppearanceEntry[]): string {
  if (entries.length === 0) return "";
  const lines: string[] = [`\nSequences this asset appears in:`];
  for (const s of entries) {
    const parts: string[] = [`- ${s.title}`];
    if (s.mood) parts.push(`mood: ${s.mood}`);
    if (s.locationHint) parts.push(`location: ${s.locationHint}`);
    if (s.narrativePurpose) parts.push(`purpose: ${s.narrativePurpose}`);
    if (s.summary) parts.push(`summary: ${s.summary.slice(0, 120)}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

/** Fourth line group: `\nShots this asset appears in:` plus one `- ...` line per entry. Empty when there are none. */
export function renderAssetShotAppearancesLines(entries: AssetShotAppearanceEntry[]): string {
  if (entries.length === 0) return "";
  const lines: string[] = [`\nShots this asset appears in:`];
  for (const s of entries) {
    const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
    const parts: string[] = [`- ${label}`];
    if (s.description) parts.push(s.description.slice(0, 100));
    if (s.actionPitch) parts.push(`action: ${s.actionPitch.slice(0, 80)}`);
    if (s.cameraPitch) parts.push(`camera: ${s.cameraPitch.slice(0, 80)}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

/** Fifth line group: `\nReference images: label, label, ...`. Empty when there is nothing to summarise. */
export function renderAssetReferencesLine(entries: AssetReferenceEntry[]): string {
  if (entries.length === 0) return "";
  const refSummary = entries
    .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
    .filter((v): v is string => v !== null);
  if (refSummary.length === 0) return "";
  return `\nReference images: ${refSummary.join(", ")}`;
}

/**
 * Sixth line group: `\nProject Style:\n...`, World + Rules segments only —
 * never Visual (that subset belongs to `assetBible.generate` alone, see
 * `renderProjectStyleBibleBlock` below). Empty when Style is `"none"` or
 * both segments are empty.
 */
export function renderProjectStyleWorldRulesBlock(data: ProjectStyleData): string {
  const worldSegment = data.mode === "active" ? data.worldSegment : "";
  const rulesSegment = data.mode === "active" ? data.rulesSegment : "";
  const styleParts = [worldSegment, rulesSegment].filter((part) => part.length > 0);
  if (styleParts.length === 0) return "";
  return `\nProject Style:\n${styleParts.join("\n\n")}`;
}

/**
 * The one-line conditional style rule shared verbatim by
 * `buildAssetDescriptionOnlyPrompt`, `buildAssetNotesOnlyPrompt` and
 * `buildAssetDescriptionFromContextPrompt`'s `styleRuleFor` — not exported,
 * folded into the three final-rule-bullet render forms below rather than
 * exposed as its own block, since it never appears except concatenated
 * directly onto a bullet with no separator.
 */
function assetContextStyleRuleSuffix(data: ProjectStyleData): string {
  const worldSegment = data.mode === "active" ? data.worldSegment : "";
  const rulesSegment = data.mode === "active" ? data.rulesSegment : "";
  const hasStyle = [worldSegment, rulesSegment].some((part) => part.length > 0);
  return hasStyle
    ? "\n- A Project Style is provided below. Respect its World & Design Language and any listed rules; never contradict them."
    : "";
}

/** `assetDescription.generate`'s system message final bullet, with the conditional style rule appended. */
export function renderProjectStyleDescriptionOnlyFinalRule(data: ProjectStyleData): string {
  return `- Do not write narrative role, usage context or design constraints — that belongs to Notes, which is not requested here.${assetContextStyleRuleSuffix(data)}`;
}

/** `assetNotes.generate`'s system message final bullet, with the conditional style rule appended. */
export function renderProjectStyleNotesOnlyFinalRule(data: ProjectStyleData): string {
  return `- Do not write a visual/production description — that belongs to Description, which is not requested here.${assetContextStyleRuleSuffix(data)}`;
}

/** `assetDescription.batch`'s system message final bullet, with the conditional style rule appended. */
export function renderProjectStyleBatchFinalRule(data: ProjectStyleData): string {
  return `- Do not mention missing information unless it is useful as a design note.${assetContextStyleRuleSuffix(data)}`;
}

/** `assetDescription.generate`'s closing user-message line. */
export function renderAssetCoreClosingDescriptionOnly(data: AssetCoreData): string {
  return `\nWrite or enrich only the description for "${data.name}".`;
}

/** `assetNotes.generate`'s closing user-message line. */
export function renderAssetCoreClosingNotesOnly(data: AssetCoreData): string {
  return `\nWrite or enrich only the notes for "${data.name}".`;
}

/** `assetDescription.batch`'s closing user-message line. */
export function renderAssetCoreClosingBoth(data: AssetCoreData): string {
  return `\nWrite or enrich the description and notes for "${data.name}".`;
}

// ---------------------------------------------------------------------------
// `assetBible.generate`-specific render forms — LLMW.DESCRIPTOR.RENDER.1
// (B1c). `buildAssetBibleFromContextPrompt`
// (`src/lib/prompts/asset-bible-from-context.ts`) does not share
// `buildContextLines` with the Asset-description family: different labels
// ("Description:" vs "Current description:"), no leading `"\n"` before
// `Asset:`, an always-present "Notes: (none)" fallback, and a three-segment
// Style block (World + Visual + Rules, not just World + Rules).
// ---------------------------------------------------------------------------

/** First line group: `Asset: ...` / Type / Description / Notes, both always present with an "(none)" fallback. */
export function renderAssetCoreBibleLines(data: AssetCoreData): string {
  const lines: string[] = [`Asset: ${data.name}`, `Type: ${data.type}`];
  lines.push(data.description?.trim() ? `Description: ${data.description.trim()}` : `Description: (none)`);
  lines.push(data.notes?.trim() ? `Notes: ${data.notes.trim()}` : `Notes: (none)`);
  return lines.join("\n");
}

/** Second line group: the existing Bible values, only when at least one is set. */
export function renderAssetBibleExistingLines(data: AssetBibleData): string {
  const hasExistingBible = data.visualIdentity?.trim() || data.usageRules?.trim() || data.forbiddenVariations?.trim();
  if (!hasExistingBible) return "";
  const lines: string[] = [`\nExisting Asset Bible (improve/complete, do not contradict without reason):`];
  if (data.visualIdentity?.trim()) lines.push(`Current Visual Identity: ${data.visualIdentity.trim()}`);
  if (data.usageRules?.trim()) lines.push(`Current Usage Rules: ${data.usageRules.trim()}`);
  if (data.forbiddenVariations?.trim()) lines.push(`Current Forbidden Variations: ${data.forbiddenVariations.trim()}`);
  return lines.join("\n");
}

/** Third line group: `\nProject Style:\n...`, all three segments (World + Visual + Rules). */
export function renderProjectStyleBibleBlock(data: ProjectStyleData): string {
  const worldSegment = data.mode === "active" ? data.worldSegment : "";
  const visualSegment = data.mode === "active" ? data.visualSegment : "";
  const rulesSegment = data.mode === "active" ? data.rulesSegment : "";
  const styleParts = [worldSegment, visualSegment, rulesSegment].filter((part) => part.length > 0);
  if (styleParts.length === 0) return "";
  return `\nProject Style:\n${styleParts.join("\n\n")}`;
}

/** `assetBible.generate`'s system message final bullet, with its own (Visual-Treatment-mentioning) conditional style rule appended. */
export function renderProjectStyleBibleFinalRule(data: ProjectStyleData): string {
  const worldSegment = data.mode === "active" ? data.worldSegment : "";
  const visualSegment = data.mode === "active" ? data.visualSegment : "";
  const rulesSegment = data.mode === "active" ? data.rulesSegment : "";
  const hasStyle = [worldSegment, visualSegment, rulesSegment].some((part) => part.length > 0);
  const styleRule = hasStyle
    ? "\n- A Project Style is provided below. Respect its World & Design Language, Visual Treatment and any listed rules; never contradict them."
    : "";
  return `- If Description and Notes are too limited to support a field, return an empty string for that field rather than inventing content.${styleRule}`;
}

/** `assetBible.generate`'s closing user-message line. */
export function renderAssetCoreClosingBible(data: AssetCoreData): string {
  return `\nWrite or enrich the Asset Bible (Visual Identity, Usage Rules, Forbidden Variations) for "${data.name}".`;
}

// ---------------------------------------------------------------------------
// `sequencePrompt.assist` / `shotPrompt.assist` render forms —
// LLMW.DESCRIPTOR.RENDER.1 (B1c), widened 2026-08-13.
//
// Both builders (`src/lib/prompts/sequence-prompt-from-context.ts`,
// `src/lib/prompts/shot-prompt-from-context.ts`) branch entirely on
// `assistMode`: the `"generate"` branch and the four transform branches
// (`enhance | rewrite | shorten | expand`) read different variables and
// produce structurally different text, not just one varying line — the
// generate branch never reads `SEQ.CURRENT_PROMPT` / `SHOT.CURRENT_PROMPT`
// at all, and the transform branches concatenate their two fragments
// directly (no line separator) rather than joining an array.
//
// Two shapes the original three `Block` variants could not declare
// honestly, both now first-class in `types.ts`:
//
// 1. Mode-conditional fragments are `{mode: true, render}` blocks —
//    `assistMode` is the operation's selected `intent.mode`, not an
//    `intent.parameters` entry, so it gets its own block shape instead of
//    borrowing `parameter`'s (a first attempt at this ticket used
//    `{parameter: "assistMode", render}`; the supervisor's review correctly
//    read that as implying an `intent.parameters` entry that does not
//    exist, and settled the dedicated `mode` variant below).
// 2. Where a render form reads more than one variable — because the source
//    builder itself concatenates their fragments with no separator, as
//    `SEQ.CURRENT_PROMPT` + the transform-mode subset of `SEQ.CONTEXT` does,
//    and `buildGenerateContextLines` does across six variables at once for
//    `shotPrompt.assist` — the block is `{variables: [...], render}`,
//    naming every variable the render form actually reads. Splitting such a
//    pairing across separate `{variable}` blocks joined by the uniform
//    `"\n"` separator would insert a newline the builder never emits; the
//    `variables` block instead declares the true input set so a future
//    runner never has to guess it.
// ---------------------------------------------------------------------------

/** Fixed first system line, shared by every mode of both operations. */
export const PROMPT_ASSIST_SYSTEM_INTRO_SEQUENCE =
  "You are an expert at writing visual and narrative direction prompts for film sequences.";

const SEQUENCE_PROMPT_GENERATE_SYSTEM_BODY = `Write a Sequence Prompt that describes the visual atmosphere, dramatic arc, camera approach, lighting, setting, and mood of the sequence.
Focus on: what is felt and seen across the sequence as a whole. Do not list individual shots.
Do not mention project names or sequence names explicitly in the prompt.`;

const SEQUENCE_PROMPT_TRANSFORM_INSTRUCTIONS: Record<
  "enhance" | "rewrite" | "shorten" | "expand",
  string
> = {
  enhance:
    "Enhance the existing sequence prompt by adding visual and narrative detail: atmosphere, lighting quality, camera approach, dramatic arc. Preserve the original intent. Do not change the core subject or setting dramatically.",
  rewrite:
    "Rewrite the existing sequence prompt to be cleaner, more cinematic, and more evocative. Preserve the meaning and intent. Remove awkward phrasing. Make it flow naturally as a visual and narrative description.",
  shorten:
    "Compress the existing sequence prompt into a shorter, more focused version. Keep the most essential visual and narrative elements: setting, mood, dramatic direction. Remove redundancy.",
  expand:
    "Expand the existing sequence prompt by adding useful visual and narrative details: environment texture, lighting setup, emotional arc, camera style, transitions between moments. Stay grounded in what the sequence is about.",
};

export type SequencePromptAssistModeId = "generate" | "enhance" | "rewrite" | "shorten" | "expand";

/** `sequencePrompt.assist` system: the generate-mode body, empty outside `"generate"`. */
export function renderSequencePromptGenerateSystemBody(mode: SequencePromptAssistModeId): string {
  return mode === "generate" ? SEQUENCE_PROMPT_GENERATE_SYSTEM_BODY : "";
}

/** `sequencePrompt.assist` system: the transform-mode instruction, empty in `"generate"`. */
export function renderSequencePromptTransformSystemBody(mode: SequencePromptAssistModeId): string {
  return mode === "generate" ? "" : SEQUENCE_PROMPT_TRANSFORM_INSTRUCTIONS[mode];
}

/** `sequencePrompt.assist` system: shared fixed closing lines (no-markup + JSON schema). */
export const SEQUENCE_PROMPT_SYSTEM_TAIL = `Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one or two paragraphs maximum.
Always respond with a valid JSON object matching exactly this schema:
{ "sequence_prompt": "<your sequence prompt here>" }
No explanation. Only the JSON object.`;

/** `sequencePrompt.assist` template: `PROJECT.IDENTITY` lines, generate mode only. */
export function renderProjectIdentitySequencePromptGenerateLines(
  data: ProjectIdentityData,
  mode: SequencePromptAssistModeId
): string {
  if (mode !== "generate") return "";
  const lines: string[] = [`Project: ${data.name}`];
  if (data.pitch?.trim()) lines.push(`Pitch: ${data.pitch}`);
  if (data.story?.trim()) lines.push(`Story: ${data.story.slice(0, 400)}`);
  return lines.join("\n");
}

/** `sequencePrompt.assist` template: `SEQ.CONTEXT` lines, generate mode only. */
export function renderSeqContextSequencePromptGenerateLines(
  data: SeqContextData,
  mode: SequencePromptAssistModeId
): string {
  if (mode !== "generate") return "";
  const lines: string[] = [`Sequence: ${data.title}`];
  if (data.summary?.trim()) lines.push(`Summary: ${data.summary}`);
  if (data.description?.trim()) lines.push(`Description: ${data.description}`);
  if (data.mood?.trim()) lines.push(`Mood: ${data.mood}`);
  if (data.locationHint?.trim()) lines.push(`Location: ${data.locationHint}`);
  return lines.join("\n");
}

/**
 * `sequencePrompt.assist` template: the transform-mode "Current prompt: ..."
 * block, empty in `"generate"`. Combines `SEQ.CURRENT_PROMPT` and the
 * transform subset of `SEQ.CONTEXT` because the builder concatenates them
 * with no separator — see the deviation note above.
 */
export function renderSeqCurrentPromptTransformBlock(
  currentPromptData: SeqCurrentPromptData,
  contextData: Pick<SeqContextData, "mood" | "locationHint" | "summary">,
  mode: SequencePromptAssistModeId
): string {
  if (mode === "generate") return "";
  const ctxParts: string[] = [];
  if (contextData.mood?.trim()) ctxParts.push(`Mood: ${contextData.mood}`);
  if (contextData.locationHint?.trim()) ctxParts.push(`Location: ${contextData.locationHint}`);
  if (contextData.summary?.trim()) ctxParts.push(`Summary: ${contextData.summary}`);
  const contextBlock = ctxParts.length > 0 ? `\n\nSequence context (background only):\n${ctxParts.join("\n")}` : "";
  return `Current prompt:\n${currentPromptData.sequencePrompt ?? ""}${contextBlock}`;
}

/** `sequencePrompt.assist` template: the mode-dependent closing instruction, one leading `"\n"`. */
export function renderSequencePromptClosingLine(mode: SequencePromptAssistModeId): string {
  return mode === "generate" ? "\nWrite a sequence prompt for this sequence." : "\nTransform the prompt as instructed.";
}

const SHOT_PROMPT_GENERATE_SYSTEM_BODY = `Write a clean, dense, cinematic visual prompt for the given shot context.
Focus on: visible action, subject, composition, camera angle, lighting, atmosphere, environment, and cinematic style.
Do not mention project names, sequence names, or shot codes explicitly in the prompt.`;

const SHOT_PROMPT_TRANSFORM_INSTRUCTIONS: Record<"enhance" | "rewrite" | "shorten" | "expand", string> = {
  enhance:
    "Enhance the existing visual prompt by adding detail: camera angle precision, lighting nuances, atmospheric quality, compositional elements. Preserve the original intent and action. Do not change the core subject or scene dramatically.",
  rewrite:
    "Rewrite the existing visual prompt to be cleaner, more cinematic, and more precise. Preserve the meaning and intent. Remove awkward phrasing and make it flow naturally as a visual description.",
  shorten:
    "Compress the existing visual prompt into a shorter, more focused version. Keep the most essential visual elements: subject, action, key composition, mood. Remove redundancy and secondary details.",
  expand:
    "Expand the existing visual prompt by adding useful visual details: camera specifics, lighting setup, environment texture, mood and atmosphere. Stay focused on what a camera would capture. Avoid non-visual narrative details.",
};

export type ShotPromptAssistModeId = "generate" | "enhance" | "rewrite" | "shorten" | "expand";

/** `shotPrompt.assist` system: fixed first line, shared by every mode. */
export const PROMPT_ASSIST_SYSTEM_INTRO_SHOT =
  "You are an expert at writing visual generation prompts for AI image and video diffusion models.";

/** `shotPrompt.assist` system: the generate-mode body, empty outside `"generate"`. */
export function renderShotPromptGenerateSystemBody(mode: ShotPromptAssistModeId): string {
  return mode === "generate" ? SHOT_PROMPT_GENERATE_SYSTEM_BODY : "";
}

/** `shotPrompt.assist` system: the transform-mode instruction, empty in `"generate"`. */
export function renderShotPromptTransformSystemBody(mode: ShotPromptAssistModeId): string {
  return mode === "generate" ? "" : SHOT_PROMPT_TRANSFORM_INSTRUCTIONS[mode];
}

/** `shotPrompt.assist` system: shared fixed closing lines (no-markup + JSON schema). */
export const SHOT_PROMPT_SYSTEM_TAIL = `Do not include labels, headers, explanations, bullet points, or markdown.
Write in English. Output one paragraph.
Always respond with a valid JSON object matching exactly this schema:
{ "shot_prompt": "<your visual prompt here>" }
No explanation. Only the JSON object.`;

/**
 * `shotPrompt.assist` template: the generate-mode context lines, combining
 * `PROJECT.IDENTITY`, `SEQ.CONTEXT`, `SHOT.CORE`, `SHOT.CAST`,
 * `SHOT.REFERENCES` and `SHOT.CURRENT_PROMPT` — `buildGenerateContextLines`
 * pushes all six into one flat array with no group boundary the caller can
 * split on (unlike the Asset-context family, whose groups are separated by
 * a leading `"\n"` per group). Combining them in one render form, tied
 * nominally to `SHOT.CORE` in the block, is the same deviation as
 * `sequencePrompt.assist`'s transform block, generalised to more inputs for
 * the same reason: the source array has no separator the block model could
 * exploit to split it safely.
 */
export function renderShotPromptGenerateContextLines(
  project: ProjectIdentityData,
  sequence: SeqContextData,
  shot: ShotCoreData,
  cast: ShotCastEntry[],
  references: ShotReferenceEntry[],
  currentPrompt: ShotCurrentPromptData,
  mode: ShotPromptAssistModeId
): string {
  if (mode !== "generate") return "";
  const lines: string[] = [`Project: ${project.name}`];
  if (project.pitch?.trim()) lines.push(`Pitch: ${project.pitch}`);
  if (project.story?.trim()) lines.push(`Story: ${project.story.slice(0, 400)}`);
  lines.push(`Sequence: ${sequence.title}`);
  if (sequence.summary?.trim()) lines.push(`Sequence summary: ${sequence.summary}`);
  if (sequence.description?.trim()) lines.push(`Sequence description: ${sequence.description}`);
  if (sequence.mood?.trim()) lines.push(`Mood: ${sequence.mood}`);
  if (sequence.locationHint?.trim()) lines.push(`Location: ${sequence.locationHint}`);
  const shotLabel = shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title;
  lines.push(`Shot: ${shotLabel}`);
  if (shot.durationSeconds != null) lines.push(`Duration: ${shot.durationSeconds}s`);
  if (shot.description?.trim()) lines.push(`Description: ${shot.description}`);
  if (shot.actionPitch?.trim()) lines.push(`Action: ${shot.actionPitch}`);
  if (shot.cameraPitch?.trim()) lines.push(`Camera intent: ${shot.cameraPitch}`);
  if (shot.framing?.trim()) lines.push(`Framing: ${shot.framing}`);
  if (shot.cameraMovement?.trim()) lines.push(`Camera movement: ${shot.cameraMovement}`);
  const castSummary = cast.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
  if (castSummary.length > 0) lines.push(`Cast: ${castSummary.join(", ")}`);
  const referenceSummary = references
    .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
    .filter((v): v is string => v !== null);
  if (referenceSummary.length > 0) lines.push(`References: ${referenceSummary.join(", ")}`);
  if (currentPrompt.shotPrompt?.trim()) lines.push(`Existing prompt draft: ${currentPrompt.shotPrompt}`);
  return lines.join("\n");
}

/**
 * `shotPrompt.assist` template: the transform-mode "Current prompt: ..."
 * block, empty in `"generate"`. Same direct-concatenation deviation as
 * `sequencePrompt.assist`'s equivalent, combining `SHOT.CURRENT_PROMPT` and
 * the transform subset of `SHOT.CORE`.
 */
export function renderShotCurrentPromptTransformBlock(
  currentPrompt: ShotCurrentPromptData,
  shot: Pick<ShotCoreData, "description">,
  sequence: Pick<SeqContextData, "mood" | "locationHint">,
  mode: ShotPromptAssistModeId
): string {
  if (mode === "generate") return "";
  const ctxParts: string[] = [];
  if (shot.description?.trim()) ctxParts.push(`Shot: ${shot.description}`);
  if (sequence.mood?.trim()) ctxParts.push(`Mood: ${sequence.mood}`);
  if (sequence.locationHint?.trim()) ctxParts.push(`Location: ${sequence.locationHint}`);
  const contextBlock = ctxParts.length > 0 ? `\n\nShot context (background only):\n${ctxParts.join("\n")}` : "";
  return `Current prompt:\n${currentPrompt.shotPrompt ?? ""}${contextBlock}`;
}

/** `shotPrompt.assist` template: the mode-dependent closing instruction, one leading `"\n"`. */
export function renderShotPromptClosingLine(mode: ShotPromptAssistModeId): string {
  return mode === "generate" ? "\nWrite a visual generation prompt for this shot." : "\nTransform the prompt as instructed.";
}

// ---------------------------------------------------------------------------
// `intent.freeText` render forms — LLMW.INTENT.FREETEXT.1 (B9a). Named render
// forms for the `{freeText: true, render}` block (`types.ts`), on the same
// model as `PARAMETER_RENDER_FORMS` / `MODE_RENDER_FORMS`: the runner holds
// no table of its own, only the dispatch.
//
// Contract (§4.1 of the ticket): an absent, empty or blank consigne renders
// as the empty string, so the block disappears before the block list is
// joined (§4.1 correction 4) — a `shotPrompt.assist` run with no consigne
// therefore produces byte-for-byte the same prompt as before this block
// existed. A renseigned consigne is truncated, never refused, per the
// repository's standing convention for free-text input (e.g. `Story` is
// truncated to 400 chars in `renderShotPromptGenerateContextLines` above).
// ---------------------------------------------------------------------------

const SHOT_PROMPT_FREE_TEXT_MAX_LENGTH = 500;

/**
 * `shotPrompt.assist` template: the user's free-text direction, framed as a
 * directorial instruction for the model rather than echoed verbatim — it
 * sits among lines like `Camera intent: ...` / `Action: ...` above, so it
 * reads as one more directed fact about the shot rather than a stray quote.
 */
export function renderShotPromptFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `Director's direction: ${trimmed.slice(0, SHOT_PROMPT_FREE_TEXT_MAX_LENGTH)}`;
}

// ---------------------------------------------------------------------------
// `shot.retakeDirected` render forms — LLMW.UC2.RETAKE.1 (B9b). This is the
// first descriptor with no flat-JSON action to reproduce (§3 of the ticket:
// "the prompt is written, not transcribed") — every block below is authored
// for this ticket, in the register of the eight existing descriptors, rather
// than copied from an existing builder. No equality oracle exists for any of
// them; see `.agents/executor_report.md` for the resolved prompt these
// produce against a real seeded Shot.
// ---------------------------------------------------------------------------

const SHOT_RETAKE_FREE_TEXT_MAX_LENGTH = 500;

/** System: fixed role/rules text — the counterpart's own comment block for the JSON schema is a separate, static block in the descriptor itself. */
export const SHOT_RETAKE_SYSTEM_INTRO =
  "You are a story and shot-direction supervisor helping a director retake a single shot.";

/** Template: the Shot being retaken — its own narrative fields, not its camera/movement (§0bis: framing/cameraMovement are never read or written by this operation). */
export function renderShotCoreRetakeLines(shot: ShotCoreData): string {
  const label = shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title;
  const lines: string[] = [`Shot being retaken: ${label}`];
  lines.push(shot.description?.trim() ? `Current description: ${shot.description.trim()}` : `Current description: (none)`);
  lines.push(shot.actionPitch?.trim() ? `Current action pitch: ${shot.actionPitch.trim()}` : `Current action pitch: (none)`);
  lines.push(shot.cameraPitch?.trim() ? `Current camera pitch: ${shot.cameraPitch.trim()}` : `Current camera pitch: (none)`);
  return lines.join("\n");
}

/** Template: the Shot's cast — who is in frame, so "more empathy with the character" has a character to be about. Empty when the Shot has no cast. */
export function renderShotCastRetakeLines(cast: ShotCastEntry[]): string {
  if (cast.length === 0) return "";
  const summary = cast.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
  return `\nCast in this shot: ${summary.join(", ")}`;
}

/** Template: the parent Sequence's own context — mood/location/summary, for continuity of tone. */
export function renderSeqContextRetakeLines(seq: SeqContextData): string {
  const lines: string[] = [`\nSequence: ${seq.title}`];
  if (seq.summary?.trim()) lines.push(`Summary: ${seq.summary.trim()}`);
  if (seq.mood?.trim()) lines.push(`Mood: ${seq.mood.trim()}`);
  if (seq.locationHint?.trim()) lines.push(`Location: ${seq.locationHint.trim()}`);
  return lines.join("\n");
}

/** Template: the Project's story, "where useful" (§4 UC2) — pitch and story only, truncated like every other consumer of these two free-text fields (`renderShotPromptGenerateContextLines` truncates story to 400 chars; matched here). Empty when the Project carries neither. */
export function renderProjectIdentityRetakeLines(project: ProjectIdentityData): string {
  const lines: string[] = [];
  if (project.pitch?.trim()) lines.push(`Project pitch: ${project.pitch.trim()}`);
  if (project.story?.trim()) lines.push(`Story: ${project.story.trim().slice(0, 400)}`);
  if (lines.length === 0) return "";
  return `\n${lines.join("\n")}`;
}

/** Template: the director's free-text direction — the same "absent/empty/blank -> empty string" contract as `shotPrompt.assist`'s (§4.1 of B9a's ticket), reused verbatim rather than re-derived. */
export function renderShotRetakeFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's direction: ${trimmed.slice(0, SHOT_RETAKE_FREE_TEXT_MAX_LENGTH)}`;
}

// ---------------------------------------------------------------------------
// `shots.fromSequence` render forms — LLMW.DESCRIPTOR.LIST.1 (B7c), rewired by
// LLMW.BLOCK.VARPARAM.1 (B7c-n4). Read verbatim off
// `buildShotsFromSequencePrompt` (`src/lib/prompts/shots-from-sequence.ts`),
// which branches entirely on `sequence.sequencePrompt`'s presence
// (`hasSequencePrompt`, `shots-from-sequence.ts:71-72`) rather than on a
// mode. The four functions below (two system-path bodies, two template
// paths) are the first render forms in this registry to need both a resolved
// variable's data *and* the operation's `targetCount` at once — the gap B7c
// named and left unbuilt (see its own git history) — and now take the single
// `VariableParameterRenderInput` object the new `{variables, parameters,
// render}` block variant dispatches through, instead of positional
// arguments. Every one of the four is exclusive with its Path sibling:
// exactly one renders non-empty for any given `sequence.sequencePrompt`.
// ---------------------------------------------------------------------------

/** System, Path A (Approved Sequence Prompt present) — `shots-from-sequence.ts:91-102`, up to (not including) the blank line before `CONTINUITY_RULES`. Empty when there is no Approved Sequence Prompt. */
export function renderShotsFromSequenceSystemPathABody(input: VariableParameterRenderInput): string {
  const currentPrompt = input.variables["SEQ.CURRENT_PROMPT"] as SeqCurrentPromptData;
  const hasSequencePrompt = (currentPrompt.sequencePrompt ?? "").trim().length > 0;
  if (!hasSequencePrompt) return "";
  const count = input.parameters.targetCount ?? 6;
  return `You are a professional cinematographer and storyboard supervisor.
Your task is to generate exactly ${count} shots for the given sequence.
Each shot is a single uninterrupted camera take.

AUTHORITY RULES:
- The Approved Sequence Prompt is the authoritative creative direction for every shot.
- The Project Story is background context only. It must never override the Approved Sequence Prompt.
- Before generating any shot, identify the main subject, location, and visual style from the Approved Sequence Prompt. Every shot must follow them.
- If the Approved Sequence Prompt introduces a character or subject not present in the Project Story, use that character or subject.
- If there is any conflict between the Project Story and the Approved Sequence Prompt, always follow the Approved Sequence Prompt.
- Never substitute a character or location from the Project Story in place of one from the Approved Sequence Prompt.`;
}

/** System, Path B (no Approved Sequence Prompt) — `shots-from-sequence.ts:132-137`, up to (not including) the blank line before `CONTINUITY_RULES`. Empty when an Approved Sequence Prompt exists. */
export function renderShotsFromSequenceSystemPathBBody(input: VariableParameterRenderInput): string {
  const currentPrompt = input.variables["SEQ.CURRENT_PROMPT"] as SeqCurrentPromptData;
  const hasSequencePrompt = (currentPrompt.sequencePrompt ?? "").trim().length > 0;
  if (hasSequencePrompt) return "";
  const count = input.parameters.targetCount ?? 6;
  return `You are a professional cinematographer and storyboard supervisor.
Your task is to break a production sequence into exactly ${count} individual shots.
Each shot is a single uninterrupted camera take.
Respect the narrative arc of the sequence. Do not invent characters or locations not mentioned in the story or sequence context.`;
}

/** System, common tail — `JSON_SCHEMA(count)` (`shots-from-sequence.ts:36-56`), identical on both paths, needs only `targetCount`. Own leading `"\n"` (§4.1 correction 4's device) to reopen the blank line the block-separator alone cannot produce. */
export function renderShotsFromSequenceJsonSchemaBlock(targetCount: number | undefined): string {
  const count = targetCount ?? 6;
  return `
Always respond with a valid JSON object matching exactly this schema:
{
  "shots": [
    {
      "title": "string — brief label for the shot",
      "shot_code": "string or null — production code e.g. SH010, SH020",
      "description": "string or null — narrative description of the shot",
      "duration_seconds": number or null — estimated duration 3-8s typical,
      "continuity_in": "string — state at the start of this shot, inherited from the previous shot's continuity_out",
      "action_pitch": "string or null — what happens on screen",
      "camera_pitch": "string or null — camera angle, lens, position",
      "framing": "string or null — CU / MCU / MS / WS / ECU / OTS / POV",
      "camera_movement": "string or null — static / pan / tilt / tracking / dolly / handheld",
      "continuity_out": "string — changed state at the end of this shot, which becomes the starting state of the next shot",
      "shot_prompt": "string or null — clean visual generation prompt in English, one dense paragraph"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
The array must contain exactly ${count} shots.
shot_prompt must be a dense, cinematic visual description suitable for AI image/video generation. No labels, no narrative scene references — only visual content.`;
}

/** Template, Path A (Approved Sequence Prompt present) — `shots-from-sequence.ts:74-121`. Empty when there is no Approved Sequence Prompt. */
export function renderShotsFromSequenceTemplatePathA(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const seq = input.variables["SEQ.CONTEXT"] as SeqContextData;
  const currentPrompt = input.variables["SEQ.CURRENT_PROMPT"] as SeqCurrentPromptData;
  const approvedPrompt = (currentPrompt.sequencePrompt ?? "").trim();
  if (!approvedPrompt) return "";
  const count = input.parameters.targetCount ?? 6;

  const seqContext = [
    `Title: ${seq.title}`,
    seq.summary ? `Summary: ${seq.summary}` : null,
    seq.description ? `Description: ${seq.description}` : null,
    seq.mood ? `Mood: ${seq.mood}` : null,
    seq.locationHint ? `Location: ${seq.locationHint}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const projectBg = [
    project.pitch?.trim() ? `Pitch: ${project.pitch}` : null,
    project.story?.trim() ? `Story: ${project.story.slice(0, 300)}` : null,
    project.outline?.trim() ? `Project Outline Background: ${project.outline.slice(0, 400)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `TASK
Generate exactly ${count} shots for this sequence.

APPROVED SEQUENCE PROMPT — primary creative direction, overrides all other context:
${approvedPrompt.slice(0, 1200)}

SEQUENCE CONTEXT
${seqContext}${
    projectBg
      ? `\n\nPROJECT BACKGROUND — background continuity only, do not use to override the Approved Sequence Prompt:\n${projectBg}`
      : ""
  }

Generate exactly ${count} shots. Every shot must follow the subject, location, visual style, and mood of the Approved Sequence Prompt. The shots must form a continuous causal progression from shot 1 to shot ${count}. Avoid resets, contradictions, or repeated starting points.`;
}

/** Template, Path B (no Approved Sequence Prompt) — `shots-from-sequence.ts:124-151`. Empty when an Approved Sequence Prompt exists. */
export function renderShotsFromSequenceTemplatePathB(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const seq = input.variables["SEQ.CONTEXT"] as SeqContextData;
  const currentPrompt = input.variables["SEQ.CURRENT_PROMPT"] as SeqCurrentPromptData;
  const approvedPrompt = (currentPrompt.sequencePrompt ?? "").trim();
  if (approvedPrompt) return "";
  const count = input.parameters.targetCount ?? 6;

  const projectLines: string[] = [`Project: ${project.name}`];
  if (project.pitch?.trim()) projectLines.push(`Pitch: ${project.pitch}`);
  if (project.story?.trim()) projectLines.push(`Story: ${project.story.slice(0, 400)}`);
  if (project.outline?.trim()) projectLines.push(`Project Outline Background: ${project.outline.slice(0, 400)}`);

  return `${projectLines.join("\n")}

Sequence: ${seq.title}
Summary: ${seq.summary ?? "Not provided"}
Description: ${seq.description ?? "Not provided"}
Narrative purpose: ${seq.narrativePurpose ?? "Not provided"}
Mood: ${seq.mood ?? "Not provided"}
Location: ${seq.locationHint ?? "Not provided"}

Break this sequence into exactly ${count} individual shots. Fill all fields as precisely as possible. The shots must form a continuous causal progression from shot 1 to shot ${count}. Avoid resets, contradictions, or repeated starting points.`;
}

// ---------------------------------------------------------------------------
// The registry — one entry per `VariableId`. Resolver signatures differ
// across variables (project-anchored vs. sequence-anchored vs. shot/asset
// -anchored), matching the precedent's shape rather than forcing a uniform
// dispatch signature that no consumer needs yet — the runner that will
// dispatch by `VariableId` against a resolved anchor chain is B2's
// (`LLMW.RUNNER.1`).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Named render forms, keyed by `VariableId` then by the `render` string a
// `{variable, render}` block references (LLMW.DESCRIPTOR.RENDER.1). This
// table is for single-variable blocks only — a render form referenced by a
// `{variables: [...], render}` block belongs in `MULTI_VARIABLE_RENDER_FORMS`
// below instead, keyed by the render string alone, since it has no single
// owning `VariableId`. Not consumed by any production path yet — the runner
// that will dispatch a block against these tables is B2 (`LLMW.RUNNER.1`).
// Only render forms with a real caller in one of the eight descriptors are
// added here.
// ---------------------------------------------------------------------------

export const VARIABLE_RENDER_FORMS = {
  "PROJECT.IDENTITY": {
    "story.contextLines": renderProjectIdentityStoryContextLines,
    "outline.projectContextLines": renderProjectIdentityOutlineContextLines,
    "assetContext.identityLines": renderProjectIdentityAssetContextLines,
    "sequencePrompt.generateProjectLines": renderProjectIdentitySequencePromptGenerateLines,
    "shotRetake.projectLines": renderProjectIdentityRetakeLines,
  },
  "SEQ.CONTEXT": {
    "sequencePrompt.generateSequenceLines": renderSeqContextSequencePromptGenerateLines,
    "shotRetake.sequenceLines": renderSeqContextRetakeLines,
  },
  "PROJECT.STYLE": {
    "assetContext.worldRulesBlock": renderProjectStyleWorldRulesBlock,
    "assetDescription.finalRuleLine": renderProjectStyleDescriptionOnlyFinalRule,
    "assetNotes.finalRuleLine": renderProjectStyleNotesOnlyFinalRule,
    "assetDescriptionBatch.finalRuleLine": renderProjectStyleBatchFinalRule,
    "assetBible.styleBlock": renderProjectStyleBibleBlock,
    "assetBible.finalRuleLine": renderProjectStyleBibleFinalRule,
  },
  "ASSET.CORE": {
    "assetContext.coreLines": renderAssetCoreAssetContextLines,
    "assetDescription.closingLine": renderAssetCoreClosingDescriptionOnly,
    "assetNotes.closingLine": renderAssetCoreClosingNotesOnly,
    "assetDescriptionBatch.closingLine": renderAssetCoreClosingBoth,
    "assetBible.coreLines": renderAssetCoreBibleLines,
    "assetBible.closingLine": renderAssetCoreClosingBible,
  },
  "ASSET.BIBLE": {
    "assetBible.existingBibleLines": renderAssetBibleExistingLines,
  },
  "ASSET.SEQ_APPEARANCES": {
    "assetContext.seqAppearancesLines": renderAssetSeqAppearancesLines,
  },
  "ASSET.SHOT_APPEARANCES": {
    "assetContext.shotAppearancesLines": renderAssetShotAppearancesLines,
  },
  "ASSET.REFERENCES": {
    "assetContext.referencesLine": renderAssetReferencesLine,
  },
  "SHOT.CORE": {
    "shotRetake.coreLines": renderShotCoreRetakeLines,
  },
  "SHOT.CAST": {
    "shotRetake.castLines": renderShotCastRetakeLines,
  },
} as const;

/**
 * Render forms referenced by `{variables: [...], render}` blocks — a render
 * form that reads more than one variable, keyed by its `render` string
 * alone since it has no single owning `VariableId`. Each entry's key must
 * equal the `render` string of a `{variables, render}` block that declares,
 * in `variables`, every `VariableId` the function actually reads (checked by
 * the equality tests, not by this table).
 */
export const MULTI_VARIABLE_RENDER_FORMS = {
  "sequencePrompt.transformBlock": renderSeqCurrentPromptTransformBlock,
  "shotPrompt.generateContextLines": renderShotPromptGenerateContextLines,
  "shotPrompt.transformBlock": renderShotCurrentPromptTransformBlock,
  "shotRetake.otherShotsLines": renderSeqShotsOtherShotsLines,
} as const;

/**
 * Render forms referenced by `{parameter: id, render}` blocks — an
 * `intent.parameters` entry's render form, keyed by its `render` string
 * alone, on the same model as `MULTI_VARIABLE_RENDER_FORMS`. Moved here from
 * `descriptors/outline.ts` (§3.1's correction, reported by B2a): a
 * descriptor stays pure data, so its module exports no function — the
 * runner resolves every `render` string through a registry table, never
 * through a per-operation import.
 */
export const PARAMETER_RENDER_FORMS = {
  "outline.sectionInstructionBullet": renderOutlineTargetSectionsBullet,
  "shotsFromSequence.jsonSchemaBlock": renderShotsFromSequenceJsonSchemaBlock,
} as const;

// ---------------------------------------------------------------------------
// Render forms referenced by `{variables, parameters, render}` blocks
// (LLMW.BLOCK.VARPARAM.1, B7c-n4) — a render form that needs both a set of
// resolved variables and a set of `intent.parameters` values in the same
// call, keyed by its `render` string alone, same model as
// `MULTI_VARIABLE_RENDER_FORMS` / `PARAMETER_RENDER_FORMS` above.
//
// Deliberate convention divergence (§1 of the ticket): every other
// render-form table above is called *positionally* by `runner.ts`
// (`fn(...resolvedVariables, selectedMode)`), against tables typed as
// `Record<string, (...args: unknown[]) => string>` — an untyped cast that
// leaves a wrong argument order or count uncaught by `tsc`, exactly the class
// of defect B7c almost shipped (see the runner's own dispatch comment).
// `VARIABLE_PARAMETER_RENDER_FORMS` instead takes **one object argument**
// (`VariableParameterRenderInput`) and is declared `satisfies Record<string,
// (input: VariableParameterRenderInput) => string>` — a wrong signature here
// fails `tsc`, not a silent runtime mismatch. The five existing tables keep
// their positional convention unchanged: their forms are shipped and proven
// in production, and rewriting them is a chantier of its own, out of this
// ticket's scope.
// ---------------------------------------------------------------------------

/**
 * The one-object calling convention every `VARIABLE_PARAMETER_RENDER_FORMS`
 * entry receives: every variable the block declares in `variables` (resolved
 * data, keyed by `VariableId`, exactly as the runner already keys `resolved`
 * elsewhere), every parameter the block declares in `parameters` (from
 * `intent.parameters`, absent when the caller did not supply it — the render
 * form is responsible for its own default, on the same model every other
 * parameter/mode render form already follows), and the operation's selected
 * `intent.mode`, when it has one.
 */
export type VariableParameterRenderInput = {
  variables: Partial<Record<VariableId, unknown>>;
  parameters: Record<string, number | string | undefined>;
  mode: string | undefined;
};

export const VARIABLE_PARAMETER_RENDER_FORMS = {
  "shotsFromSequence.systemPathABody": renderShotsFromSequenceSystemPathABody,
  "shotsFromSequence.systemPathBBody": renderShotsFromSequenceSystemPathBBody,
  "shotsFromSequence.templatePathA": renderShotsFromSequenceTemplatePathA,
  "shotsFromSequence.templatePathB": renderShotsFromSequenceTemplatePathB,
} as const satisfies Record<string, (input: VariableParameterRenderInput) => string>;

/**
 * Render forms referenced by `{mode: true, render}` blocks — the
 * operation's selected `intent.mode`, keyed by its `render` string alone,
 * same model as `PARAMETER_RENDER_FORMS` above. All six entries already
 * lived in this module before this ticket (`sequencePrompt.assist` /
 * `shotPrompt.assist`'s mode-conditional system-message bodies and closing
 * lines) — only the table cataloguing them by name is new.
 */
export const MODE_RENDER_FORMS = {
  "sequencePrompt.generateSystemBody": renderSequencePromptGenerateSystemBody,
  "sequencePrompt.transformSystemBody": renderSequencePromptTransformSystemBody,
  "sequencePrompt.closingLine": renderSequencePromptClosingLine,
  "shotPrompt.generateSystemBody": renderShotPromptGenerateSystemBody,
  "shotPrompt.transformSystemBody": renderShotPromptTransformSystemBody,
  "shotPrompt.closingLine": renderShotPromptClosingLine,
} as const;

/**
 * Render forms referenced by `{freeText: true, render}` blocks — the
 * operation's `intent.freeText` consigne, keyed by its `render` string
 * alone, same model as `MODE_RENDER_FORMS` above (LLMW.INTENT.FREETEXT.1,
 * B9a). One entry so far: `shotPrompt.assist` is the first (and, for this
 * ticket, only) operation to declare `intent.freeText`.
 */
export const FREE_TEXT_RENDER_FORMS = {
  "shotPrompt.freeTextDirective": renderShotPromptFreeTextDirective,
  "shotRetake.freeTextDirective": renderShotRetakeFreeTextDirective,
} as const;

export const VARIABLE_REGISTRY = {
  "PROJECT.IDENTITY": resolveProjectIdentity,
  "PROJECT.STYLE": resolveProjectStyle,
  "SEQ.CONTEXT": resolveSeqContext,
  "SEQ.CURRENT_PROMPT": resolveSeqCurrentPrompt,
  "SHOT.CORE": resolveShotCore,
  "SHOT.CURRENT_PROMPT": resolveShotCurrentPrompt,
  "SHOT.CAST": resolveShotCast,
  "SHOT.REFERENCES": resolveShotReferences,
  "ASSET.CORE": resolveAssetCore,
  "ASSET.BIBLE": resolveAssetBible,
  "ASSET.SEQ_APPEARANCES": resolveAssetSeqAppearances,
  "ASSET.SHOT_APPEARANCES": resolveAssetShotAppearances,
  "ASSET.REFERENCES": resolveAssetReferences,
  "SEQ.SHOTS": resolveSeqShots,
} as const satisfies Record<VariableId, (anchorId: number) => Promise<unknown>>;
