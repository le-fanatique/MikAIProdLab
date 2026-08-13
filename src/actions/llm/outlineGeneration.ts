"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { outlineGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/outline";

/**
 * Thin adapter over `runOperation(outlineGenerateDescriptor, ...)`
 * (LLMW.MIGRATE.FLATJSON.1a, B3a): translates `FormData` into `AnchorIds` +
 * `OperationIntentInput`, then translates `values` back to the exact
 * `{ok:true, outline}` return shape `OutlineGenerationPanel` depends on.
 */
export async function generateOutlineDraft(
  formData: FormData
): Promise<{ ok: true; outline: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);

    const rawSections = parseInt(formData.get("targetSections") as string, 10);
    const targetSections =
      Number.isInteger(rawSections) && rawSections >= 2 && rawSections <= 20
        ? rawSections
        : undefined;

    const result = await runOperation(
      outlineGenerateDescriptor,
      { projectId },
      targetSections != null ? { parameters: { targetSections } } : {}
    );
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, outline: result.values.outline };
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
