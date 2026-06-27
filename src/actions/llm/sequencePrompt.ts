"use server";

import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { callLLMJson } from "@/lib/llm";
import {
  buildSequencePromptFromContextPrompt,
  type SequencePromptAssistMode,
} from "@/lib/prompts/sequence-prompt-from-context";
import { getLLMConfig } from "@/lib/settings";

const VALID_MODES: readonly SequencePromptAssistMode[] = [
  "generate",
  "enhance",
  "rewrite",
  "shorten",
  "expand",
];

function isValidMode(value: string): value is SequencePromptAssistMode {
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
  const prompt = (parsed as Record<string, unknown>)?.sequence_prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("The model returned an empty prompt. Try again.");
  }
  return prompt.trim();
}

export async function generateSequencePromptDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);

    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(sequenceId) || sequenceId <= 0
    ) {
      return { ok: false, error: "Invalid request." };
    }

    const rawMode = (formData.get("mode") as string | null) ?? "generate";
    if (!isValidMode(rawMode)) {
      return { ok: false, error: "Invalid assist mode." };
    }
    const mode: SequencePromptAssistMode = rawMode;

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

    if (mode !== "generate" && !sequence.sequencePrompt?.trim()) {
      return { ok: false, error: "A Sequence Prompt is required for this assist mode." };
    }

    const llmPrompt = buildSequencePromptFromContextPrompt({
      assistMode: mode,
      projectName: project.name,
      projectPitch: project.pitch,
      projectStory: project.story,
      sequenceTitle: sequence.title,
      sequenceSummary: sequence.summary,
      sequenceDescription: sequence.description,
      sequenceMood: sequence.mood,
      sequenceLocationHint: sequence.locationHint,
      currentSequencePrompt: sequence.sequencePrompt,
    });

    const raw = await callLLMJson(llmPrompt, config);
    const draft = parseDraft(raw);

    return { ok: true, draft };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
