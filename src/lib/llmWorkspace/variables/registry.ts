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

import { db } from "@/db";
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
import { resolveAssetStyleContext } from "@/lib/projectStyle/assetAlignment/resolveAssetStyleContext";
import type { VariableId } from "../types";

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
};

export async function resolveSeqContext(sequenceId: number): Promise<SeqContextData> {
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
  };
}

// ---------------------------------------------------------------------------
// SEQ.CURRENT_PROMPT — anchors: sequence
// ---------------------------------------------------------------------------

export type SeqCurrentPromptData = {
  sequencePrompt: string | null;
};

export async function resolveSeqCurrentPrompt(sequenceId: number): Promise<SeqCurrentPromptData> {
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
// ASSET.CORE — anchors: asset
// ---------------------------------------------------------------------------

export type AssetCoreData = {
  name: string;
  type: string;
  description: string | null;
  notes: string | null;
};

export async function resolveAssetCore(assetId: number): Promise<AssetCoreData> {
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
// The registry — one entry per `VariableId`. Resolver signatures differ
// across variables (project-anchored vs. sequence-anchored vs. shot/asset
// -anchored), matching the precedent's shape rather than forcing a uniform
// dispatch signature that no consumer needs yet — the runner that will
// dispatch by `VariableId` against a resolved anchor chain is B2's
// (`LLMW.RUNNER.1`).
// ---------------------------------------------------------------------------

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
} as const satisfies Record<VariableId, (anchorId: number) => Promise<unknown>>;
