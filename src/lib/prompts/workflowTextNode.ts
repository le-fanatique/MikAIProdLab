// ---------------------------------------------------------------------------
// workflowTextNode.ts — resolving a workflow's real "Text Prompt (Input)"
// node among its detected text-kind mappings.
//
// Moved out of promptCompilerHandoff.ts (IND.COMPILER.UNTANGLE.1): this is
// pure workflow-node resolution, unrelated to the Prompt Compiler handoff
// channel that module used to also hold. ShotGenerationPanel and the /map
// page still use it for real, independently of that now-removed channel.
// Body unchanged from its previous location.
// ---------------------------------------------------------------------------

import { detectTextInputKind } from "@/lib/textInputKind";

export type PromptCompilerTextNodeCandidate = { nodeId: string; label: string; title: string };

export type PromptCompilerTextNodeResolution =
  | { ok: true; nodeId: string }
  | { ok: false; reason: string };

/**
 * Identifies the real "Text Prompt (Input)" node among a workflow's
 * detected text-kind mappings, reusing the existing detectTextInputKind
 * helper (never re-implemented). Never silently guesses when zero or more
 * than one candidate is generic (i.e. neither negative nor style).
 */
export function resolvePromptCompilerTextNode(
  candidates: PromptCompilerTextNodeCandidate[]
): PromptCompilerTextNodeResolution {
  const generic = candidates.filter(
    (c) => detectTextInputKind(c.label || c.title) === "generic"
  );
  if (generic.length === 0) {
    return {
      ok: false,
      reason:
        "No Text Prompt (Input) field was detected on this workflow. The Compiled Prompt Draft cannot be applied automatically.",
    };
  }
  if (generic.length > 1) {
    return {
      ok: false,
      reason:
        "Multiple possible Text Prompt (Input) fields were detected on this workflow. Choose the field manually — the Compiled Prompt Draft was not applied automatically.",
    };
  }
  return { ok: true, nodeId: generic[0].nodeId };
}
