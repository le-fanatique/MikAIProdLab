"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { callOllama } from "@/lib/llm/ollama";
import { buildStoryFromPitchPrompt } from "@/lib/prompts/story-from-pitch";
import { getLLMConfig } from "@/lib/settings";
import type { GenerateStoryResult } from "@/types/llm";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strips markdown code fences that some models add despite instructions.
 * e.g. ```json { ... } ``` → { ... }
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : trimmed;
}

function parseStoryResult(raw: string): GenerateStoryResult {
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
    typeof (parsed as Record<string, unknown>).story !== "string" ||
    !(parsed as { story: string }).story.trim()
  ) {
    throw new Error(
      "The model returned an empty or invalid story. Try again."
    );
  }
  return { story: (parsed as { story: string }).story.trim() };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

export async function generateStory(
  projectId: number
): Promise<{ ok: true; story: string } | { ok: false; error: string }> {
  try {
    const config = await getLLMConfig();
    if (!config) {
      return {
        ok: false,
        error: "LLM provider not configured. Go to Settings to configure Ollama.",
      };
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return { ok: false, error: "Project not found." };
    }

    if (!project.pitch?.trim()) {
      return { ok: false, error: "Add a pitch first." };
    }

    const prompt = buildStoryFromPitchPrompt({
      name: project.name,
      pitch: project.pitch,
      description: project.description,
    });

    const raw = await callOllama(prompt, config);
    const result = parseStoryResult(raw);

    return { ok: true, story: result.story };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred. Please try again.";
    return { ok: false, error: message };
  }
}

export async function applyGeneratedStory(
  projectId: number,
  story: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!story?.trim()) {
      return { ok: false, error: "Story cannot be empty." };
    }

    await db
      .update(projects)
      .set({ story: story.trim(), updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save the story. Please try again." };
  }
}
