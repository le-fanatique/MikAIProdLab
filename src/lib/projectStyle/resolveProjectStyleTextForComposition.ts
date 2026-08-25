import "server-only";

// ---------------------------------------------------------------------------
// resolveProjectStyleTextForComposition.ts — SHOTPROMPT.SHOT.1
//
// Extracted out of `src/actions/sequenceGeneration.ts` and the Sequence
// Storyboard generate page, which each kept a byte-identical copy of this
// eight-line wrapper — a deliberate duplication, by both files' own header
// comments ("same convention... this page already recomputes its whole DB
// fetch independently"). This ticket needed a THIRD (the Sequence Generation
// Package panel) and a FOURTH (the Shot composer, `composeShotGenerationPrompt`'s
// callers) caller of the exact same resolution, and its own instruction is
// explicit: reuse this function, never a second resolution. A fifth copy
// would have been the wrong response to that instruction, so this one
// specific wrapper — never the page-level DB-fetch convention itself — is
// now the shared exception.
//
// Resolves `resolveProjectStyle` verbatim rather than re-resolving Style
// here: it already wraps `resolveAssetStyleContext` (STYLE.1.F.CORE), the
// same call the Style preview (`prepareGenerationStyleSource`) goes through
// transitively — a second, parallel resolution of Project Style. Segments
// are joined exactly as `asset-bible-from-context.ts` already joins the same
// three segments for its own "Project Style:" block
// (`[worldSegment, visualSegment, rulesSegment].filter(Boolean).join("\n\n")`)
// — not a new join rule.
// ---------------------------------------------------------------------------

import { resolveProjectStyle } from "@/lib/llmWorkspace/variables/registry";

export async function resolveProjectStyleTextForComposition(projectId: number): Promise<string | null> {
  const data = await resolveProjectStyle(projectId);
  if (data.mode === "none") return null;
  const joined = [data.worldSegment, data.visualSegment, data.rulesSegment]
    .filter((segment) => segment.length > 0)
    .join("\n\n");
  return joined.length > 0 ? joined : null;
}
