"use server";

import { runOperation } from "@/lib/llmWorkspace/runner";
import { shotRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotRetakeDirected";
import type { GeneratedShotRetakeDraft } from "@/types/llm";

/**
 * `shot.retakeDirected` — LLMW.UC2.RETAKE.1 (B9b). Thin adapter over
 * `runOperation`, on the same model as `generateAssetBibleDraft`
 * (`src/actions/llm/assetBible.ts`): translates `FormData` into `AnchorIds`
 * plus the free-text director's note, then translates `values` back to the
 * `{ok:true, draft}` shape the panel needs. Unlike the eight migrated
 * actions, this one has no pre-ticket flat-JSON predecessor — it is a direct,
 * first-class caller of the runner (§3 of the ticket).
 */
export async function generateShotRetakeDraft(
  formData: FormData
): Promise<{ ok: true; draft: GeneratedShotRetakeDraft } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const shotId = parseInt(formData.get("shotId") as string, 10);
    const freeText = (formData.get("freeText") as string) || undefined;

    const result = await runOperation(
      shotRetakeDirectedDescriptor,
      { projectId, sequenceId, shotId },
      { freeText }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `shotRetakeDirectedDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateShotRetakeDraft: expected an object-kind result.");
    }
    // `RunOperationResult`'s `"object"` branch widened to `Record<string,
    // string | number>` (LLMW.OUTPUT.OBJECT_NUMBER.1, B11-b1) — but
    // `shotRetakeDirectedDescriptor` declares all three fields
    // `type: "string"`, so a number can never actually arrive here. Refused
    // loudly rather than silently assigned to `GeneratedShotRetakeDraft`'s
    // `string` fields, on the same discipline `generateAssetCandidatesDraft`
    // (`src/actions/llm/assetExtraction.ts`) already applies to an
    // unexpected boolean.
    const { description, actionPitch, cameraPitch } = result.values;
    if (typeof description === "number" || typeof actionPitch === "number" || typeof cameraPitch === "number") {
      throw new Error("generateShotRetakeDraft: unexpected numeric value in a string field.");
    }
    return {
      ok: true,
      draft: { description, actionPitch, cameraPitch },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
