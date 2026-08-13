"use server";

import { runOperation } from "@/lib/llmWorkspace/runner";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";
import type { GeneratedAssetBibleDraft } from "@/types/llm";

/**
 * Thin adapter over `runOperation(assetBibleGenerateDescriptor, ...)`
 * (LLMW.MIGRATE.FLATJSON.1b, B3b): translates `FormData` into `AnchorIds`,
 * then translates `values` back to the exact `{ok:true, draft}` return shape
 * `AssetBibleEnhancePanel` depends on. Ownership, id validation, the
 * "Description or Notes" precondition, and the 800-char truncation on each
 * field — previously `resolveAssetBibleContext`
 * (`src/lib/prompts/assetBibleContext.ts`) and this adapter's own `.slice()`
 * calls, respectively — now happen inside the runner, against this
 * descriptor's own declared `messages`, `preconditions`, and `output.fields[].truncateTo`.
 * Pure translation: no operation-specific output logic lives here anymore.
 */
export async function generateAssetBibleDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedAssetBibleDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);

    const result = await runOperation(assetBibleGenerateDescriptor, { projectId, assetId });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      draft: {
        visualIdentity: result.values.visualIdentity,
        usageRules: result.values.usageRules,
        forbiddenVariations: result.values.forbiddenVariations,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
