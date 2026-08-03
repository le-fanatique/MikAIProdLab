"use server";

import { db } from "@/db";
import {
  projects,
  assets,
  sequenceAssets,
  sequences,
  shotAssets,
  shots,
  assetReferenceImages,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { callLLMJson } from "@/lib/llm";
import {
  buildAssetDescriptionFromContextPrompt,
  buildAssetDescriptionOnlyPrompt,
  buildAssetNotesOnlyPrompt,
  type AssetDescriptionFromContextInput,
} from "@/lib/prompts/asset-description-from-context";
import { getLLMConfig } from "@/lib/settings";
import { resolveAssetStyleContext } from "@/lib/projectStyle/assetAlignment/resolveAssetStyleContext";
import type { GeneratedAssetDescriptionDraft, LLMConfig } from "@/types/llm";

/** World & Design Language + Asset-applicable approved rules only — resolved once per action invocation (including once per batch, never once per item) so a Style activation mid-batch cannot mix versions within one call. */
type DescriptionStyleSegments = { worldSegment: string; rulesSegment: string };

async function resolveDescriptionStyleSegments(projectId: number): Promise<DescriptionStyleSegments> {
  const resolved = await resolveAssetStyleContext(projectId);
  if (!resolved.ok) throw new Error(resolved.error);
  if (resolved.context.mode === "none") return { worldSegment: "", rulesSegment: "" };
  return { worldSegment: resolved.context.segments.worldSegment, rulesSegment: resolved.context.segments.rulesSegment };
}

const BATCH_LIMIT = 10;

function extractCodeFence(raw: string): string {
  const fence = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : raw.trim();
}

function parseDraft(raw: string): GeneratedAssetDescriptionDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const obj = parsed as Record<string, unknown>;
  const descriptionDraft =
    typeof obj.description_draft === "string" ? obj.description_draft.trim() : "";
  const notesDraft =
    typeof obj.notes_draft === "string" ? obj.notes_draft.trim() : "";
  if (!descriptionDraft && !notesDraft) {
    throw new Error("The model returned an empty draft. Try again.");
  }
  return { descriptionDraft, notesDraft };
}

type ProjectContext = {
  id: number;
  name: string;
  pitch: string | null;
  story: string | null;
  outline: string | null;
};

/**
 * Shared context assembly for one Asset — reused, byte-for-byte, by the
 * combined batch flow and both independent single-field actions
 * (UX.PRODUCTIVITY.POLISH.1 — Lot C), so there is only ever one query path
 * per Asset regardless of which prompt ends up consuming it.
 */
async function fetchAssetContextInput(
  project: ProjectContext,
  assetId: number,
  style: DescriptionStyleSegments
): Promise<AssetDescriptionFromContextInput> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.projectId !== project.id) {
    throw new Error("Asset not found.");
  }

  const seqRows = await db
    .select({
      title: sequences.title,
      summary: sequences.summary,
      mood: sequences.mood,
      locationHint: sequences.locationHint,
      narrativePurpose: sequences.narrativePurpose,
    })
    .from(sequenceAssets)
    .innerJoin(sequences, eq(sequenceAssets.sequenceId, sequences.id))
    .where(and(eq(sequenceAssets.assetId, assetId), eq(sequences.projectId, project.id)))
    .orderBy(asc(sequences.orderIndex))
    .limit(5);

  const shotRows = await db
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
    .limit(10);

  const refRows = await db
    .select({
      label: assetReferenceImages.label,
      imageRole: assetReferenceImages.imageRole,
      sourceFilename: assetReferenceImages.sourceFilename,
    })
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, assetId))
    .orderBy(asc(assetReferenceImages.orderIndex))
    .limit(5);

  return {
    project: {
      name: project.name,
      pitch: project.pitch,
      story: project.story,
      outline: project.outline,
    },
    asset: {
      name: asset.name,
      type: asset.type,
      description: asset.description ?? null,
      notes: asset.notes ?? null,
    },
    sequenceContexts: seqRows,
    shotContexts: shotRows,
    refImageMeta: refRows,
    style,
  };
}

async function generateForAsset(
  project: ProjectContext,
  assetId: number,
  config: LLMConfig,
  style: DescriptionStyleSegments
): Promise<GeneratedAssetDescriptionDraft> {
  const contextInput = await fetchAssetContextInput(project, assetId, style);
  const llmPrompt = buildAssetDescriptionFromContextPrompt(contextInput);
  const raw = await callLLMJson(llmPrompt, config);
  return parseDraft(raw);
}

/**
 * Strict single-field parser (UX.PRODUCTIVITY.POLISH.1 — Lot C): reads
 * *only* the expected key from the model's JSON response. A stray
 * `description_draft`/`notes_draft` for the OTHER field, if the model
 * ignores the prompt's schema constraint, is never read here — it can
 * never leak into (or mutate) the other field's draft.
 */
const SINGLE_FIELD_DRAFT_MAX_LENGTH = 4000;

