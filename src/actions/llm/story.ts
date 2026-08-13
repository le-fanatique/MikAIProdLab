"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { storyGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/story";

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Thin adapter over `runOperation(storyGenerateDescriptor, ...)`
 * (LLMW.MIGRATE.FLATJSON.1a, B3a): translates the historical positional
 * argument into `AnchorIds`, then translates `values` back to the exact
 * `{ok:true, story}` return shape `StoryGenerationPanel` depends on.
 */
export async function generateStory(
  projectId: number
): Promise<{ ok: true; story: string } | { ok: false; error: string }> {
  try {
    const result = await runOperation(storyGenerateDescriptor, { projectId });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, story: result.values.story };
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
