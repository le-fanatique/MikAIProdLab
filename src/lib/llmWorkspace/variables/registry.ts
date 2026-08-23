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
import { and, asc, eq } from "drizzle-orm";
import type { VariableId } from "../types";
import { parseOutlineSections } from "@/lib/prompts/outlineSections";
import type { OutlineSection } from "@/lib/prompts/sequences-from-outline";
import { renderCameraFieldSchemaLine } from "../cameraInstruction";
// Type-only: `runner.ts` imports value bindings from this module (the five
// render-form tables, `VARIABLE_REGISTRY`, `POST_RESPONSE_FORMS`), so a
// runtime import in the other direction would cycle. `import type` is erased
// entirely by `tsc` (`resolveBenchConfirmation`'s own comment in
// `benchRun.ts` documents the same discipline for a different pair of
// modules) — `AnchorIds` is a type only, never a value, so this is safe.
import type { AnchorIds } from "../runner";

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
// PROJECT.STYLE.DRAFT — anchor: project. STYLE.LLM.VARS.1. Unlike
// `PROJECT.STYLE` above (the active *published* version), this reads the
// Working Draft — the mutable matter an assistant operation proposing a
// Style adjustment (`STYLE.LLM.ADJUST.1`, ticket 3 of "L'assistant de
// Project Style") reads and will adjust.
//
// Reads the three rows itself (`project_style_drafts`,
// `project_style_sections`, `project_style_rules`) rather than importing
// `getWorkingDraft` from `src/actions/projectStyle.ts`: that file is
// `"use server"`, and every export of a Server Actions file must be an
// async function — `buildStyleSnapshotFromRows` exists precisely so a
// synchronous helper can live outside it (see its own header). Composition
// goes through that same pure helper plus `compileStyleSnapshot`, the exact
// pair `getWorkingDraft` itself calls, so there is exactly one way a
// Working Draft becomes a `StyleSnapshot` and exactly one way that snapshot
// compiles to text.
// ---------------------------------------------------------------------------

export type ProjectStyleDraftData =
  | { mode: "none" }
  | { mode: "draft"; revision: number; directionBrief: string | null; compiledText: string };

export async function resolveProjectStyleDraft(projectId: number): Promise<ProjectStyleDraftData> {
  const { db } = await import("@/db");
  const { projectStyleDrafts, projectStyleSections, projectStyleRules } = await import("@/db/schema");
  const { buildStyleSnapshotFromRows } = await import("@/lib/projectStyle/buildStyleSnapshot");
  const { compileStyleSnapshot } = await import("@/lib/projectStyle/compileStyleSnapshot");

  const [draft] = await db.select().from(projectStyleDrafts).where(eq(projectStyleDrafts.projectId, projectId));
  if (!draft) {
    return { mode: "none" };
  }
  const sections = await db
    .select()
    .from(projectStyleSections)
    .where(eq(projectStyleSections.draftId, draft.id))
    .orderBy(asc(projectStyleSections.orderIndex));
  const rules = await db
    .select()
    .from(projectStyleRules)
    .where(eq(projectStyleRules.draftId, draft.id))
    .orderBy(asc(projectStyleRules.orderIndex));

  const snapshot = buildStyleSnapshotFromRows(draft, sections, rules);
  return {
    mode: "draft",
    revision: draft.revision,
    directionBrief: draft.directionBrief,
    compiledText: compileStyleSnapshot(snapshot),
  };
}

/**
 * `styleAdjust.draftLines` — the Working Draft rendered as plain lines for
 * an assistant operation's context. `mode: "none"` renders a single
 * explicit line rather than an empty string, so a consumer never has to
 * special-case "no draft yet" separately from "an empty compiled draft".
 */
export function renderProjectStyleDraftLines(data: ProjectStyleDraftData): string {
  if (data.mode === "none") {
    return "No Working Draft exists yet for this project.";
  }
  const lines: string[] = [];
  if (data.directionBrief?.trim()) lines.push(`Direction brief: ${data.directionBrief}`);
  lines.push(data.compiledText ? `Current Working Draft:\n${data.compiledText}` : "Current Working Draft: (empty)");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// `style.adjustDirected` render forms — STYLE.LLM.ADJUST.CORE.1. No oracle
// (§ of the ticket: "le prompt est écrit, pas repris"), modelled on
// `asset.retakeDirected` (B10) for the anchor + freeText shape and on
// `assets.fromProject` (B7f) for the `kind: "list"` output. `PROJECT.STYLE.DRAFT`
// itself reuses `renderProjectStyleDraftLines` above (`styleAdjust.draftLines`,
// already registered by STYLE.LLM.VARS.1 ahead of this consumer) rather than a
// second render form — the Working Draft's "mode: none" / "empty" / "filled"
// shape needs no operation-specific wording.
// ---------------------------------------------------------------------------

/**
 * Template: the Project's own identity — name only. Unlike
 * `renderShotInsertProjectLines` (pitch + story), this operation's whole
 * subject is the Working Draft, not the narrative: pitch/story would feed the
 * model material this operation has no use for and no instruction to ignore,
 * so the identity block stays to the one fact that actually orients a style
 * judgement — which project this is.
 */
export function renderStyleAdjustProjectLines(project: ProjectIdentityData): string {
  return `Project: ${project.name}`;
}

const STYLE_ADJUST_FREE_TEXT_MAX_LENGTH = 500;

/**
 * Template: the director's free-text note — the same "absent/empty/blank ->
 * empty string" contract as every other `intent.freeText` render form in this
 * file (B9a's own).
 */
export function renderStyleAdjustDirectorNoteLine(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's note: ${trimmed.slice(0, STYLE_ADJUST_FREE_TEXT_MAX_LENGTH)}`;
}

/**
 * System: the conditional rule instructing the model to read the director's
 * note — same defect-1 correction `asset.retakeDirected` already applies
 * (`renderAssetRetakeDirectorRuleLine`'s own comment): this block only makes
 * sense when a note actually exists in the prompt, so it renders empty (and
 * is dropped by `assembleBlocks`) with no note, rather than telling the model
 * to "respond to the note below" when there is none.
 */
export function renderStyleAdjustDirectorRuleLine(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return "- Respond to the director's note below: propose only the rules it asks for, never a rewrite of the existing Working Draft.";
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
// SEQ.LIGHTING — anchors: sequence. LLMW.LIGHTING.1 (B15a), §5.9 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md. The one variable of the three
// carrying the user's own preséance rule, decided 2026-08-18:
//
//   1. if `sequences.lighting` is non-blank after `trim()`, it wins — the
//      environment query below is never even issued;
//   2. otherwise, this Sequence's `type: "environment"` Assets
//      (`sequence_assets`, joined to `assets`), ordered by `assets.name`
//      ascending — the same deterministic order `SHOT.CAST` already uses for
//      its own cast read;
//   3. otherwise, `source: "none"` — a Sequence with neither is a normal
//      state, not an error.
//
// Zero or several environment Assets are both normal (§ of the ticket): the
// query is never sliced or elected down to "the first one" — every matching
// row is returned, in the order above, and the caller decides what to do
// with more than one. `source` is always present on the returned data so a
// consumer (and a test) can tell "own" from "environment" from "none"
// without re-deriving the rule itself — an un-sourced lighting value would
// be undebuggable, per this ticket's own instruction.
// ---------------------------------------------------------------------------

export type SeqLightingEnvironmentEntry = {
  name: string;
  lighting: string | null;
};

export type SeqLightingData =
  | { source: "own"; lighting: string }
  | { source: "environment"; environments: SeqLightingEnvironmentEntry[] }
  | { source: "none" };

/**
 * The environment-Assets-of-a-sequence query, extracted so it has exactly one
 * source. `resolveSeqLighting` below calls it only after its own precedence
 * check fails (the Sequence's own field is blank) — but B15b's "Fill from
 * environment" button (`src/lib/llmWorkspace/sequenceLightingFill.ts`) needs
 * this same list unconditionally, precedence check or not, because offering
 * to overwrite an already-filled field is the whole point of that button.
 * Calling `resolveSeqLighting` itself from there would short-circuit to
 * `{ source: "own" }` whenever the Sequence's own field already has a value
 * — exactly the case the button exists for — and never reach this query at
 * all. Same order as `SHOT.CAST`'s own cast read: `assets.name` ascending,
 * deterministic, no election rule.
 */
export async function resolveSequenceEnvironmentAssets(
  sequenceId: number
): Promise<SeqLightingEnvironmentEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({ name: assets.name, lighting: assets.lighting })
    .from(sequenceAssets)
    .innerJoin(assets, eq(sequenceAssets.assetId, assets.id))
    .where(and(eq(sequenceAssets.sequenceId, sequenceId), eq(assets.type, "environment")))
    .orderBy(asc(assets.name));
}

export async function resolveSeqLighting(sequenceId: number): Promise<SeqLightingData> {
  const { db } = await import("@/db");
  const [sequence] = await db
    .select({ lighting: sequences.lighting })
    .from(sequences)
    .where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqLighting: sequence ${sequenceId} not found.`);
  }

  if (sequence.lighting != null && sequence.lighting.trim() !== "") {
    return { source: "own", lighting: sequence.lighting };
  }

  const environments = await resolveSequenceEnvironmentAssets(sequenceId);

  if (environments.length === 0) {
    return { source: "none" };
  }
  return { source: "environment", environments };
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
  /** B19h — replaces `cameraPitch`, removed with its column. The prose camera field. */
  cameraSubject: string | null;
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
    cameraSubject: shot.cameraSubject,
    framing: shot.shotSize,
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
// SHOT.NARRATIVE_PROMPT — anchors: shot. LLMW.JAR.1 (B12a). Mirrors
// SHOT.CURRENT_PROMPT exactly, over `narrativePrompt` instead of
// `shotPrompt` — a one-field read, an explicit throw when the shot does not
// exist, no bound.
// ---------------------------------------------------------------------------

export type ShotNarrativePromptData = {
  narrativePrompt: string | null;
};

export async function resolveShotNarrativePrompt(shotId: number): Promise<ShotNarrativePromptData> {
  const { db } = await import("@/db");
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new Error(`resolveShotNarrativePrompt: shot ${shotId} not found.`);
  }
  return { narrativePrompt: shot.narrativePrompt };
}

// ---------------------------------------------------------------------------
// SHOT.LIGHTING — anchors: shot. LLMW.LIGHTING.1 (B15a), §5.9 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md. Mirrors SHOT.CURRENT_PROMPT exactly,
// over `lighting` — a one-field read, an explicit throw when the shot does
// not exist, no bound, and no fallback: only SEQ.LIGHTING carries the
// user's preséance rule, this is the Shot's own field alone.
// ---------------------------------------------------------------------------

export type ShotLightingData = {
  lighting: string | null;
};

export async function resolveShotLighting(shotId: number): Promise<ShotLightingData> {
  const { db } = await import("@/db");
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) {
    throw new Error(`resolveShotLighting: shot ${shotId} not found.`);
  }
  return { lighting: shot.lighting };
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
// and no more: `cameraPitch`/`shotSize`/`cameraMovement` are not included,
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

// ---------------------------------------------------------------------------
// PROJECT.OUTLINE_SECTIONS — anchors: project. LLMW.POSTRESPONSE.1 (B7g),
// needed by `sequences.fromOutline`: `generateSequencesFromOutlineDraft`
// (`src/actions/llm/sequenceGeneration.ts`) parses `project.outline`'s
// "## " sections both to build the count instruction / per-section prompt
// block (`sectionCount`, `outlineSections`, `sequenceGeneration.ts:130-143`)
// and, after the model answers, to pin `title`/`summary` back onto the
// parsed sections (the post-response form, §4 of the ticket). Returns the
// typed sections themselves, per the resolver contract (§3.1) — never a
// formatted string. Empty outline (or no outline at all) resolves to `[]`,
// matching `sequenceGeneration.ts:130-132`'s own guard, not an error: an
// absent outline is a normal state for a Project this operation's Path B
// still has to run against.
// ---------------------------------------------------------------------------

export async function resolveProjectOutlineSections(projectId: number): Promise<OutlineSection[]> {
  const { db } = await import("@/db");
  const [project] = await db.select({ outline: projects.outline }).from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error(`resolveProjectOutlineSections: project ${projectId} not found.`);
  }
  return project.outline?.trim() ? parseOutlineSections(project.outline) : [];
}

// ---------------------------------------------------------------------------
// PROJECT.SEQUENCES — anchors: project. LLMW.VAR.PROJECT_SCOPE.1 (B7c-n2).
// Fields and ordering (`orderBy(asc(sequences.orderIndex))`) copied verbatim
// from `assetExtraction.ts`'s `seqs` query (`:118-122`), which projects the
// full row but is only ever read for these six fields
// (`buildAssetsFromProjectPrompt`'s `sequences` mapping, `:173-180`) — the
// projection this resolver declares. No bound: the action's own query
// carries none either (§2 of the ticket's frozen decisions).
// ---------------------------------------------------------------------------

export type ProjectSequenceEntry = {
  title: string;
  summary: string | null;
  description: string | null;
  narrativePurpose: string | null;
  mood: string | null;
  locationHint: string | null;
};

export async function resolveProjectSequences(projectId: number): Promise<ProjectSequenceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      title: sequences.title,
      summary: sequences.summary,
      description: sequences.description,
      narrativePurpose: sequences.narrativePurpose,
      mood: sequences.mood,
      locationHint: sequences.locationHint,
    })
    .from(sequences)
    .where(eq(sequences.projectId, projectId))
    .orderBy(asc(sequences.orderIndex));
}

// ---------------------------------------------------------------------------
// PROJECT.SHOTS — anchors: project. LLMW.VAR.PROJECT_SCOPE.1 (B7c-n2).
// Fields and ordering (`orderBy(asc(shots.orderIndex))`) copied verbatim from
// `assetExtraction.ts`'s `shotRows` query (`:151-164`,
// `inArray(shots.sequenceId, seqIds)`), reproduced here as a direct join on
// `sequences.projectId` — a Shot carries no `projectId` column of its own, so
// project isolation is enforced through its parent Sequence, exactly as the
// action's own two-query shape (`seqs` then `inArray(shots.sequenceId,
// seqIds)`) does. No bound: the action's own query carries none either.
//
// The action gates this read behind `includeShots` (`:151`) — an
// intent-level choice this resolver does not and cannot see. `PROJECT.SHOTS`
// therefore always resolves, unconditionally: a resolver cannot be
// conditioned by an intent parameter (this ticket does not invent that
// mechanism), so a future descriptor that declares `PROJECT.SHOTS` pays its
// query even on a run where the block that would render it renders empty.
// The conditionality belongs to the `{variables, parameters, render}` block
// that will consume this variable (B7c-n4's variant), not to the resolver —
// see `.agents/executor_report.md`.
// ---------------------------------------------------------------------------

export type ProjectShotEntry = {
  title: string;
  description: string | null;
  actionPitch: string | null;
  continuityIn: string | null;
  continuityOut: string | null;
};

export async function resolveProjectShots(projectId: number): Promise<ProjectShotEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      title: shots.title,
      description: shots.description,
      actionPitch: shots.actionPitch,
      continuityIn: shots.continuityIn,
      continuityOut: shots.continuityOut,
    })
    .from(shots)
    .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
    .where(eq(sequences.projectId, projectId))
    .orderBy(asc(shots.orderIndex));
}

