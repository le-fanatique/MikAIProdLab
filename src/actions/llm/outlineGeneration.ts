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

    // The 2-20 bound and the "no default" behaviour used to be re-checked
    // here by hand; both are now the runner's own job
    // (`normalizeIntentParameters`, LLMW.PARAM.BOUNDS.1, B7e-n), driven by
    // `outlineGenerateDescriptor.intent.parameters`. The raw parsed value
    // (possibly `NaN` when the field is absent) is passed through as-is —
    // an invalid or missing `targetSections` is omitted by the runner the
    // same way it was omitted here before.
    const rawSections = parseInt(formData.get("targetSections") as string, 10);

    const result = await runOperation(
      outlineGenerateDescriptor,
      { projectId },
      { parameters: { targetSections: rawSections } }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `outlineGenerateDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateOutlineDraft: expected an object-kind result.");
    }
    // `RunOperationResult`'s `"object"` branch widened to `Record<string,
    // string | number>` (LLMW.OUTPUT.OBJECT_NUMBER.1, B11-b1) — but
    // `outlineGenerateDescriptor` declares its one field `type: "string"`, so
    // a number can never actually arrive here. Refused loudly rather than
    // silently returned as this function's own `outline: string`, on the
    // same discipline `generateAssetCandidatesDraft`
    // (`src/actions/llm/assetExtraction.ts`) already applies to an
    // unexpected boolean.
    const { outline } = result.values;
    if (typeof outline === "number") {
      throw new Error("generateOutlineDraft: unexpected numeric value in a string field.");
    }
    return { ok: true, outline };
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
