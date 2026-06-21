"use server";

import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { callOllama } from "@/lib/llm/ollama";
import {
  buildShotsFromSequencePrompt,
  type GeneratedSequenceShot,
} from "@/lib/prompts/shots-from-sequence";
import { getLLMConfig } from "@/lib/settings";
import { resolveShotPromptWithDefault } from "@/lib/prompts/defaultShotPrompt";

function str(value: unknown, maxLen = 1000): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, maxLen);
}

function normalizeShot(raw: unknown): GeneratedSequenceShot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return null;

  const dur =
    typeof r.duration_seconds === "number" &&
    r.duration_seconds > 0 &&
    r.duration_seconds <= 120
      ? r.duration_seconds
      : null;

  return {
    title,
    shot_code: str(r.shot_code, 50),
    description: str(r.description, 500),
    duration_seconds: dur,
    continuity_in: str(r.continuity_in, 500),
    action_pitch: str(r.action_pitch, 300),
    camera_pitch: str(r.camera_pitch, 200),
    framing: str(r.framing, 50),
    camera_movement: str(r.camera_movement, 50),
    continuity_out: str(r.continuity_out, 500),
    shot_prompt: str(r.shot_prompt, 1000),
  };
}

function parseShotsResult(raw: string): GeneratedSequenceShot[] {
  let parsed: unknown;
  try {
    const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    parsed = JSON.parse(fenced ? fenced[1].trim() : raw.trim());
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }
  const arr = (parsed as Record<string, unknown>)?.shots;
  if (!Array.isArray(arr)) {
    throw new Error("The model did not return a shots array. Try again.");
  }
  const normalized = arr.map(normalizeShot).filter((s): s is GeneratedSequenceShot => s !== null);
  if (normalized.length === 0) {
    throw new Error("The model returned no valid shots. Try again.");
  }
  return normalized;
}

export async function generateShotsFromSequenceDraft(
  formData: FormData
): Promise<{ ok: true; shots: GeneratedSequenceShot[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const shotCountRaw = parseInt(formData.get("shotCount") as string, 10);

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(sequenceId) || sequenceId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const shotCount = Number.isInteger(shotCountRaw) && shotCountRaw >= 1 && shotCountRaw <= 30
      ? shotCountRaw
      : 6;

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

    const llmPrompt = buildShotsFromSequencePrompt({
      project: {
        name: project.name,
        pitch: project.pitch,
        story: project.story,
      },
      sequence: {
        title: sequence.title,
        summary: sequence.summary,
        description: sequence.description,
        narrativePurpose: sequence.narrativePurpose,
        mood: sequence.mood,
        locationHint: sequence.locationHint,
        sequencePrompt: sequence.sequencePrompt,
      },
      targetCount: shotCount,
    });

    const raw = await callOllama(llmPrompt, config);
    const generatedShots = parseShotsResult(raw);

    return { ok: true, shots: generatedShots };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function createGeneratedShots(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/sequences/${sequenceId}`;
  const shotsJson = (formData.get("shotsJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}shotsCreateError=${encodeURIComponent(msg)}`);
  }

  if (
    !Number.isInteger(projectId) || projectId <= 0 ||
    !Number.isInteger(sequenceId) || sequenceId <= 0
  ) {
    errRedirect("Invalid request.");
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId));
  if (!sequence || sequence.projectId !== projectId) {
    errRedirect("Sequence not found.");
  }

  let parsedShots: GeneratedSequenceShot[];
  try {
    const raw = JSON.parse(shotsJson);
    if (!Array.isArray(raw)) throw new Error();
    parsedShots = raw.map(normalizeShot).filter((s): s is GeneratedSequenceShot => s !== null);
  } catch {
    errRedirect("Invalid shot data.");
  }

  if (parsedShots!.length === 0) {
    errRedirect("No valid shots to create.");
  }

  const [maxResult] = await db
    .select({ max: max(shots.orderIndex) })
    .from(shots)
    .where(eq(shots.sequenceId, sequenceId));

  const startIndex = (maxResult?.max ?? -1) + 1;

  for (let i = 0; i < parsedShots!.length; i++) {
    const shot = parsedShots![i];
    const shotPrompt = resolveShotPromptWithDefault({
      shotPrompt: shot.shot_prompt,
      description: shot.description,
      actionPitch: shot.action_pitch,
      cameraPitch: shot.camera_pitch,
    });
    await db.insert(shots).values({
      sequenceId,
      shotCode: shot.shot_code ?? null,
      title: shot.title,
      description: shot.description ?? null,
      durationSeconds: shot.duration_seconds ?? null,
      actionPitch: shot.action_pitch ?? null,
      cameraPitch: shot.camera_pitch ?? null,
      framing: shot.framing ?? null,
      cameraMovement: shot.camera_movement ?? null,
      continuityIn: shot.continuity_in ?? null,
      continuityOut: shot.continuity_out ?? null,
      shotPrompt,
      orderIndex: startIndex + i,
    });
  }

  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}shotsCreated=${parsedShots!.length}`);
}
