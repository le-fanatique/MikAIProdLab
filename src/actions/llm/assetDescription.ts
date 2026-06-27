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
import { buildAssetDescriptionFromContextPrompt } from "@/lib/prompts/asset-description-from-context";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedAssetDescriptionDraft, LLMConfig } from "@/types/llm";

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

async function generateForAsset(
  project: ProjectContext,
  assetId: number,
  config: LLMConfig
): Promise<GeneratedAssetDescriptionDraft> {
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

  const llmPrompt = buildAssetDescriptionFromContextPrompt({
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
  });

  const raw = await callLLMJson(llmPrompt, config);
  return parseDraft(raw);
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

    const draft = await generateForAsset(
      { id: project.id, name: project.name, pitch: project.pitch ?? null, story: project.story ?? null, outline: project.outline ?? null },
      assetId,
      config
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

        const draft = await generateForAsset(projectCtx, assetId, config);

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