// ---------------------------------------------------------------------------
// PROJECT.ASSETS — anchors: project. LLMW.VAR.PROJECT_SCOPE.1 (B7c-n2).
// Fields (`name`, `type`) copied verbatim from `assetExtraction.ts`'s
// `existingAssets` query (`:124-127`). Ordering deviates deliberately: the
// action's own query carries no `orderBy` at all (implicit rowid order,
// which happens to track insertion but is not a declared sort key). This
// resolver orders by `asc(assets.orderIndex)` instead — the column that
// already backs the Asset library's own user-facing order (drag-reorder),
// unlike the action's incidental rowid order, and the only ordering that
// stays correct once a Project's assets are reordered by the user after
// insertion. See `.agents/executor_report.md` for this deviation, made
// explicit rather than silently copying an unordered read.
// ---------------------------------------------------------------------------

export type ProjectAssetEntry = {
  name: string;
  type: string;
};

export async function resolveProjectAssets(projectId: number): Promise<ProjectAssetEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({ name: assets.name, type: assets.type })
    .from(assets)
    .where(eq(assets.projectId, projectId))
    // Ordered by `id`, not by `orderIndex` — supervisor correction during the
    // B7c-n2 review. `assetExtraction.ts:124-127`, the source this variable
    // reproduces, issues its `existingAssets` query with **no** `ORDER BY` at
    // all, and SQLite answers a plain table scan in rowid order, which `id`
    // aliases. Sorting by `orderIndex` would have diverged from that de-facto
    // production order, and B7f's byte-for-byte proof against
    // `buildAssetsFromProjectPrompt` could easily have missed the divergence,
    // since a fixture usually inserts rows in `orderIndex` order anyway.
    // It would also have bought no determinism where it matters:
    // `orderIndex` defaults to `0` for every row (`src/db/schema/assets.ts`),
    // so on a project that never reordered its assets the sort is one large
    // tie and the real order falls back to the scan order regardless.
    .orderBy(asc(assets.id));
}

// ---------------------------------------------------------------------------
// SEQ.IDENTITY — anchors: sequence. LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §3bis
// of the ticket. The sequence anchor's own `id` and `title` — distinct from
// `SEQ.CONTEXT`, which projects `title` too (the overlap is accepted, each
// serves a different phrase) but never `id` (narrative context, not
// identity). Needed because `buildCastingFromSequencePrompt` embeds
// `input.sequence.id` in four places
// (`casting-from-sequence.ts:82,108,145,154`) and no existing variable
// carries an anchor's own id — `SEQ.SHOT_TARGETS` / `PROJECT.ASSET_LIBRARY`
// carry a *child* entity's id, never the parent's own. Same resolver
// contract as every other variable: reads the database, receives the
// already-verified anchor id, returns typed data, refuses loudly (`throw`)
// on a sequence not found — the same refusal shape `resolveSeqContext` and
// `resolveSeqCurrentPrompt` already use for the same anchor.
// ---------------------------------------------------------------------------

export type SeqIdentityData = {
  id: number;
  title: string;
};

export async function resolveSeqIdentity(sequenceId: number): Promise<SeqIdentityData> {
  const { db } = await import("@/db");
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence) {
    throw new Error(`resolveSeqIdentity: sequence ${sequenceId} not found.`);
  }
  return { id: sequence.id, title: sequence.title };
}

// ---------------------------------------------------------------------------
// SEQ.SHOT_TARGETS — anchors: sequence. LLMW.VAR.CASTING.1 (B7h-b1). The
// sequence's shots, **addressable** — carrying their own `id`, unlike
// `SEQ.SHOTS` (`:358-364` above), which never projects it. Fields copied
// verbatim from `generateCastingSuggestionsDraft`'s `shots` mapping
// (`src/actions/llm/castingSuggestions.ts:195-203`), which is exactly what
// `CastingFromSequenceInput.shots` (`src/lib/prompts/casting-from-sequence.ts`)
// consumes: `id`, `shotCode`, `title`, `description`, `actionPitch`,
// `continuityIn`, `continuityOut` — no more, no fewer. Ordering copied
// verbatim too: the action's own `shotList` query
// (`castingSuggestions.ts:141-145`) carries `orderBy(asc(shots.orderIndex))`,
// unlike `PROJECT.ASSETS`'s unordered source below — nothing to correct here.
// No bound: the action's own query carries none either.
// ---------------------------------------------------------------------------

export type SeqShotTargetEntry = {
  id: number;
  shotCode: string | null;
  title: string;
  description: string | null;
  actionPitch: string | null;
  continuityIn: string | null;
  continuityOut: string | null;
};

export async function resolveSeqShotTargets(sequenceId: number): Promise<SeqShotTargetEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      id: shots.id,
      shotCode: shots.shotCode,
      title: shots.title,
      description: shots.description,
      actionPitch: shots.actionPitch,
      continuityIn: shots.continuityIn,
      continuityOut: shots.continuityOut,
    })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId))
    .orderBy(asc(shots.orderIndex));
}


// ---------------------------------------------------------------------------
// PROJECT.ASSET_LIBRARY — anchors: project. LLMW.VAR.CASTING.1 (B7h-b1). The
// project's assets, **addressable** — carrying their own `id`, unlike
// `PROJECT.ASSETS` above, which never projects it and is left strictly
// unchanged (widening it would break `assetsFromProject`'s byte-for-byte
// proof, B7f). Fields copied verbatim from `generateCastingSuggestionsDraft`'s
// `assets` mapping (`castingSuggestions.ts:204-210`), exactly what
// `CastingFromSequenceInput.assets` consumes: `id`, `name`, `type`,
// `description`, `notes`. Ordering copied verbatim too: the action's own
// `assetLibrary` query (`castingSuggestions.ts:147-151`) carries
// `orderBy(asc(assets.orderIndex))` — unlike `assetExtraction.ts`'s
// unordered source for `PROJECT.ASSETS`, this source declares a real
// `ORDER BY`, so there is no scan-order correction to make here. No bound:
// the action's own query carries none either (it slices to 30 only inside
// the prompt builder, not the DB read).
// ---------------------------------------------------------------------------

export type ProjectAssetLibraryEntry = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
};

export async function resolveProjectAssetLibrary(projectId: number): Promise<ProjectAssetLibraryEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      id: assets.id,
      name: assets.name,
      type: assets.type,
      description: assets.description,
      notes: assets.notes,
    })
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.orderIndex));
}

// ---------------------------------------------------------------------------
// SEQ.EXISTING_CASTINGS — anchors: sequence. LLMW.VAR.CASTING.1 (B7h-b1).
// What is **already attributed** here: the plan→asset pairs of this
// sequence's shots, and the sequence→asset pairs of the sequence itself —
// **one** variable, because it answers one question, even though it reads
// two tables (§ of the ticket). Fields copied verbatim from
// `generateCastingSuggestionsDraft`'s two "existing castings" reads
// (`castingSuggestings.ts:163-177`), exactly what
// `CastingFromSequenceInput.existingShotCastings` / `.existingSequenceCastings`
// consume: `{shotId, assetId}` and `{assetId}`. The two levels are kept
// distinct in the return shape (`shotCastings` / `sequenceCastings`), never
// merged into one flat list, per the ticket's explicit instruction. No
// `ORDER BY` reproduced: the action's own two queries
// (`castingSuggestions.ts:165-171`, `:174-177`) carry none either — these are
// anti-duplicate lookup sets, not a rendered list, so there is no order to
// preserve or correct.
//
// Isolation: `shotCastings` is scoped to this sequence through an inner join
// on `shots` (`shotAssets.shotId -> shots.id`, `shots.sequenceId =
// sequenceId`) — a `shot_assets` row carries no `sequenceId` of its own, so
// project/sequence isolation for this half is enforced entirely through the
// join, exactly as `PROJECT.SHOTS` above enforces project isolation through
// its own join on `sequences`. `sequenceCastings` is scoped directly by
// `sequenceAssets.sequenceId`.
// ---------------------------------------------------------------------------

