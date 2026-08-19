"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

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
