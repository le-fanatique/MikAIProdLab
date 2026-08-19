"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

// LLMW.UNIFY.PANEL.2 — `generateOutlineDraft` is deleted:
// `OutlineGenerationPanel` now calls `runWorkspaceOperation` directly,
// naming `outline.generate` itself. `applyGeneratedOutline` below is
// untouched — it is the panel's own commit binding, not a generation
// function.

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
