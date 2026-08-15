"use server";

import { runOperation } from "@/lib/llmWorkspace/runner";
import { shotPromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/shotPrompt";

/**
 * Thin adapter over `runOperation(shotPromptAssistDescriptor, ...)`
 * (LLMW.MIGRATE.FLATJSON.1b, B3b): translates `FormData` into `AnchorIds` +
 * `OperationIntentInput`, then translates `values` back to the exact
 * `{ok:true, draft}` return shape `ShotPromptLLMAssistPanel` (or its
 * equivalent) depends on. Mode validation ("Invalid assist mode.") now
 * happens inside the runner, against the descriptor's own declared
 * `invalidMode` message.
 *
 * `freeText` (LLMW.INTENT.FREETEXT.1, B9a): read the same way as `mode` —
 * an absent field is `undefined`, which the descriptor's own render
 * contract already treats as "no consigne" (empty string, block dropped).
 * A caller that never sends this field (every trigger before this ticket)
 * gets exactly the previous behaviour.
 */
export async function generateShotPromptDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const shotId = parseInt(formData.get("shotId") as string, 10);
    const rawMode = (formData.get("mode") as string | null) ?? "generate";
    const rawFreeText = formData.get("freeText") as string | null;

    const result = await runOperation(
      shotPromptAssistDescriptor,
      { projectId, sequenceId, shotId },
      { mode: rawMode, freeText: rawFreeText ?? undefined }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `shotPromptAssistDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateShotPromptDraft: expected an object-kind result.");
    }
    return { ok: true, draft: result.values.shotPrompt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
