"use server";

import { runOperation } from "@/lib/llmWorkspace/runner";
import { assetRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/assetRetakeDirected";
import type { GeneratedAssetRetakeDraft } from "@/types/llm";

/**
 * `asset.retakeDirected` — LLMW.UC3.SURFACE.1 (S4). Thin adapter over
 * `runOperation`, on the same model as `generateShotRetakeDraft`
 * (`src/actions/llm/shotRetake.ts`, S4's own model): translates `FormData`
 * into `AnchorIds` plus the free-text director's note, then translates
 * `values` back to the `{ok:true, draft}` shape the panel needs.
 */
export async function generateAssetRetakeDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedAssetRetakeDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const assetId = parseInt(formData.get("assetId") as string, 10);
    const freeText = (formData.get("freeText") as string) || undefined;

    const result = await runOperation(assetRetakeDirectedDescriptor, { projectId, assetId }, { freeText });
    if (!result.ok) return { ok: false, error: result.error };
    // `assetRetakeDirectedDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateAssetRetakeDraft: expected an object-kind result.");
    }
    // `RunOperationResult`'s `"object"` branch widened to `Record<string,
    // string | number>` (LLMW.OUTPUT.OBJECT_NUMBER.1, B11-b1) — but
    // `assetRetakeDirectedDescriptor` declares its one field `type: "string"`,
    // so a number can never actually arrive here. Refused loudly rather than
    // silently assigned to `GeneratedAssetRetakeDraft`'s `string` field, on
    // the same discipline `generateShotRetakeDraft` already applies.
    const { description } = result.values;
    if (typeof description === "number") {
      throw new Error("generateAssetRetakeDraft: unexpected numeric value in a string field.");
    }
    return { ok: true, draft: { description } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