/**
 * Strict single-field parser: the model's response must be exactly a plain
 * JSON object with exactly one key — the expected key for `field` — whose
 * value is a non-empty, bounded string. Rejects `null`, arrays, primitives,
 * an object with an unknown key, a missing key, both keys present at once,
 * a non-string value, and an oversized value. Never indexes into a
 * non-object (avoids a TypeError on `null`/arrays) — anything that doesn't
 * match exactly is a single, sanitized "unexpected format" error.
 */
function parseSingleFieldDraft(raw: string, field: "description" | "notes"): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const key = field === "description" ? "description_draft" : "notes_draft";
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== key) {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const value = (parsed as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SINGLE_FIELD_DRAFT_MAX_LENGTH) {
    throw new Error("The model returned an empty or invalid draft. Try again.");
  }
  return trimmed;
}

async function generateFieldForAsset(
  project: ProjectContext,
  assetId: number,
  config: LLMConfig,
  style: DescriptionStyleSegments,
  field: "description" | "notes"
): Promise<string> {
  const contextInput = await fetchAssetContextInput(project, assetId, style);
  const llmPrompt =
    field === "description" ? buildAssetDescriptionOnlyPrompt(contextInput) : buildAssetNotesOnlyPrompt(contextInput);
  const raw = await callLLMJson(llmPrompt, config);
  return parseSingleFieldDraft(raw, field);
}

async function generateSingleField(
  formData: FormData,
  field: "description" | "notes"
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(assetId) || assetId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const style = await resolveDescriptionStyleSegments(projectId);

    const draft = await generateFieldForAsset(
      { id: project.id, name: project.name, pitch: project.pitch ?? null, story: project.story ?? null, outline: project.outline ?? null },
      assetId,
      config,
      style,
      field
    );

    return { ok: true, draft };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

// ── Independent single-field actions (UX.PRODUCTIVITY.POLISH.1 — Lot C) ────

export async function generateAssetDescriptionOnlyDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  return generateSingleField(formData, "description");
}

export async function generateAssetNotesOnlyDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  return generateSingleField(formData, "notes");
}

// ── Single-asset action ──────────────────────────────────────────────────────

export async function generateAssetDescriptionDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedAssetDescriptionDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(assetId) || assetId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const style = await resolveDescriptionStyleSegments(projectId);

    const draft = await generateForAsset(
      { id: project.id, name: project.name, pitch: project.pitch ?? null, story: project.story ?? null, outline: project.outline ?? null },
      assetId,
      config,
      style
    );

    return { ok: true, draft };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

// ── Batch action ─────────────────────────────────────────────────────────────

export type BatchAssetDraftResult = {
  assetId: number;
  assetName: string;
  assetType: string;
  hasExistingDescription: boolean;
  hasExistingNotes: boolean;
  draft: GeneratedAssetDescriptionDraft;
};

export type BatchAssetDraftError = {
  assetId: number;
  assetName?: string;
  error: string;
};

export async function generateBatchAssetDescriptionDrafts(
  formData: FormData
): Promise<
  | {
      ok: true;
      results: BatchAssetDraftResult[];
      errors: BatchAssetDraftError[];
    }
  | { ok: false; error: string }
> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const rawIds = formData.get("assetIds");
    let assetIds: number[] = [];
    if (typeof rawIds === "string" && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) {
          assetIds = parsed
            .map((v) => parseInt(String(v), 10))
            .filter((n) => Number.isInteger(n) && n > 0);
        }
      } catch {
        return { ok: false, error: "Invalid asset selection." };
      }
    }

    if (assetIds.length === 0) {
      return { ok: false, error: "No assets selected." };
    }
    if (assetIds.length > BATCH_LIMIT) {
      return { ok: false, error: `Select up to ${BATCH_LIMIT} assets at a time.` };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const projectCtx: ProjectContext = {
      id: project.id,
      name: project.name,
      pitch: project.pitch ?? null,
      story: project.story ?? null,
      outline: project.outline ?? null,
    };

    // Resolved once for the whole batch — a Style activation mid-run must
    // never mix versions between Assets in the same batch call.
    const style = await resolveDescriptionStyleSegments(projectId);

    const results: BatchAssetDraftResult[] = [];
    const errors: BatchAssetDraftError[] = [];

    // Sequential to avoid overloading Ollama
    for (const assetId of assetIds) {
      try {
        const [assetRow] = await db
          .select({ name: assets.name, type: assets.type, description: assets.description, notes: assets.notes, projectId: assets.projectId })
          .from(assets)
          .where(eq(assets.id, assetId));

        if (!assetRow || assetRow.projectId !== projectId) {
          errors.push({ assetId, error: "Asset not found." });
          continue;
        }

        const draft = await generateForAsset(projectCtx, assetId, config, style);

        results.push({
          assetId,
          assetName: assetRow.name,
          assetType: assetRow.type,
          hasExistingDescription: Boolean(assetRow.description?.trim()),
          hasExistingNotes: Boolean(assetRow.notes?.trim()),
          draft,
        });
      } catch (err) {
        const [assetRow] = await db
          .select({ name: assets.name })
          .from(assets)
          .where(eq(assets.id, assetId))
          .catch(() => [undefined]);
        errors.push({
          assetId,
          assetName: assetRow?.name,
          error: err instanceof Error ? err.message : "Unexpected error.",
        });
      }
    }

    return { ok: true, results, errors };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
