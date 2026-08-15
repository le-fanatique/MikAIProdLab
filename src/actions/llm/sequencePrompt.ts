"use server";

import { runOperation } from "@/lib/llmWorkspace/runner";
import { sequencePromptAssistDescriptor } from "@/lib/llmWorkspace/descriptors/sequencePrompt";

/**
 * Thin adapter over `runOperation(sequencePromptAssistDescriptor, ...)`
 * (LLMW.MIGRATE.FLATJSON.1a, B3a): translates `FormData` into `AnchorIds` +
 * `OperationIntentInput`, then translates `values` back to the exact
 * `{ok:true, draft}` return shape `SequencePromptLLMAssistPanel` depends on.
 * Mode validation ("Invalid assist mode.") now happens inside the runner,
 * against the descriptor's own declared modes.
 */
export async function generateSequencePromptDraft(
  formData: FormData
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const rawMode = (formData.get("mode") as string | null) ?? "generate";

    const result = await runOperation(
      sequencePromptAssistDescriptor,
      { projectId, sequenceId },
      { mode: rawMode }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `sequencePromptAssistDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateSequencePromptDraft: expected an object-kind result.");
    }
    return { ok: true, draft: result.values.sequencePrompt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