export type SeqExistingCastingsData = {
  shotCastings: Array<{ shotId: number; assetId: number }>;
  sequenceCastings: Array<{ assetId: number }>;
};

export async function resolveSeqExistingCastings(sequenceId: number): Promise<SeqExistingCastingsData> {
  const { db } = await import("@/db");
  const shotCastings = await db
    .select({ shotId: shotAssets.shotId, assetId: shotAssets.assetId })
    .from(shotAssets)
    .innerJoin(shots, eq(shotAssets.shotId, shots.id))
    .where(eq(shots.sequenceId, sequenceId));
  const sequenceCastings = await db
    .select({ assetId: sequenceAssets.assetId })
    .from(sequenceAssets)
    .where(eq(sequenceAssets.sequenceId, sequenceId));
  return { shotCastings, sequenceCastings };
}

// ---------------------------------------------------------------------------
// `castingFromSequence` render forms — LLMW.DESCRIPTOR.CASTING.1 (B7h-b2).
// Read verbatim off `buildCastingFromSequencePrompt`
// (`src/lib/prompts/casting-from-sequence.ts`) — the oracle, left untouched.
//
// The system message is one continuous template literal — no `parts` array,
// unlike the user message below — with two points that vary on
// `includeSequenceLevel` (an inline clause, and a whole bullet line) plus
// `JSON_SCHEMA(includeSeq)` itself, a function of that same boolean
// (`casting-from-sequence.ts:45-62`). Reproduced as a single
// `{variables, parameters, render}` block, on `assetsFromProject.systemBody`'s
// own precedent ("one continuous static template... reproduced as a single
// block rather than split") — here the block's *content* branches
// (`includeSequenceLevel`), not its shape, so one render form is still
// correct: `JSON_SCHEMA`'s own branch lives inside
// `castingFromSequenceJsonSchema` below, called with the same boolean the
// block already received, exactly mirroring the oracle's own
// `JSON_SCHEMA(includeSequenceLevel)` call. No branch of the builder is left
// unrepresented.
//
// The user message *does* branch by omission, exactly mirroring `parts:
// string[]` in the oracle: five blocks always pushed (background, sequence
// context, asset library, shots) or conditionally empty (existing castings,
// dropped when there are none) plus a sixth, always-non-empty closing
// instruction line — joined with the oracle's own `"\n\n"` separator. Since
// `parts` always has at least the background line, `parts.join("\n\n") +
// "\n\n" + targetInstruction...` (the oracle's own construction,
// `casting-from-sequence.ts:157-159`) is algebraically
// `[...parts, closingLine].join("\n\n")` — exactly what the block list,
// filtered of empties and joined by `"\n\n"`, produces.
// ---------------------------------------------------------------------------

const CASTING_VALID_ASSET_TYPES = ["character", "environment", "prop", "vehicle", "crowd", "other"] as const;

/** `JSON_SCHEMA` (`casting-from-sequence.ts:45-62`), verbatim — a function of
 * `includeSequenceLevel`, called from `renderCastingFromSequenceSystemBody`
 * exactly where the oracle calls it. Not exported: this render form's own
 * concern, not a shared building block. */
function castingFromSequenceJsonSchema(includeSeq: boolean): string {
  return `Always respond with a valid JSON object matching exactly this schema:
{
  "suggestions": [
    {
      "targetType": "${includeSeq ? "shot | sequence" : "shot"}",
      "targetId": <number — exact ID from the provided lists>,
      "targetLabel": "string — shot code + title, or sequence title",
      "assetId": <number — exact ID from the provided asset list>,
      "assetName": "string — asset name",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "reason": "string or null — one sentence explaining why this asset fits this shot",
      "confidence": "high | medium | low"
    }
  ]
}
No markdown. No explanation. Only the JSON object.
Maximum 60 suggestions total.`;
}

/** System: the entire message — `{variables: ["PROJECT.IDENTITY",
 * "SEQ.IDENTITY"], parameters: ["includeSequenceLevel"], render}`. */
export function renderCastingFromSequenceSystemBody(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const seqIdentity = input.variables["SEQ.IDENTITY"] as SeqIdentityData;
  const includeSequenceLevel = input.parameters.includeSequenceLevel as boolean;

  return `You are a casting director and production supervisor for the project "${project.name}".

Your task is to suggest which assets from the project's asset library should be cast into the provided shots${includeSequenceLevel ? " and optionally into the sequence itself" : ""}.

CASTING RULES:
- Use ONLY the asset IDs and shot IDs provided below. Never invent IDs or names.
- Prioritize: characters visible or implied in the action; environments matching the location; props, vehicles, or crowds clearly present or useful.
- Do not cast every asset into every shot. Be selective and production-relevant.
- Do not suggest castings that are already assigned (listed under "Already assigned").
- Make suggestions that will help the shot generation pipeline: cast assets that will appear in the visual output.${
    includeSequenceLevel
      ? "\n- Sequence-level casting: use targetType=\"sequence\" and targetId=" +
        seqIdentity.id +
        " only for assets that are thematically relevant to the full sequence (e.g., the main character or primary location)."
      : ""
  }
- confidence must be "high", "medium", or "low".
- reason must be one short sentence or null.
- Maximum 60 suggestions total.

${castingFromSequenceJsonSchema(includeSequenceLevel)}`;
}

/** Template block 1 — project background, always non-empty. `{variable:
 * "PROJECT.IDENTITY", render}`. Distinct from `assetsFromProject.backgroundLines`:
 * this oracle truncates `story`/`outline` to 200 chars and labels both
 * "(background)", which the Assets builder does not. */
export function renderCastingFromSequenceProjectBackgroundLines(data: ProjectIdentityData): string {
  const bgLines: string[] = [`Project: ${data.name}`];
  if (data.pitch?.trim()) bgLines.push(`Pitch: ${data.pitch.trim()}`);
  if (data.story?.trim()) bgLines.push(`Story (background): ${data.story.trim().slice(0, 200)}`);
  if (data.outline?.trim()) bgLines.push(`Outline (background): ${data.outline.trim().slice(0, 200)}`);
  return bgLines.join("\n");
}

/** Template block 2 — sequence context, always non-empty. `{variables:
 * ["SEQ.IDENTITY", "SEQ.CONTEXT"], render}`. The header line's id and title
 * come from `SEQ.IDENTITY` (this is exactly the case §3bis of the ticket
 * exists for); the five optional narrative lines come from `SEQ.CONTEXT`,
 * unchanged. */
export function renderCastingFromSequenceSequenceContextLines(
  seqIdentity: SeqIdentityData,
  seqContext: SeqContextData
): string {
  const seqLines: string[] = [`SEQUENCE [ID: ${seqIdentity.id}]: ${seqIdentity.title}`];
  if (seqContext.summary) seqLines.push(`Summary: ${seqContext.summary}`);
  if (seqContext.description) seqLines.push(`Description: ${seqContext.description}`);
  if (seqContext.narrativePurpose) seqLines.push(`Purpose: ${seqContext.narrativePurpose}`);
  if (seqContext.mood) seqLines.push(`Mood: ${seqContext.mood}`);
  if (seqContext.locationHint) seqLines.push(`Location: ${seqContext.locationHint}`);
  return seqLines.join("\n");
}

/** Template block 3 — asset library, always non-empty (even with zero
 * assets: the oracle still prints the "ASSET LIBRARY:" header). `{variable:
 * "PROJECT.ASSET_LIBRARY", render}`. */
export function renderCastingFromSequenceAssetLibraryLines(assetLibrary: ProjectAssetLibraryEntry[]): string {
  const assetLines = assetLibrary.slice(0, 30).map((a) => {
    const desc = a.description?.trim().slice(0, 150) ?? null;
    const notes = a.notes?.trim().slice(0, 80) ?? null;
    const detail = [desc, notes].filter(Boolean).join(" | ");
    return `[ASSET ID: ${a.id}] ${a.name} — ${a.type}${detail ? ` — ${detail}` : ""}`;
  });
  return `ASSET LIBRARY:\n${assetLines.join("\n")}`;
}

/** Template block 4 — shots, always non-empty (same "always print the
 * header" shape as the asset library block). `{variable: "SEQ.SHOT_TARGETS",
 * render}`. */
export function renderCastingFromSequenceShotsLines(shotTargets: SeqShotTargetEntry[]): string {
  const shotLines = shotTargets.slice(0, 15).map((s) => {
    const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
    const details: string[] = [];
    if (s.description) details.push(s.description.slice(0, 120));
    if (s.actionPitch) details.push(`Action: ${s.actionPitch.slice(0, 120)}`);
    if (s.continuityIn) details.push(`In: ${s.continuityIn.slice(0, 60)}`);
    if (s.continuityOut) details.push(`Out: ${s.continuityOut.slice(0, 60)}`);
    const detail = details.join(" | ");
    return `[SHOT ID: ${s.id}] ${label}${detail ? ` — ${detail}` : ""}`;
  });
  return `SHOTS:\n${shotLines.join("\n")}`;
}

/** Template block 5 — existing castings, empty (and dropped by
 * `assembleDescriptorMessages`) when there are none, matching the oracle's
 * own conditional `parts.push`. `{variables: ["SEQ.IDENTITY",
 * "SEQ.EXISTING_CASTINGS"], render}` — the sequence-level lines need the
 * current sequence's own id, from `SEQ.IDENTITY`. */
export function renderCastingFromSequenceExistingCastingsBlock(
  seqIdentity: SeqIdentityData,
  existing: SeqExistingCastingsData
): string {
  const existingLines: string[] = [];
  for (const c of existing.shotCastings) {
    existingLines.push(`Shot ${c.shotId} ← Asset ${c.assetId}`);
  }
  for (const c of existing.sequenceCastings) {
    existingLines.push(`Sequence ${seqIdentity.id} ← Asset ${c.assetId}`);
  }
  if (existingLines.length === 0) return "";
  return `ALREADY ASSIGNED (do not suggest these again):\n${existingLines.join("\n")}`;
}

/** Template block 6 — closing instruction line, always non-empty.
 * `{variables: ["SEQ.IDENTITY"], parameters: ["includeSequenceLevel"],
 * render}` — the sequence-level targetId in the instruction text comes from
 * `SEQ.IDENTITY`. */
export function renderCastingFromSequenceClosingInstructionLine(input: VariableParameterRenderInput): string {
  const seqIdentity = input.variables["SEQ.IDENTITY"] as SeqIdentityData;
  const includeSequenceLevel = input.parameters.includeSequenceLevel as boolean;

  const targetInstruction = includeSequenceLevel
    ? `Suggest which assets should be cast into each shot. You may also suggest sequence-level castings (targetType="sequence", targetId=${seqIdentity.id}) for assets that are central to the whole sequence.`
    : "Suggest which assets should be cast into each shot.";

  return `${targetInstruction} Use only the exact IDs provided above. Do not invent IDs, asset names, or shot names.`;
}

