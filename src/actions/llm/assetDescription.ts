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
import { callOllama } from "@/lib/llm/ollama";
import { buildAssetDescriptionFromContextPrompt } from "@/lib/prompts/asset-description-from-context";
import { getLLMConfig } from "@/lib/settings";
import type { GeneratedAssetDescriptionDraft } from "@/types/llm";

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

export async function generateAssetDescriptionDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedAssetDescriptionDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    if (!Number.isInteger(projectId) || projectId <= 0 ||
        !Number.isInteger(assetId) || assetId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM is not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
    if (!asset || asset.projectId !== projectId) {
      return { ok: false, error: "Asset not found." };
    }

    // Sequence contexts — fetch via sequenceAssets join
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
      .where(and(eq(sequenceAssets.assetId, assetId), eq(sequences.projectId, projectId)))
      .orderBy(asc(sequences.orderIndex))
      .limit(5);

    // Shot contexts — fetch via shotAssets join
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

    // Reference image metadata
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
        pitch: project.pitch ?? null,
        story: project.story ?? null,
        outline: project.outline ?? null,
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

    const raw = await callOllama(llmPrompt, config);
    const draft = parseDraft(raw);

    return { ok: true, draft };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
