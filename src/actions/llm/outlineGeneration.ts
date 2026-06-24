"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { callOllama } from "@/lib/llm/ollama";
import { buildOutlineFromStoryPrompt } from "@/lib/prompts/outline-from-story";
import { getLLMConfig } from "@/lib/settings";
import type { GenerateOutlineResult } from "@/types/llm";

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : trimmed;
}

function parseOutlineResult(raw: string): GenerateOutlineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error(
      "The model returned an unexpected format. Try again or use a different model."
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).outline !== "string" ||
    !(parsed as { outline: string }).outline.trim()
  ) {
    throw new Error("The model returned an empty or invalid outline. Try again.");
  }
  return { outline: (parsed as { outline: string }).outline.trim() };
}

export async function generateOutlineDraft(
  formData: FormData
): Promise<{ ok: true; outline: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, error: "Invalid request." };
    }

    const rawSections = parseInt(formData.get("targetSections") as string, 10);
    const targetSections =
      Number.isInteger(rawSections) && rawSections >= 2 && rawSections <= 20
        ? rawSections
        : null;

    const config = await getLLMConfig();
    if (!config) {
      return {
        ok: false,
        error: "LLM provider not configured. Go to Settings to configure Ollama.",
      };
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return { ok: false, error: "Project not found." };
    }

    if (!project.pitch?.trim()) {
      return { ok: false, error: "Add a pitch first." };
    }

    const prompt = buildOutlineFromStoryPrompt({
      name: project.name,
      pitch: project.pitch,
      story: project.story,
      targetSections,
    });

    const raw = await callOllama(prompt, config);
    const result = parseOutlineResult(raw);

    return { ok: true, outline: result.outline };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred. Please try again.";
    return { ok: false, error: message };
  }
}

export async function applyGeneratedOutline(
  projectId: number,
  outline: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!outline?.trim()) {
      return { ok: false, error: "Outline cannot be empty." };
    }
    await db
      .update(projects)
      .set({ outline: outline.trim(), updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save the outline. Please try again." };
  }
}
