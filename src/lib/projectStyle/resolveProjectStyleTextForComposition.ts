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
//
// SHOTPROMPT.STYLE.1 — this function used to return one joined string whose
// `rulesSegment` could end with its own trailing `Avoid:` block
// (`compileStyleSnapshot`'s own polarity split, STYLE.COMPILE.POLARITY.1).
// The Shot composer (`composeShotGenerationPrompt`) now renders `Avoid`
// under `Constraints:`, never under `Style:`, so this now returns the two
// values separately — `styleText` (World + Visual + Style Rules, Avoid
// excluded) and `avoidText` (only the compiled `Avoid:` block) — split at
// the snapshot's own `strength` field (`compileAssetStyleSegments`'s
// `rulesPositiveSegment`/`rulesAvoidSegment`), never by parsing the joined
// text. `joinProjectStyleTextForComposition` below reconstructs the exact
// legacy single string for the Sequence Storyboard package callers, which
// were not asked to separate `Avoid` out (SHOTPROMPT.STYLE.1 §5 scope).
// ---------------------------------------------------------------------------

import { resolveProjectStyle } from "@/lib/llmWorkspace/variables/registry";

export type ResolvedProjectStyleTextForComposition = {
  /** World + Visual + Style Rules (Avoid-strength rules excluded), joined exactly as before minus the trailing Avoid block. `null` when there is no effective Style content at all. */
  styleText: string | null;
  /** Only the compiled `Avoid:` block over Style rules with `strength: "Avoid"`, or `null` when none apply. */
  avoidText: string | null;
};

export async function resolveProjectStyleTextForComposition(projectId: number): Promise<ResolvedProjectStyleTextForComposition> {
  const data = await resolveProjectStyle(projectId);
  if (data.mode === "none") return { styleText: null, avoidText: null };
  const joined = [data.worldSegment, data.visualSegment, data.rulesPositiveSegment]
    .filter((segment) => segment.length > 0)
    .join("\n\n");
  return {
    styleText: joined.length > 0 ? joined : null,
    avoidText: data.rulesAvoidSegment.length > 0 ? data.rulesAvoidSegment : null,
  };
}

/**
 * Reconstructs the single joined text this function returned before
 * SHOTPROMPT.STYLE.1 split Style from Avoid — used only by the Sequence
 * Storyboard package callers (`buildSequenceStoryboardPrompt`'s header),
 * which still render one "Style:" block and were not part of this ticket's
 * scope (SHOTPROMPT.STYLE.1 §5). Byte-identical to the old single-string
 * return: `[styleText, avoidText]` joined the same way `compileStyleSnapshot`
 * already joins its own blocks.
 */
export function joinProjectStyleTextForComposition(resolved: ResolvedProjectStyleTextForComposition): string | null {
  const joined = [resolved.styleText, resolved.avoidText].filter((s): s is string => Boolean(s)).join("\n\n");
  return joined.length > 0 ? joined : null;
}