// ---------------------------------------------------------------------------
// `castingFromSequence.filterAndEnrich` — the `postResponse` form
// (LLMW.POSTRESPONSE.1, B7g's mechanism), reproducing
// `generateCastingSuggestionsDraft`'s own filter/enrich pass
// (`castingSuggestions.ts:231-271`) verbatim, in the same order (§3 of the
// ticket): filter on existence, compute `alreadyAssigned`, enrich display
// fields from local data — never from what the model proposed ("don't trust
// LLM names"). This is where the `RunOperationResult`/`PostResponseFormInput`
// boolean widening (§1 of the ticket) is actually used: `alreadyAssigned` is
// never parsed by `output.item.fields` (the write side does not read it
// either, per the ticket's own measurement) — it exists only as this form's
// own computed output.
//
// `targetType`/`targetId`/`assetId` are declared `"string"`/`"number"` (not
// `"enum"`/dropped) on the descriptor's `output.item.fields` — `item.validity`
// (frozen, §4.1 of `types.ts`) can only gate on non-empty *string* fields, so
// it cannot express `normalizeRawSuggestion`'s own "unknown targetType, or a
// non-positive-integer id, drops the whole item" gate. That gate is
// reproduced here instead: an item whose `targetType` is neither `"shot"`
// nor `"sequence"` is dropped, on the same principle as the three existence
// rules the ticket names explicitly — not "improving" the oracle, just
// relocating its equivalent gate to the one pipeline stage that can express
// it. `targetId`/`assetId` use `fallback: "omit"` (`readNumberField`,
// `runner.ts`), so a model-omitted or out-of-range id is simply absent from
// the item here — treated as "not found" by the same existence checks below,
// which is the observable behaviour the oracle's own drop already produces.
// ---------------------------------------------------------------------------

function castingFromSequenceNormalizeAssetType(raw: unknown): (typeof CASTING_VALID_ASSET_TYPES)[number] {
  if (typeof raw === "string" && (CASTING_VALID_ASSET_TYPES as readonly string[]).includes(raw)) {
    return raw as (typeof CASTING_VALID_ASSET_TYPES)[number];
  }
  return "other";
}

