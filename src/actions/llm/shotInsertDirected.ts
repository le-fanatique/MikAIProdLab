"use server";

// ---------------------------------------------------------------------------
// actions/llm/shotInsertDirected.ts — LLMW.UC1.SURFACE.1 (S6)
//
// The draft-generation half of `shot.insertDirected` on the Sequence page:
// a thin adapter over `runOperation(shotInsertDirectedDescriptor, ...)`,
// modelled on `generateShotPromptDraft` (`shotPrompt.ts`) one for one — same
// `FormData` -> `AnchorIds` + `OperationIntentInput` translation, same
// try/catch shape. Widened from that function's single-string draft to the
// full object draft `shot.insertDirected` produces (ten fields, one of them
// `type: "number"`), the same widening `runBenchOperation`
// (`actions/llmWorkspace/bench.ts`) already made for this same descriptor
// (LLMW.UC1.BENCH.1, B11-b3) — `result.values` is handed back as-is, still
// `Record<string, string | number>`, with no second flattening.
//
// `afterShotId` is read here only to normalize it into the descriptor's own
// `intent.parameters` shape (an `intent.parameters` entry, per
// `descriptors/shotInsertDirected.ts`'s own decision 2) — the id itself is
// supplied by the caller from the shot row the user clicked, never typed in
// by hand (`.agents/supervised_task.md` §1). The write side stays
// `createShotAtPosition` (`src/actions/llm/shotInsertion.ts`), untouched —
// this file never writes.
// ---------------------------------------------------------------------------

import { runOperation } from "@/lib/llmWorkspace/runner";
import { shotInsertDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotInsertDirected";

export async function generateShotInsertDraft(
  formData: FormData
): Promise<{ ok: true; draft: Record<string, string | number> } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);
    const sequenceId = parseInt(formData.get("sequenceId") as string, 10);
    const afterShotIdRaw = ((formData.get("afterShotId") as string | null) ?? "").trim();
    const rawFreeText = formData.get("freeText") as string | null;

    const afterShotId =
      afterShotIdRaw !== "" && Number.isInteger(Number(afterShotIdRaw)) ? Number(afterShotIdRaw) : undefined;

    const result = await runOperation(
      shotInsertDirectedDescriptor,
      { projectId, sequenceId },
      {
        freeText: rawFreeText ?? undefined,
        parameters: afterShotId !== undefined ? { afterShotId } : {},
      }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `shotInsertDirectedDescriptor.output.kind` is always `"object"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "object") {
      throw new Error("generateShotInsertDraft: expected an object-kind result.");
    }
    return { ok: true, draft: result.values };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}
