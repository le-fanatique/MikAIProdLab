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
// excluded) and `avoidText` (only the Avoid group) — split at
// the snapshot's own `strength` field (`compileAssetStyleSegments`'s
// `rulesPositiveSegment`/`rulesAvoidSegment`), never by parsing the joined
// text. `joinProjectStyleTextForComposition` below reconstructs the exact
// legacy single string for the Sequence Storyboard package callers, which
// were not asked to separate `Avoid` out (SHOTPROMPT.STYLE.1 §5 scope).
//
// SHOTPROMPT.RENDER.1 — `styleText`/`avoidText` now come from
// `compileAssetStyleSegments`'s `rulesPositiveBulletsOnly`/
// `rulesAvoidBulletsOnly` — bullet lines with no leading `Style Rules:`/
// `Avoid:` heading — instead of `rulesPositiveSegment`/`rulesAvoidSegment`.
// `composeShotGenerationPrompt`'s `Style: `/`Constraints:` labels already
// name the block; the heading duplicated it verbatim on the author's real
// payload (`Style: Style Rules:`, `Constraints: Avoid:`). This does not
// touch the Sequence Storyboard package's byte-identical legacy string:
// `joinProjectStyleTextForComposition` below now builds it directly from
// the still-headed `rulesPositiveSegment`/`rulesAvoidSegment`, which
// `compileAssetStyleSegments` keeps unchanged for exactly this caller —
// SHOTPROMPT.STYLE.1 §5 left that surface out of scope, and this ticket
// does too.
// ---------------------------------------------------------------------------

import { resolveProjectStyle } from "@/lib/llmWorkspace/variables/registry";

export type ResolvedProjectStyleTextForComposition = {
  /** World + Visual + Style Rules bullets (Avoid-strength rules excluded, no leading `Style Rules:` heading), joined. `null` when there is no effective Style content at all. */
  styleText: string | null;
  /** Only the Avoid group's bullet lines (no leading `Avoid:` heading), or `null` when none apply. */
  avoidText: string | null;
  /** SHOTPROMPT.RENDER.1 — the byte-identical pre-fix headed join, for `joinProjectStyleTextForComposition` only. `null` when there is no effective Style content at all. */
  legacyJoinedText: string | null;
};

export async function resolveProjectStyleTextForComposition(projectId: number): Promise<ResolvedProjectStyleTextForComposition> {
  const data = await resolveProjectStyle(projectId);
  if (data.mode === "none") return { styleText: null, avoidText: null, legacyJoinedText: null };

  // SHOTPROMPT.RENDER.1 — heading-less: the caller (`composeShotGenerationPrompt`)
  // already supplies `Style: `/`Constraints:`.
  const joined = [data.worldSegment, data.visualSegment, data.rulesPositiveBulletsOnly]
    .filter((segment) => segment.length > 0)
    .join("\n\n");

  // Byte-identical to this function's pre-SHOTPROMPT.RENDER.1 return: the
  // still-headed `rulesPositiveSegment`/`rulesAvoidSegment` joined exactly as
  // `[styleText, avoidText]` used to be — for `joinProjectStyleTextForComposition`
  // only.
  const legacyJoined = [data.worldSegment, data.visualSegment, data.rulesPositiveSegment, data.rulesAvoidSegment]
    .filter((segment) => segment.length > 0)
    .join("\n\n");

  return {
    styleText: joined.length > 0 ? joined : null,
    avoidText: data.rulesAvoidBulletsOnly.length > 0 ? data.rulesAvoidBulletsOnly : null,
    legacyJoinedText: legacyJoined.length > 0 ? legacyJoined : null,
  };
}

/**
 * Reconstructs the single joined text this function returned before
 * SHOTPROMPT.STYLE.1 split Style from Avoid — used only by the Sequence
 * Storyboard package callers (`buildSequenceStoryboardPrompt`'s header),
 * which still render one "Style:" block and were not part of that ticket's
 * scope (SHOTPROMPT.STYLE.1 §5), nor of SHOTPROMPT.RENDER.1's
 * (§4a/§4b talk only about the Shot composer's own labels). Returns
 * `legacyJoinedText` verbatim — computed above from the still-headed
 * segments, untouched by the heading-less fix.
 */
export function joinProjectStyleTextForComposition(resolved: ResolvedProjectStyleTextForComposition): string | null {
  return resolved.legacyJoinedText;
}