export function renderCastingFromSequenceFilterAndEnrich(
  input: PostResponseFormInput
): Array<Record<string, string | number | boolean>> {
  const shotTargets = input.variables["SEQ.SHOT_TARGETS"] as SeqShotTargetEntry[];
  const assetLibrary = input.variables["PROJECT.ASSET_LIBRARY"] as ProjectAssetLibraryEntry[];
  const existing = input.variables["SEQ.EXISTING_CASTINGS"] as SeqExistingCastingsData;
  const seqIdentity = input.variables["SEQ.IDENTITY"] as SeqIdentityData;
  // The frozen contract (§2 of the ticket): the current sequence's id comes
  // from the operation's own already-validated anchor, not from a variable —
  // this is the one comparison `PostResponseFormInput.anchorIds` exists for.
  const sequenceId = input.anchorIds.sequenceId as number;

  const shotById = new Map(shotTargets.map((s) => [s.id, s] as const));
  const assetById = new Map(assetLibrary.map((a) => [a.id, a] as const));
  const shotCastingKeys = new Set(existing.shotCastings.map((c) => `${c.shotId}:${c.assetId}`));
  const sequenceCastingAssetIds = new Set(existing.sequenceCastings.map((c) => c.assetId));

  const result: Array<Record<string, string | number | boolean>> = [];

  for (const item of input.items) {
    const targetType = item.targetType;
    // `fallback: "omit"` numeric fields may be absent from `item` entirely —
    // read defensively, matching `mapListItemToModelKeys`'s own documented
    // "absent, not present-as-empty" contract (`benchRun.ts`).
    const targetId = item.targetId as number | undefined;
    const assetId = item.assetId as number | undefined;

    if (targetType !== "shot" && targetType !== "sequence") continue;
    if (assetId == null || !assetById.has(assetId)) continue;
    if (targetType === "shot" && (targetId == null || !shotById.has(targetId))) continue;
    if (targetType === "sequence" && targetId !== sequenceId) continue;

    const assetRecord = assetById.get(assetId)!;
    // Non-null by construction: the filter above already refused any "shot"
    // item whose `targetId` is not a real shot of this sequence — matching
    // the oracle's own dead fallback branch (`castingSuggestions.ts:257`,
    // `raw.targetLabel`, unreachable once filtering runs first).
    const shotRecord = targetType === "shot" ? shotById.get(targetId as number) : undefined;

    const alreadyAssigned =
      targetType === "shot"
        ? shotCastingKeys.has(`${targetId}:${assetId}`)
        : sequenceCastingAssetIds.has(assetId);

    const targetLabel =
      targetType === "shot"
        ? shotRecord!.shotCode
          ? `${shotRecord!.shotCode} — ${shotRecord!.title}`
          : shotRecord!.title
        : seqIdentity.title;

    result.push({
      ...item,
      targetLabel,
      assetName: assetRecord.name,
      assetType: castingFromSequenceNormalizeAssetType(assetRecord.type),
      alreadyAssigned,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// `assetsFromProject` render forms — LLMW.DESCRIPTOR.ASSETS.1 (B7f). Read
// verbatim off `buildAssetsFromProjectPrompt`
// (`src/lib/prompts/assets-from-project.ts`) — the oracle, left untouched.
// `typesStr` is `input.assetTypes.join(", ")` on the oracle's own
// `AssetType[]`; every render form below recomputes it the same way from the
// normalized `assetTypes` parameter (a `"multiEnum"` value — always an array
// once normalized, never `undefined`, since the descriptor declares a
// `default`).
//
// The system message is one continuous static template — no branch at all,
// only two interpolation points (`project.name` once, `typesStr` twice) — so
// it is reproduced as a single `{variables, parameters, render}` block rather
// than split across several: splitting a template with no seam would only
// invite a join-separator mismatch for no reproduction benefit.
//
// The user message *does* branch, exactly mirroring `parts: string[]` in the
// oracle: five blocks — background (always non-empty), outline-or-story
// (mutually exclusive, possibly neither), sequences, shots (gated on both
// `includeShots` and a non-empty `PROJECT.SHOTS`), existing assets — joined
// with the oracle's own `"\n\n"` separator (not the `"\n"` every other
// descriptor uses), plus a sixth, always-non-empty closing-line block. Since
// `parts` always has at least the background line, `parts.join("\n\n") +
// "\n\n" + finalLine` (the oracle's own construction) is algebraically
// `[...parts, finalLine].join("\n\n")` — exactly what the block list, filtered
// of empties and joined by `"\n\n"`, produces.
// ---------------------------------------------------------------------------

const ASSETS_FROM_PROJECT_JSON_SCHEMA = `Always respond with a valid JSON object matching exactly this schema:
{
  "assets": [
    {
      "name": "string — concise production name, 1–4 words",
      "assetType": "character | environment | prop | vehicle | crowd | other",
      "description": "string or null — visual and production description: appearance, physical characteristics, visual style",
      "notes": "string or null — narrative role, story context, design constraints, usage context",
      "sourceLevel": "outline | sequence | shot | story — which level of narrative this was extracted from",
      "sourceExcerpt": "string or null — short verbatim quote (max 100 chars) from the source material, or null",
      "duplicateWarning": "string or null — exact name of a matching existing asset if this is likely a duplicate, otherwise null"
    }
  ]
}
No markdown. No explanation. Only the JSON object.`;

function assetsFromProjectTypesStr(assetTypes: unknown): string {
  return Array.isArray(assetTypes) ? (assetTypes as string[]).join(", ") : "";
}

/** System: the entire message — no branch, only `project.name` and `typesStr` interpolated. */
export function renderAssetsFromProjectSystemBody(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const typesStr = assetsFromProjectTypesStr(input.parameters.assetTypes);
  return `You are a production asset supervisor and art department coordinator for the project "${project.name}".

Your task is to extract a list of production assets from the provided narrative material.
Production assets are reusable elements that must be designed, cast, or visually generated: named characters, key locations and environments, significant props, vehicles, crowd scenes.

EXTRACTION RULES:
- Extract only significant, named, or recurring assets — not every incidental detail.
- Favor assets that appear across multiple sequences, drive the narrative, or require dedicated visual design.
- Do not invent assets not mentioned or strongly implied by the narrative.
- Maximum 20 assets total.
- Asset types to extract: ${typesStr}

DUPLICATE DETECTION:
- The existing project asset list is provided. Compare each candidate against it.
- If a candidate closely matches an existing asset (same name, very similar name, or clearly the same entity), set "duplicateWarning" to the exact name of the matching existing asset.
- Otherwise, set "duplicateWarning" to null.

FIELD MAPPING:
- name: concise production name (1–4 words)
- assetType: one of ${typesStr}
- description: visual/production description — appearance, physical traits, visual style. String or null.
- notes: narrative role, story context, design constraints, usage context. String or null.
- sourceLevel: "outline" if found in outline, "sequence" if found in sequences only, "shot" if found in shots only, "story" if found in story/pitch only.
- sourceExcerpt: short verbatim quote (max 100 chars) from the source material where this asset appears. String or null.
- duplicateWarning: name of matching existing asset if likely duplicate, otherwise null.

${ASSETS_FROM_PROJECT_JSON_SCHEMA}`;
}

/** Template, block 1: `Project: ...` / conditional `Pitch:` / conditional `Story:` (only when no outline). Always non-empty. */
export function renderAssetsFromProjectBackgroundLines(data: ProjectIdentityData): string {
  const hasOutline = !!data.outline?.trim();
  const lines: string[] = [`Project: ${data.name}`];
  if (data.pitch?.trim()) lines.push(`Pitch: ${data.pitch.trim()}`);
  if (!hasOutline && data.story?.trim()) lines.push(`Story: ${data.story.trim().slice(0, 400)}`);
  return lines.join("\n");
}

/** Template, block 2: the outline block when present, else the story block when present, else empty — mutually exclusive, matching the oracle's `if (hasOutline) {...} else if (story) {...}`. */
export function renderAssetsFromProjectOutlineOrStoryBlock(data: ProjectIdentityData): string {
  const hasOutline = !!data.outline?.trim();
  if (hasOutline) {
    return `PROJECT OUTLINE (primary narrative source):\n${data.outline!.trim().slice(0, 1500)}`;
  }
  if (data.story?.trim()) {
    return `PROJECT STORY (use as narrative background):\n${data.story.trim().slice(0, 400)}`;
  }
  return "";
}

/** Template, block 3: `SEQUENCES:\n...`, one `- title | ...` line per entry, sliced to 2000 chars. Empty when there are none. */
export function renderAssetsFromProjectSequencesBlock(entries: ProjectSequenceEntry[]): string {
  if (entries.length === 0) return "";
  const seqLines: string[] = [];
  for (const seq of entries) {
    const line: string[] = [`- ${seq.title}`];
    if (seq.summary) line.push(`Summary: ${seq.summary}`);
    if (seq.description) line.push(`Description: ${seq.description}`);
    if (seq.narrativePurpose) line.push(`Purpose: ${seq.narrativePurpose}`);
    if (seq.mood) line.push(`Mood: ${seq.mood}`);
    if (seq.locationHint) line.push(`Location: ${seq.locationHint}`);
    seqLines.push(line.join(" | "));
  }
  const seqBlock = `SEQUENCES:\n${seqLines.join("\n")}`;
  return seqBlock.slice(0, 2000);
}

/** Template, block 4: `SHOTS:\n...`, gated on both `includeShots` and a non-empty `PROJECT.SHOTS`, sliced to 1500 chars. */
export function renderAssetsFromProjectShotsBlock(input: VariableParameterRenderInput): string {
  const includeShots = input.parameters.includeShots === true;
  const shotsData = input.variables["PROJECT.SHOTS"] as ProjectShotEntry[];
  if (!includeShots || shotsData.length === 0) return "";
  const shotLines: string[] = [];
  for (const shot of shotsData) {
    const line: string[] = [`- ${shot.title}`];
    if (shot.description) line.push(shot.description);
    if (shot.actionPitch) line.push(`Action: ${shot.actionPitch}`);
    if (shot.continuityIn) line.push(`In: ${shot.continuityIn}`);
    if (shot.continuityOut) line.push(`Out: ${shot.continuityOut}`);
    shotLines.push(line.join(" | "));
  }
  const shotBlock = `SHOTS:\n${shotLines.join("\n")}`;
  return shotBlock.slice(0, 1500);
}

/** Template, block 5: `EXISTING ASSETS (...):\n...`, one `- name (type)` line per entry. Empty when there are none. */
export function renderAssetsFromProjectExistingAssetsBlock(entries: ProjectAssetEntry[]): string {
  if (entries.length === 0) return "";
  const existingLines = entries.map((a) => `- ${a.name} (${a.type})`).join("\n");
  return `EXISTING ASSETS (for duplicate detection — do not re-create these unless significantly different):\n${existingLines}`;
}

/** Template, block 6: the closing instruction line, interpolating `typesStr`. Always non-empty. */
export function renderAssetsFromProjectFinalInstructionLine(assetTypes: unknown): string {
  const typesStr = assetsFromProjectTypesStr(assetTypes);
  return `Extract up to 20 production assets from the above narrative material. Asset types to include: ${typesStr}.`;
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
// ASSET.LIGHTING — anchors: asset. LLMW.LIGHTING.1 (B15a), §5.9 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md. One-field read, on the model of
// ASSET.CORE — an explicit throw when the asset does not exist, no bound.
// Present on every Asset row regardless of `type` (the schema carries no
// conditional column); it is `SEQ.LIGHTING`'s own resolver, below, that
// reads this same column only through `type: "environment"` Assets.
// ---------------------------------------------------------------------------

export type AssetLightingData = {
  lighting: string | null;
};

export async function resolveAssetLighting(assetId: number): Promise<AssetLightingData> {
  const { db } = await import("@/db");
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) {
    throw new Error(`resolveAssetLighting: asset ${assetId} not found.`);
  }
  return { lighting: asset.lighting ?? null };
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
  cameraSubject: string | null;
};

export async function resolveAssetShotAppearances(assetId: number): Promise<AssetShotAppearanceEntry[]> {
  const { db } = await import("@/db");
  return db
    .select({
      shotCode: shots.shotCode,
      title: shots.title,
      description: shots.description,
      actionPitch: shots.actionPitch,
      cameraSubject: shots.cameraSubject,
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
    if (s.cameraSubject) parts.push(`camera: ${s.cameraSubject.slice(0, 80)}`);
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
// `asset.retakeDirected` render forms — LLMW.UC3.ASSET_RETAKE.1 (B10). Same
// "no oracle" situation as `shot.retakeDirected` (B9b): every block below is
// authored for this ticket, not transcribed from a builder — see
// `.agents/executor_report.md` for the resolved prompt.
// ---------------------------------------------------------------------------

/**
 * ASSET.BIBLE, `asset.retakeDirected`'s own render form — not
 * `assetBible.existingBibleLines` (§2 of the ticket): that form's header,
 * "Existing Asset Bible (improve/complete, do not contradict without
 * reason)", frames the Bible as something this operation is about to write.
 * It never is here — the Asset Bible is read-only input (§0 of the ticket:
 * `visualIdentity`/`usageRules`/`forbiddenVariations` are context, never
 * committed) — so a neutral, non-editorial header is used instead. Empty
 * when the Asset carries no Bible yet, matching the reused form's own
 * "nothing to say" behaviour.
 */
export function renderAssetRetakeBibleLines(data: AssetBibleData): string {
  const hasBible = data.visualIdentity?.trim() || data.usageRules?.trim() || data.forbiddenVariations?.trim();
  if (!hasBible) return "";
  const lines: string[] = [`\nAsset Bible (reference — describes the intended design, not the file to edit):`];
  if (data.visualIdentity?.trim()) lines.push(`Visual Identity: ${data.visualIdentity.trim()}`);
  if (data.usageRules?.trim()) lines.push(`Usage Rules: ${data.usageRules.trim()}`);
  if (data.forbiddenVariations?.trim()) lines.push(`Forbidden Variations: ${data.forbiddenVariations.trim()}`);
  return lines.join("\n");
}

/**
 * ASSET.SHOT_APPEARANCES, `asset.retakeDirected`'s own render form — not
 * `assetContext.shotAppearancesLines` (§2 of the ticket): that form projects
 * five fields including `cameraPitch`, while §4 UC3 asks for exactly
 * Description and Action Pitch from each Shot, plus an identifier so the
 * Shot is nameable. This is the point §4 UC3 exists to prove — the variable
 * library can project a chosen subset of fields across a relation, not just
 * repeat a fixed shape — so this form is deliberately narrower than the one
 * it sits beside in the registry, not a copy of it. Empty when the Asset
 * appears in no Shot, matching every other "nothing to say" render form in
 * this file (never a bare, empty header).
 */
export function renderAssetRetakeShotAppearancesLines(entries: AssetShotAppearanceEntry[]): string {
  if (entries.length === 0) return "";
  const lines: string[] = [`\nShots this Asset appears in:`];
  for (const s of entries) {
    const label = s.shotCode ? `${s.shotCode} — ${s.title}` : s.title;
    const parts: string[] = [`- ${label}`];
    if (s.description?.trim()) parts.push(s.description.trim());
    if (s.actionPitch?.trim()) parts.push(`action: ${s.actionPitch.trim()}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

const ASSET_RETAKE_FREE_TEXT_MAX_LENGTH = 500;

/**
 * The director's free-text direction — same "absent/empty/blank -> empty
 * string" contract as every other `intent.freeText` render form in this file
 * (B9a's own), reused verbatim rather than re-derived.
 */
export function renderAssetRetakeFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's direction: ${trimmed.slice(0, ASSET_RETAKE_FREE_TEXT_MAX_LENGTH)}`;
}

/**
 * `asset.retakeDirected`'s system rule instructing the model to read the
 * director's direction — B10's own corrective manche, defect 1: the rule
 * used to be an unconditional block, so a note-less prompt still told the
 * model to "respond to the director's direction below" when no direction
 * was in the prompt at all (the same fault UC2's `shot.retakeDirected` was
 * sent back for, at the `template`'s closing line rather than the
 * `system`). Same "absent/empty/blank -> empty string" contract as
 * `renderAssetRetakeFreeTextDirective` above, so `assembleBlocks` drops this
 * block before the system message is joined whenever there is no note —
 * leaving the `system` **with** a note byte-for-byte unchanged from before
 * this correction.
 */
export function renderAssetRetakeDirectorRuleLine(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return "- Respond to the director's direction below: it names what is wrong with the current design and what to change.";
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
  if (shot.cameraSubject?.trim()) lines.push(`Camera intent: ${shot.cameraSubject}`);
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

/** System: fixed role text for `shot.insertDirected` (LLMW.UC1.INSERT.1, B11-b2) — the ticket's own literal wording, reproduced verbatim. */
export const SHOT_INSERT_SYSTEM_INTRO =
  "You are a storyboard supervisor on an animation production. You write single shots that slot into an existing sequence without breaking its continuity, using the professional vocabulary a layout or animation team can act on.";

/** Template: the Shot being retaken — its own narrative fields, not its camera/movement (§0bis: shotSize/cameraMovement are never read or written by this operation). */
export function renderShotCoreRetakeLines(shot: ShotCoreData): string {
  const label = shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title;
  const lines: string[] = [`Shot being retaken: ${label}`];
  lines.push(shot.description?.trim() ? `Current description: ${shot.description.trim()}` : `Current description: (none)`);
  lines.push(shot.actionPitch?.trim() ? `Current action pitch: ${shot.actionPitch.trim()}` : `Current action pitch: (none)`);
  lines.push(shot.cameraSubject?.trim() ? `Current camera subject: ${shot.cameraSubject.trim()}` : `Current camera subject: (none)`);
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
// `shot.insertDirected` render forms — LLMW.UC1.INSERT.1 (B11-b2). Same "no
// oracle" situation as `shot.retakeDirected` (B9b) and `asset.retakeDirected`
// (B10): every block below is authored for this ticket, not transcribed from
// a pre-existing builder. Proof is unit-level assembly plus the
// human-readable resolved prompt in `.agents/executor_report.md`.
//
// The system-message "Answer the director's direction below" bullet is its
// own conditional block (`renderShotInsertDirectiveRuleLine`, dispatched
// through `FREE_TEXT_RENDER_FORMS` like `assetRetake.directorRuleLine`
// already is), not folded into the static rules text the ticket's own
// literal wording shows: with an empty consigne, that line would tell the
// model to read a direction that is not in the prompt at all — the exact
// piège named by the ticket (§ "Validation attendue" point 2), already sent
// B9b and B10 back once each, at the user-message and system-message level
// respectively. With a consigne present, this block's own text plus the
// surrounding blocks reproduce the ticket's literal wording byte-for-byte.
// ---------------------------------------------------------------------------

const SHOT_INSERT_FREE_TEXT_MAX_LENGTH = 500;

/** System: the conditional "Answer the director's direction below" rule — empty (and dropped) with no consigne, present only then. See the section header above for why this is not folded into the static rules text. */
export function renderShotInsertDirectiveRuleLine(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return "- Answer the director's direction below. It is the brief, not a suggestion — if it names a camera height, an entrance, an exit or an intent, your shot must show it.";
}

/** Template: the director's free-text direction — same "absent/empty/blank -> empty string" contract as every other `intent.freeText` render form in this file. */
export function renderShotInsertFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's direction: ${trimmed.slice(0, SHOT_INSERT_FREE_TEXT_MAX_LENGTH)}`;
}

/** Template: the Project's identity — name always, pitch/story where present, on the same "always print a minimal header" precedent as `castingFromSequence.projectBackgroundLines`. */
export function renderShotInsertProjectLines(project: ProjectIdentityData): string {
  const lines: string[] = [`Project: ${project.name}`];
  if (project.pitch?.trim()) lines.push(`Pitch: ${project.pitch.trim()}`);
  if (project.story?.trim()) lines.push(`Story: ${project.story.trim().slice(0, 400)}`);
  return lines.join("\n");
}

/** Template: the Sequence's own narrative context — title always, the rest where present. */
export function renderShotInsertSequenceLines(seq: SeqContextData): string {
  const lines: string[] = [`\nSequence: ${seq.title}`];
  if (seq.summary?.trim()) lines.push(`Summary: ${seq.summary.trim()}`);
  if (seq.narrativePurpose?.trim()) lines.push(`Purpose: ${seq.narrativePurpose.trim()}`);
  if (seq.mood?.trim()) lines.push(`Mood: ${seq.mood.trim()}`);
  if (seq.locationHint?.trim()) lines.push(`Location: ${seq.locationHint.trim()}`);
  return lines.join("\n");
}

/**
 * Template: the Sequence's shots, addressable and carrying their own
 * continuity — what the model reads to leave the preceding shot and arrive
 * at the following one. Always printed, even for an empty sequence (same
 * "always print the header" precedent as `castingFromSequence.shotsLines`),
 * so the model still receives the insertion instruction below with a
 * coherent context.
 *
 * LLMW.UC1.TUNE.1 (S7), défaut 3 — this render form now knows the insertion
 * point (`afterShotId`), so it can render fully only the shots the model
 * actually has to raccorder against, and everything else as a single title
 * line — a 14-shot sequence went from ~2477 to a bounded cost with no
 * mid-word truncation anywhere (see `.agents/executor_report.md` for the
 * before/after count). `SEQ.SHOT_TARGETS` itself carries no bound and none is
 * added here: `casting.fromSequence` holds a frozen byte-for-byte proof
 * against the same variable, and this ticket's own text names bounding it as
 * the trap to avoid. Only this render form — the shape that belongs to
 * `shot.insertDirected` alone — narrows what is shown.
 *
 * Neighbor selection: `afterShotId` names the insertion index (one past the
 * named shot, or `0` when absent/foreign — `renderShotInsertPositionLine`'s
 * own fallback). The four indices `insertionIndex - 2 .. insertionIndex + 1`
 * (clipped to the sequence's bounds) are the "two shots framing the
 * insertion point, plus one more on each side" the ticket names — up to four
 * shots, fewer at either end of the sequence. Those render in full, with no
 * truncation of any field. Every other shot renders as `[ID: <id>] <code> —
 * <title>` only.
 */
export function renderShotInsertShotListLines(input: VariableParameterRenderInput): string {
  const shotTargets = input.variables["SEQ.SHOT_TARGETS"] as SeqShotTargetEntry[];
  if (shotTargets.length === 0) {
    return "\nSHOTS IN THIS SEQUENCE: (none yet — this will be the first shot)";
  }
  const afterShotId = input.parameters.afterShotId as number | undefined;
  const anchorIndex = afterShotId != null ? shotTargets.findIndex((s) => s.id === afterShotId) : -1;
  const insertionIndex = anchorIndex === -1 ? 0 : anchorIndex + 1;
  const neighborIndices = new Set(
    [insertionIndex - 2, insertionIndex - 1, insertionIndex, insertionIndex + 1].filter(
      (i) => i >= 0 && i < shotTargets.length
    )
  );
  const lines = shotTargets.map((s, index) => {
    // LLMW.UC1.TUNE.2 (S7b), défaut 1 — a quoted title, no em dash: the
    // model imitated our own `Code — Title` rendering when it wrote a
    // fabricated code into `title`. See `renderShotInsertPositionLine` just
    // below for the second, identical spot.
    const label = s.shotCode ? `${s.shotCode} "${s.title}"` : s.title;
    if (!neighborIndices.has(index)) {
      return `[ID: ${s.id}] ${label}`;
    }
    const details: string[] = [];
    if (s.description) details.push(s.description);
    if (s.actionPitch) details.push(`Action: ${s.actionPitch}`);
    if (s.continuityIn) details.push(`In: ${s.continuityIn}`);
    if (s.continuityOut) details.push(`Out: ${s.continuityOut}`);
    const detail = details.join(" | ");
    return `[ID: ${s.id}] ${label}${detail ? ` — ${detail}` : ""}`;
  });
  return `\nSHOTS IN THIS SEQUENCE:\n${lines.join("\n")}`;
}

/** Template: the insertion position, named in clear text — `{variables: ["SEQ.SHOT_TARGETS"], parameters: ["afterShotId"], render}`. `afterShotId` absent, or naming a shot this sequence does not have, both render "at the very start" — `createShotAtPosition`'s own contract (§2 of the ticket) for an absent `afterShotId`; a stale/foreign id degrades to the same safe text rather than a broken sentence, though only the two cases the ticket names are proven by test. */
export function renderShotInsertPositionLine(input: VariableParameterRenderInput): string {
  const shotTargets = input.variables["SEQ.SHOT_TARGETS"] as SeqShotTargetEntry[];
  const afterShotId = input.parameters.afterShotId as number | undefined;
  const target = afterShotId != null ? shotTargets.find((s) => s.id === afterShotId) : undefined;
  if (!target) {
    return "\nInsert the new shot at the very start of the sequence.";
  }
  // LLMW.UC1.TUNE.2 (S7b), défaut 1 — same quoted-title, no-em-dash fix as
  // `renderShotInsertShotListLines` above.
  const label = target.shotCode ? `${target.shotCode} "${target.title}"` : target.title;
  return `\nInsert the new shot after ${label}.`;
}

// ---------------------------------------------------------------------------
// `shot.lightingDirected` / `sequence.lightingDirected` render forms —
// LLMW.LIGHTING.DIRECTED.1 (B16c), closing B16. §5.9's third way of filling
// the lighting field: "by director's note ... not a regeneration, an
// adjustment of what is already there." Mechanically the same shape as
// `shot.retakeDirected` (B9b) — `intent.freeText` over an operation that
// reads the current value as one of its own variables — applied to one
// field, `output.kind: "text"` (prose, not a JSON object) like
// `narrativePrompt.compose` and `lighting.fromImage`. No adapter exists for
// either operation (both live at the bench only), so neither declares
// `messages.invalidRequest` — the same "absent is honest, invented is not"
// rule those two descriptors already follow.
//
// `sequence.lightingDirected`'s current-value line is the one render form in
// this pair with real branching: `SEQ.LIGHTING` (B15a) carries a précédence
// rule and reports its own `source` (`"own" | "environment" | "none"`) —
// this render form is the one place that rule surfaces as words the model
// reads, telling it plainly whether the value it is adjusting is the
// Sequence's own or inherited from an environment Asset. It does not
// re-derive the rule; it only renders what `resolveSeqLighting` already
// decided.
// ---------------------------------------------------------------------------

const SHOT_LIGHTING_DIRECTED_FREE_TEXT_MAX_LENGTH = 500;
const SEQUENCE_LIGHTING_DIRECTED_FREE_TEXT_MAX_LENGTH = 500;

/** System: fixed role text. */
export const SHOT_LIGHTING_DIRECTED_SYSTEM_INTRO =
  "You are a film lighting supervisor helping a director adjust a Shot's lighting description.";

/** System: fixed role text — the Sequence-level counterpart. */
export const SEQUENCE_LIGHTING_DIRECTED_SYSTEM_INTRO =
  "You are a film lighting supervisor helping a director adjust a Sequence's lighting description.";

/**
 * System: the rules block shared in substance by both descriptors (only the
 * opening word — "Shot"/"Sequence" — differs), covering §5.9's own framing
 * ("not a regeneration, an adjustment") and the empty-note decision recorded
 * in `.agents/executor_report.md`: with no director's note, the model is
 * told to return the current value unchanged rather than invent one, since
 * no `PreconditionRef` variant can refuse the run itself on an empty
 * `intent.freeText` (`types.ts`'s closed set carries no such variant, and
 * this ticket does not add one).
 */
function lightingDirectedSystemRules(entityLabel: "Shot" | "Sequence"): string {
  return `Rules:
- Read the current lighting description above as the starting point, and rewrite it according to the director's note below.
- The result replaces the current lighting description entirely — write a complete, self-contained lighting description, not a diff, not a list of changes, not a comment on the note.
- Carry forward everything about the current lighting that the note does not ask you to change.
- If no director's note is given below, return the current lighting description exactly as provided above, unchanged.
- Stay grounded in what is actually described above — do not invent story facts about this ${entityLabel} that are not present in the input.
- Write in plain English prose. No JSON, no markdown, no bullet list, no code fences.`;
}

export const SHOT_LIGHTING_DIRECTED_SYSTEM_RULES = lightingDirectedSystemRules("Shot");
export const SEQUENCE_LIGHTING_DIRECTED_SYSTEM_RULES = lightingDirectedSystemRules("Sequence");

/** Template: the Shot's own current lighting value — the ingredient this operation adjusts. `SHOT.LIGHTING` carries no fallback (only `SEQ.LIGHTING` does), so an empty value here is a real state, guarded by this descriptor's own `preconditions` entry on `anchorField: "lighting"` in production; still rendered defensively here since this function is also called directly by the render tests. */
export function renderShotLightingDirectedCurrentLine(data: ShotLightingData): string {
  const value = data.lighting?.trim();
  return `Current lighting: ${value ? value : "(none)"}`;
}

/** Template: the director's free-text note — the same "absent/empty/blank -> empty string" contract as every other `intent.freeText` render form in this file. */
export function renderShotLightingDirectedFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's note: ${trimmed.slice(0, SHOT_LIGHTING_DIRECTED_FREE_TEXT_MAX_LENGTH)}`;
}

/**
 * Template: the Sequence's current lighting value, per `SEQ.LIGHTING`'s own
 * `source` — `"own"` prints the Sequence's own field; `"environment"` prints
 * every contributing environment Asset by name, each with its own lighting
 * (or an explicit "(no lighting recorded)" when that Asset's own field is
 * blank — `resolveSequenceEnvironmentAssets` never filters by non-emptiness,
 * so this branch must handle a blank one), and says plainly that the value
 * is inherited, never silently presenting it as the Sequence's own;
 * `"none"` states there is nothing recorded at all — the one state this
 * descriptor's own `preconditions` (see the descriptor's header comment for
 * why none is declared) does not guard against, so this render form must
 * degrade honestly rather than assume a non-empty value.
 */
export function renderSequenceLightingDirectedCurrentLine(data: SeqLightingData): string {
  if (data.source === "own") {
    return `Current lighting (set directly on this Sequence): ${data.lighting}`;
  }
  if (data.source === "environment") {
    const lines = data.environments.map(
      (e) => `- ${e.name}: ${e.lighting?.trim() ? e.lighting.trim() : "(no lighting recorded)"}`
    );
    return `Current lighting (this Sequence has none of its own — inherited from its environment Asset(s)):\n${lines.join("\n")}`;
  }
  return "Current lighting: (none recorded — neither this Sequence nor any of its environment Assets has a lighting description)";
}

/** Template: the director's free-text note — the Sequence-level counterpart of `renderShotLightingDirectedFreeTextDirective`. */
export function renderSequenceLightingDirectedFreeTextDirective(freeText: string | undefined): string {
  const trimmed = freeText?.trim();
  if (!trimmed) return "";
  return `\nDirector's note: ${trimmed.slice(0, SEQUENCE_LIGHTING_DIRECTED_FREE_TEXT_MAX_LENGTH)}`;
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
  // `?? 6` (here and the four siblings below) is deliberately kept, even
  // though `normalizeIntentParameters` (`runner.ts`, LLMW.PARAM.BOUNDS.1,
  // B7e-n) now applies `targetCount`'s declared bound/default before this
  // render form ever runs on the production path, making this fallback
  // redundant there. These render forms are also called directly, with a
  // hand-built input, by the render-level tests
  // (`shotsFromSequence.render.test.ts` and its siblings) — the frozen
  // proofs of the B1c render-form discipline. Removing `?? 6` would break
  // those tests for no production gain: an assumed duplication, kept and
  // explained, not an oversight.
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

/** System, common tail — the JSON schema, identical on both paths, needs only `targetCount`. Own leading `"\n"` (§4.1 correction 4's device) to reopen the blank line the block-separator alone cannot produce. The five camera lines (`shot_size`/`camera_position`/`camera_movement`/`movement_speed`/`camera_subject`) are rendered by `cameraInstruction.ts` (B19d) — not typed here — the same module `shotInsertDirected.ts` calls, so the two instructions never disagree on a value again. `camera_pitch` is gone: B19c made it read-only, no model writes it any more. */
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
      ${renderCameraFieldSchemaLine("shot_size")},
      ${renderCameraFieldSchemaLine("camera_position")},
      ${renderCameraFieldSchemaLine("camera_movement")},
      ${renderCameraFieldSchemaLine("movement_speed")},
      ${renderCameraFieldSchemaLine("camera_subject")},
      ${renderCameraFieldSchemaLine("camera_lens")},
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
// `sequences.fromOutline` render forms — LLMW.POSTRESPONSE.1 (B7g). Read
// verbatim off `buildSequencesFromOutlinePrompt`
// (`src/lib/prompts/sequences-from-outline.ts`, the oracle, left untouched),
// which branches entirely on `outline`'s presence (Path A / Path B), and,
// within Path A, on a three-way count instruction (`targetCount` provided /
// `sectionCount` known / neither) plus a section-listing user-message
// variant when the outline actually parsed into "## " sections. The system
// bodies below need `targetCount` alongside `PROJECT.OUTLINE_SECTIONS`
// (for `sectionCount`), so they take the `VariableParameterRenderInput`
// object like `shots.fromSequence`'s own path bodies; the template bodies
// need no parameter, so they keep the plain multi-variable positional
// convention instead.
// ---------------------------------------------------------------------------

/** The JSON schema tail, identical on both paths (`sequences-from-outline.ts:18-32`) — a plain static `{text}` block in the descriptor itself, not a render form (no interpolation, unlike `shots.fromSequence`'s count-bearing schema). See the descriptor module for its own leading `"\n"`. */

/** System, Path A (outline present) — `sequences-from-outline.ts:41-85`, up to (not including) the blank line before `JSON_SCHEMA`. Empty when the outline is absent. */
export function renderSequencesFromOutlineSystemPathABody(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const hasOutline = !!project.outline?.trim();
  if (!hasOutline) return "";
  const sections = input.variables["PROJECT.OUTLINE_SECTIONS"] as OutlineSection[];
  const sectionCount = sections.length || null;
  const targetCount = input.parameters.targetCount as number | undefined;

  const countInstruction =
    targetCount != null
      ? `Produce exactly ${targetCount} sequences. When grouping sections: concatenate or lightly condense their bodies for \`summary\`. When splitting: use the relevant portion of the source body.`
      : sectionCount != null
        ? `The outline contains ${sectionCount} sections. Generate exactly ${sectionCount} sequences, one per "## " section. Do not merge or split sections.`
        : "Produce one sequence per ## section in the outline. Do not merge or split sections.";

  return `You are a professional film production designer and story structure expert.
Your task is to convert a Project Outline into a list of production sequences.

RULES:
- Each "## " section maps to exactly one sequence (unless targetCount requires grouping or splitting).
- \`title\` = the section header text, verbatim, without the "## " prefix.
- \`summary\` = the section body text, verbatim. Do not summarize, paraphrase, or shorten it.
- \`description\` = enriched production narrative, inferred from the section content.
- \`narrative_purpose\`, \`mood\`, \`location_hint\` = inferred from the section content.
- Do not invent characters, locations, or events not present in the outline.
- Do not use pitch or story to override outline content.
- ${countInstruction}`;
}

/** System, Path B (outline absent) — `sequences-from-outline.ts:92-104`, up to (not including) the blank line before `JSON_SCHEMA`. Empty when the outline is present. */
export function renderSequencesFromOutlineSystemPathBBody(input: VariableParameterRenderInput): string {
  const project = input.variables["PROJECT.IDENTITY"] as ProjectIdentityData;
  const hasOutline = !!project.outline?.trim();
  if (hasOutline) return "";
  const targetCount = input.parameters.targetCount as number | undefined;
  const countInstruction =
    targetCount != null
      ? `Produce exactly ${targetCount} sequences.`
      : "Choose a natural number of sequences based on the story structure (typically 4 to 8).";

  return `You are a professional film production designer and story structure expert.
The project outline is not yet available. Generate production sequences from the project pitch and story instead.
${countInstruction}`;
}

/** Template, Path A (outline present) — `sequences-from-outline.ts:48-69`. Internally branches on whether the outline actually parsed into "## " sections (`sectionsBlock`); empty when the outline is absent. */
export function renderSequencesFromOutlineTemplatePathA(project: ProjectIdentityData, sections: OutlineSection[]): string {
  const hasOutline = !!project.outline?.trim();
  if (!hasOutline) return "";

  const bgParts: string[] = [];
  if (project.pitch?.trim()) bgParts.push(`Pitch: ${project.pitch}`);
  if (project.story?.trim()) bgParts.push(`Story (background only): ${project.story.slice(0, 400)}`);
  const bgBlock = bgParts.length > 0 ? `\n\nBackground context (do not override the outline):\n${bgParts.join("\n")}` : "";

  const sectionsBlock =
    sections.length > 0
      ? sections
          .map(
            (s, i) =>
              `Section ${String(i + 1).padStart(2, "0")}\n` +
              `Title (copy verbatim into "title"): ${s.title}\n` +
              `Body (copy verbatim into "summary"): ${s.body || "(empty)"}`
          )
          .join("\n\n")
      : null;

  return sectionsBlock
    ? `Project: ${project.name}${bgBlock}\n\nOutline sections (primary source):\n\n${sectionsBlock}\n\nFor each section: set \`title\` = the Title above, set \`summary\` = the Body above verbatim. Infer \`description\`, \`narrative_purpose\`, \`mood\`, and \`location_hint\` from the section body. Do not paraphrase the summary.`
    : `Project: ${project.name}${bgBlock}\n\nProject Outline (primary source — map this into sequences):\n${project.outline}\n\nFor each "## " section: set \`title\` = the header text without "## ", set \`summary\` = the section body verbatim. Do not paraphrase the summary.`;
}

/** Template, Path B (outline absent) — `sequences-from-outline.ts:97-110`. Empty when the outline is present. */
export function renderSequencesFromOutlineTemplatePathB(project: ProjectIdentityData): string {
  const hasOutline = !!project.outline?.trim();
  if (hasOutline) return "";
  const contextLines: string[] = [`Project: ${project.name}`];
  if (project.pitch?.trim()) contextLines.push(`Pitch: ${project.pitch}`);
  if (project.story?.trim()) contextLines.push(`Story: ${project.story}`);
  return `${contextLines.join("\n")}

Break this project into production sequences.`;
}

// ---------------------------------------------------------------------------
// `narrativePrompt.compose` render forms — LLMW.NARRATIVE.1 (B12b-2). The
// "grosse marmite" of §5.3 of `docs/LLM_WORKSPACE_PRODUCT_VISION.md`: no
// oracle to reproduce (this is a new operation, not a flat-JSON migration),
// authored on the same register as `shot.retakeDirected` /
// `shot.insertDirected` / `asset.retakeDirected`. The context lines reuse
// `shotPrompt.assist`'s own `generate`-mode wording almost verbatim
// (`renderShotPromptGenerateContextLines` above) over the same six
// ingredients, in the same declared order (PROJECT.IDENTITY, SEQ.CONTEXT,
// SHOT.CORE, SHOT.CURRENT_PROMPT, SHOT.CAST, SHOT.REFERENCES) — but
// unconditional (no mode to branch on) and phrased as the current draft
// rather than "existing prompt draft" wording tied to the transform modes
// `shotPrompt.assist` alone has.
// ---------------------------------------------------------------------------

/** System: fixed role/rules text — §5.4 of the product vision, "the app owns the format": prose only, one proposal, faithful to the ingredients, no invented facts. */
export const NARRATIVE_PROMPT_SYSTEM_INTRO =
  "You are a narrative prompt writer for a film or animation production, turning a Shot's structured production data into a single, vivid narrative prompt suitable as an AI image or video generation prompt.";

/** System: the rules block — every constraint §5.4 and the ticket's point 5 ask for, in one place. */
export const NARRATIVE_PROMPT_SYSTEM_RULES = `Rules:
- Use only the provided context. Do not invent characters, locations, or actions that are not present in the input.
- Propose exactly one narrative prompt — a single paragraph, never a list of options or variants.
- Write in plain English prose. No JSON, no markdown, no code fences, no headers, no bullet points.
- Do not include a preamble, a label, or any comment about the response itself. Output only the prose paragraph.
- Stay faithful to the shot's action, camera intent, cast and references, while giving the result a more narratively vivid, evocative voice than the raw fields alone.`;

/**
 * Template: the six ingredients, in their declared order — the operation's
 * whole context, with no mode branch (unlike `shotPrompt.assist`'s own
 * `generateContextLines`, this always renders). `currentPrompt.shotPrompt`
 * is surfaced as "Current shot prompt" — background the model may draw on,
 * never the thing being asked for (that is `SHOT.NARRATIVE_PROMPT`, the
 * jar this operation fills, deliberately not read back as an ingredient —
 * see the descriptor's own `context` comment).
 */
export function renderNarrativePromptContextLines(
  project: ProjectIdentityData,
  sequence: SeqContextData,
  shot: ShotCoreData,
  currentPrompt: ShotCurrentPromptData,
  cast: ShotCastEntry[],
  references: ShotReferenceEntry[]
): string {
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
  if (shot.cameraSubject?.trim()) lines.push(`Camera intent: ${shot.cameraSubject}`);
  if (shot.framing?.trim()) lines.push(`Framing: ${shot.framing}`);
  if (shot.cameraMovement?.trim()) lines.push(`Camera movement: ${shot.cameraMovement}`);
  if (currentPrompt.shotPrompt?.trim()) lines.push(`Current shot prompt: ${currentPrompt.shotPrompt}`);
  const castSummary = cast.map((r) => {
    const extras = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join("; ");
    return extras ? `${r.name} (${r.type}: ${extras})` : `${r.name} (${r.type})`;
  });
  if (castSummary.length > 0) lines.push(`Cast: ${castSummary.join(", ")}`);
  const referenceSummary = references
    .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
    .filter((v): v is string => v !== null);
  if (referenceSummary.length > 0) lines.push(`References: ${referenceSummary.join(", ")}`);
  return lines.join("\n");
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
    "assetsFromProject.backgroundLines": renderAssetsFromProjectBackgroundLines,
    "assetsFromProject.outlineOrStoryBlock": renderAssetsFromProjectOutlineOrStoryBlock,
    "castingFromSequence.projectBackgroundLines": renderCastingFromSequenceProjectBackgroundLines,
    "shotInsert.projectLines": renderShotInsertProjectLines,
    "styleAdjust.projectLines": renderStyleAdjustProjectLines,
  },
  "PROJECT.SEQUENCES": {
    "assetsFromProject.sequencesBlock": renderAssetsFromProjectSequencesBlock,
  },
  "PROJECT.ASSETS": {
    "assetsFromProject.existingAssetsBlock": renderAssetsFromProjectExistingAssetsBlock,
  },
  "PROJECT.ASSET_LIBRARY": {
    "castingFromSequence.assetLibraryLines": renderCastingFromSequenceAssetLibraryLines,
  },
  "SEQ.CONTEXT": {
    "sequencePrompt.generateSequenceLines": renderSeqContextSequencePromptGenerateLines,
    "shotRetake.sequenceLines": renderSeqContextRetakeLines,
    "shotInsert.sequenceLines": renderShotInsertSequenceLines,
  },
  "SEQ.SHOT_TARGETS": {
    "castingFromSequence.shotsLines": renderCastingFromSequenceShotsLines,
  },
  "PROJECT.STYLE": {
    "assetContext.worldRulesBlock": renderProjectStyleWorldRulesBlock,
    "assetDescription.finalRuleLine": renderProjectStyleDescriptionOnlyFinalRule,
    "assetNotes.finalRuleLine": renderProjectStyleNotesOnlyFinalRule,
    "assetDescriptionBatch.finalRuleLine": renderProjectStyleBatchFinalRule,
    "assetBible.styleBlock": renderProjectStyleBibleBlock,
    "assetBible.finalRuleLine": renderProjectStyleBibleFinalRule,
  },
  "PROJECT.STYLE.DRAFT": {
    "styleAdjust.draftLines": renderProjectStyleDraftLines,
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
    "assetRetake.bibleLines": renderAssetRetakeBibleLines,
  },
  "ASSET.SEQ_APPEARANCES": {
    "assetContext.seqAppearancesLines": renderAssetSeqAppearancesLines,
  },
  "ASSET.SHOT_APPEARANCES": {
    "assetContext.shotAppearancesLines": renderAssetShotAppearancesLines,
    "assetRetake.shotAppearancesLines": renderAssetRetakeShotAppearancesLines,
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
  "SHOT.LIGHTING": {
    "shotLightingDirected.currentLine": renderShotLightingDirectedCurrentLine,
  },
  "SEQ.LIGHTING": {
    "sequenceLightingDirected.currentLine": renderSequenceLightingDirectedCurrentLine,
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
  "sequencesFromOutline.templatePathA": renderSequencesFromOutlineTemplatePathA,
  "sequencesFromOutline.templatePathB": renderSequencesFromOutlineTemplatePathB,
  "castingFromSequence.sequenceContextLines": renderCastingFromSequenceSequenceContextLines,
  "castingFromSequence.existingCastingsBlock": renderCastingFromSequenceExistingCastingsBlock,
  "narrativePrompt.contextLines": renderNarrativePromptContextLines,
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
  "assetsFromProject.finalInstructionLine": renderAssetsFromProjectFinalInstructionLine,
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
  // Widened `number | string` -> `number | string | boolean | string[]`
  // (LLMW.DESCRIPTOR.ASSETS.1, B7f) — see `types.ts`'s own widening note.
  parameters: Record<string, number | string | boolean | string[] | undefined>;
  mode: string | undefined;
};

export const VARIABLE_PARAMETER_RENDER_FORMS = {
  "shotsFromSequence.systemPathABody": renderShotsFromSequenceSystemPathABody,
  "shotsFromSequence.systemPathBBody": renderShotsFromSequenceSystemPathBBody,
  "shotsFromSequence.templatePathA": renderShotsFromSequenceTemplatePathA,
  "shotsFromSequence.templatePathB": renderShotsFromSequenceTemplatePathB,
  "sequencesFromOutline.systemPathABody": renderSequencesFromOutlineSystemPathABody,
  "sequencesFromOutline.systemPathBBody": renderSequencesFromOutlineSystemPathBBody,
  "assetsFromProject.systemBody": renderAssetsFromProjectSystemBody,
  "assetsFromProject.shotsBlock": renderAssetsFromProjectShotsBlock,
  "castingFromSequence.systemBody": renderCastingFromSequenceSystemBody,
  "castingFromSequence.closingInstructionLine": renderCastingFromSequenceClosingInstructionLine,
  "shotInsert.positionLine": renderShotInsertPositionLine,
  "shotInsert.shotListLines": renderShotInsertShotListLines,
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
  "assetRetake.freeTextDirective": renderAssetRetakeFreeTextDirective,
  "assetRetake.directorRuleLine": renderAssetRetakeDirectorRuleLine,
  "shotInsert.freeTextDirective": renderShotInsertFreeTextDirective,
  "shotInsert.directiveRuleLine": renderShotInsertDirectiveRuleLine,
  "shotLightingDirected.freeTextDirective": renderShotLightingDirectedFreeTextDirective,
  "sequenceLightingDirected.freeTextDirective": renderSequenceLightingDirectedFreeTextDirective,
  "styleAdjust.directorNoteLine": renderStyleAdjustDirectorNoteLine,
  "styleAdjust.directorRuleLine": renderStyleAdjustDirectorRuleLine,
} as const;

export const VARIABLE_REGISTRY = {
  "PROJECT.IDENTITY": resolveProjectIdentity,
  "PROJECT.STYLE": resolveProjectStyle,
  "PROJECT.STYLE.DRAFT": resolveProjectStyleDraft,
  "SEQ.CONTEXT": resolveSeqContext,
  "SEQ.CURRENT_PROMPT": resolveSeqCurrentPrompt,
  "SHOT.CORE": resolveShotCore,
  "SHOT.CURRENT_PROMPT": resolveShotCurrentPrompt,
  "SHOT.NARRATIVE_PROMPT": resolveShotNarrativePrompt,
  "SHOT.CAST": resolveShotCast,
  "SHOT.REFERENCES": resolveShotReferences,
  "ASSET.CORE": resolveAssetCore,
  "ASSET.BIBLE": resolveAssetBible,
  "ASSET.SEQ_APPEARANCES": resolveAssetSeqAppearances,
  "ASSET.SHOT_APPEARANCES": resolveAssetShotAppearances,
  "ASSET.REFERENCES": resolveAssetReferences,
  "SEQ.SHOTS": resolveSeqShots,
  "PROJECT.OUTLINE_SECTIONS": resolveProjectOutlineSections,
  "PROJECT.SEQUENCES": resolveProjectSequences,
  "PROJECT.SHOTS": resolveProjectShots,
  "PROJECT.ASSETS": resolveProjectAssets,
  "SEQ.SHOT_TARGETS": resolveSeqShotTargets,
  "PROJECT.ASSET_LIBRARY": resolveProjectAssetLibrary,
  "SEQ.EXISTING_CASTINGS": resolveSeqExistingCastings,
  "SEQ.IDENTITY": resolveSeqIdentity,
  "SHOT.LIGHTING": resolveShotLighting,
  "ASSET.LIGHTING": resolveAssetLighting,
  "SEQ.LIGHTING": resolveSeqLighting,
} as const satisfies Record<VariableId, (anchorId: number) => Promise<unknown>>;

// ---------------------------------------------------------------------------
// `postResponse` forms — LLMW.POSTRESPONSE.1 (B7g). A named transformation
// applied to a `kind: "list"` operation's already-parsed items, on the same
// one-object calling convention as `VARIABLE_PARAMETER_RENDER_FORMS` above
// (§1 of the ticket, following `VARIABLE_PARAMETER_RENDER_FORMS`'s own
// header): a wrong signature here fails `tsc`, not a silent runtime
// mismatch. `items`/`variables`/`parameters` are exactly what the runner has
// already produced by this stage — parsed by `output`, resolved by
// `resolveVariables`, normalized by `normalizeIntentParameters` — never
// re-read from the database and never re-normalized here.
// ---------------------------------------------------------------------------

export type PostResponseFormInput = {
  // Widened `Record<string, string | number>` -> `Record<string, string |
  // number | boolean>` (LLMW.DESCRIPTOR.CASTING.1, B7h-b2, §1) — see
  // `runner.ts`'s own widening note on `RunOperationResult`. The items a form
  // *receives* are never actually boolean-valued yet (`ListItemField` gains
  // no `"boolean"` variant), but the type is kept in lockstep with what a
  // form may *return*, on the same one-object-contract discipline this type
  // already follows for `parameters`.
  items: Array<Record<string, string | number | boolean>>;
  variables: Record<string, unknown>;
  // Widened `number | string` -> `number | string | boolean | string[]`
  // (LLMW.DESCRIPTOR.ASSETS.1, B7f) — see `types.ts`'s own widening note.
  parameters: Record<string, number | string | boolean | string[] | undefined>;
  // LLMW.DESCRIPTOR.CASTING.1 (B7h-b2), §2 of the ticket: the operation's own
  // already-validated anchor identifiers. Necessary and not bypassable —
  // `castingFromSequence.filterAndEnrich`'s sequence-level filter compares a
  // "sequence" item's `targetId` to the *current* sequence, an id no
  // resolved variable carries into a `postResponse` form (only `SEQ.IDENTITY`
  // carries it into a *render* block, per §3bis — a distinct, earlier stage
  // of the pipeline). No form before this one needed it, so every existing
  // form simply ignores the new field.
  anchorIds: AnchorIds;
};

/**
 * `sequences.fromOutline`'s post-response form. Reproduces
 * `generateSequencesFromOutlineDraft`'s deterministic override verbatim
 * (`src/actions/llm/sequenceGeneration.ts:148-158`, before the extraction
 * this ticket makes): when `targetCount` is absent/null *and* the outline
 * parsed into at least one section *and* the parsed item count equals the
 * section count, pin every item's `title` to the matching section's title,
 * and its `summary` to the matching section's body — but only when that
 * body is non-empty; an empty body deliberately leaves the model's own
 * `summary` in place. All three conditions are conjoined; none is optional,
 * and none is "improved" here. Does not filter — unlike the casting
 * consumer this brick is proven against (B7h, out of this ticket's scope).
 */
export function renderSequencesFromOutlinePinTitlesToSections(
  input: PostResponseFormInput
): Array<Record<string, string | number | boolean>> {
  const outlineSections = input.variables["PROJECT.OUTLINE_SECTIONS"] as OutlineSection[];
  const targetCount = input.parameters.targetCount;
  if (targetCount != null || outlineSections.length === 0 || input.items.length !== outlineSections.length) {
    return input.items;
  }
  return input.items.map((item, i) => {
    const section = outlineSections[i];
    const updated: Record<string, string | number | boolean> = { ...item, title: section.title };
    if (section.body) {
      updated.summary = section.body;
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// `assetsFromProject.filterByType` — the `postResponse` form for
// LLMW.ASSETS.TYPEFILTER.1 (S2). Unlike every other `postResponse` form in
// this table, this one does not reproduce its oracle: `generateAssetCandidatesDraft`
// / `parseAssetsResult` never filtered on `assetType` at all (`9fdda6a`'s
// bench run is the observable proof). This is the deliberate divergence the
// user decided on 2026-08-17 (`docs/ARCHITECTURE_DECISIONS.md`, "Four
// Arbitrations Taken 2026-08-17", point 2), made expressible only now that
// the pipeline has a post-response stage (LLMW.POSTRESPONSE.1, B7c-n3) — see
// `assetsFromProjectDescriptor.postResponse`'s own header note for the full
// account.
//
// `assetTypes` is the normalized `"multiEnum"` parameter — always an array
// once normalized (the descriptor declares a `default`), never `undefined`.
// A candidate's `assetType` is one of the six `ASSET_TYPE_VALUES`
// (`assetsFromProject.ts`), including `"other"` — the `item.validity`
// fallback `readEnumField` (`runner.ts`) always substitutes when the model's
// own value is not one of the six, so an item that reaches this form already
// carries a valid member, never the model's raw string. `"other"` receives no
// special treatment here: like every other member, it survives only when the
// caller's `assetTypes` requested it.
// ---------------------------------------------------------------------------

export function renderAssetsFromProjectFilterByType(input: PostResponseFormInput): Array<Record<string, string | number | boolean>> {
  const assetTypes = input.parameters.assetTypes as string[];
  return input.items.filter((item) => assetTypes.includes(item.assetType as string));
}

export const POST_RESPONSE_FORMS = {
  "sequencesFromOutline.pinTitlesToSections": renderSequencesFromOutlinePinTitlesToSections,
  "castingFromSequence.filterAndEnrich": renderCastingFromSequenceFilterAndEnrich,
  "assetsFromProject.filterByType": renderAssetsFromProjectFilterByType,
} as const satisfies Record<string, (input: PostResponseFormInput) => Array<Record<string, string | number | boolean>>>;
