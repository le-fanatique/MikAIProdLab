"use server";

import { db } from "@/db";
import { projects, sequences, shots, assets, shotAssets, shotReferenceImages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { callOllama } from "@/lib/llm/ollama";
import {
  buildShotPromptFromContextPrompt,
  type ShotPromptAssistMode,
} from "@/lib/prompts/shot-prompt-from-context";
import { getLLMConfig } from "@/lib/settings";

const VALID_MODES: readonly ShotPromptAssistMode[] = [
  "generate",
  "enhance",
  "rewrite",
  "shorten",
  "expand",
];

function isValidMode(value: string): value is ShotPromptAssistMode {
  return (VALID_MODES as readonly string[]).includes(value);
}

function extractCodeFence(raw: string): string {
  const fence = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : raw.trim();
}

function parseDraft(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractCodeFence(raw));
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const prompt = (parsed as Record<string, unknown>)?.shot_prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("The model returned an empty prompt. Try again.");
  }
  return prompt.trim();
}

export async function generateShotPromptDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const shotId = parseInt(formData.get("shotId") as string, 10);

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(sequenceId) || sequenceId <= 0 ||
      !Number.isInteger(shotId) || shotId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const rawMode = (formData.get("mode") as string | null) ?? "generate";
    if (!isValidMode(rawMode)) {
      return { ok: false, error: "Invalid assist mode." };
    }
    const mode: ShotPromptAssistMode = rawMode;

    const config = await getLLMConfig();
    if (!config) {
      return { ok: false, error: "LLM not configured. Go to Settings to set up Ollama." };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { ok: false, error: "Project not found." };

    const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
    if (!sequence || sequence.projectId !== projectId) {
      return { ok: false, error: "Sequence not found." };
    }

    const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
    if (!shot || shot.sequenceId !== sequenceId) {
      return { ok: false, error: "Shot not found." };
    }

    if (mode !== "generate" && !shot.shotPrompt?.trim()) {
      return { ok: false, error: "A Shot Prompt is required for this assist mode." };
    }

    const castRows = await db
      .select({ name: assets.name, type: assets.type })
      .from(shotAssets)
      .innerJoin(assets, eq(shotAssets.assetId, assets.id))
      .where(eq(shotAssets.shotId, shotId))
      .orderBy(asc(assets.name));
    const castSummary = castRows.map((r) => `${r.name} (${r.type})`);

    const refRows = await db
      .select({
        label: shotReferenceImages.label,
        imageRole: shotReferenceImages.imageRole,
        sourceFilename: shotReferenceImages.sourceFilename,
      })
      .from(shotReferenceImages)
      .where(eq(shotReferenceImages.shotId, shotId))
      .orderBy(asc(shotReferenceImages.orderIndex));
    const referenceSummary = refRows
      .map((r) => r.label ?? r.sourceFilename ?? r.imageRole ?? null)
      .filter((s): s is string => s !== null);

    const llmPrompt = buildShotPromptFromContextPrompt({
      projectName: project.name,
      projectPitch: project.pitch,
      projectStory: project.story,
      sequenceTitle: sequence.title,
      sequenceSummary: sequence.summary,
      sequenceDescription: sequence.description,
      sequenceMood: sequence.mood,
      sequenceLocationHint: sequence.locationHint,
      shotTitle: shot.title,
      shotCode: shot.shotCode,
      shotDescription: shot.description,
      actionPitch: shot.actionPitch,
      cameraPitch: shot.cameraPitch,
      framing: shot.framing,
      cameraMovement: shot.cameraMovement,
      durationSeconds: shot.durationSeconds,
      currentShotPrompt: shot.shotPrompt,
      castSummary,
      referenceSummary,
      assistMode: mode,
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
