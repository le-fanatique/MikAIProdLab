// ---------------------------------------------------------------------------
// shotLightingFill.ts — LLMW.LIGHTING.SHOTFILL.1
//
// The logic behind the Shot edit page's "Fill from sequence" button (§5.9 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md). Split in two on purpose, exactly as
// sequenceLightingFill.ts (B15b) is:
//
//   - `buildShotLightingFillText` is pure — no database, no React, no
//     "server-only". What to copy, and when there is nothing to offer, live
//     here where a test can call it directly with a plain `SeqLightingData`
//     value. Putting this in JSX (a button's onClick, or inline in a Server
//     Component's render) would make it unprovable — the ticket's own
//     instruction.
//   - `computeShotLightingFill` is the thin, `server-only` wrapper that runs
//     the query and hands its result to the pure function above.
//
// The query itself is not duplicated: `resolveSeqLighting`
// (`variables/registry.ts`) is the one place it lives. This is the mirror
// image of B15b's own choice: that button could not call `resolveSeqLighting`
// because it exists to overwrite the Sequence's own field, so short-circuiting
// on `{ source: "own" }` would have hidden the environment value it needs to
// offer. THIS button has no such conflict — it wants exactly the Sequence's
// *effective* lighting, precedence included (its own field when filled, else
// its environment Assets'), to overwrite the Shot's own field. Calling
// `resolveSeqLighting` here is therefore the right choice, not the trap it
// was there. See that function's own comment in `variables/registry.ts` for
// the full reasoning.
// ---------------------------------------------------------------------------

import "server-only";
import { resolveSeqLighting, type SeqLightingData } from "./variables/registry";

/**
 * Turns a Sequence's effective lighting (`resolveSeqLighting`'s own return
 * shape) into the text the Shot's "Fill from sequence" button writes.
 *
 * - `source: "own"` — the Sequence's own field wins; its trimmed text is
 *   copied verbatim.
 * - `source: "environment"` — reuses the exact "name: lighting" concatenation
 *   B15b's `buildSequenceLightingFillText` fixed, across every environment
 *   Asset that has a non-blank lighting value. Several environments is a
 *   normal case (decided in B15a): no election rule, every one of them is
 *   included.
 * - `source: "none"` — nothing to offer.
 *
 * Returns `null` whenever there is nothing to copy, so the caller knows not
 * to offer the button: writing an empty value is worse than offering
 * nothing.
 */
export function buildShotLightingFillText(sequenceLighting: SeqLightingData): string | null {
  if (sequenceLighting.source === "own") {
    const trimmed = sequenceLighting.lighting.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (sequenceLighting.source === "environment") {
    const withLighting = sequenceLighting.environments.filter(
      (e) => e.lighting != null && e.lighting.trim() !== ""
    );
    if (withLighting.length === 0) return null;
    return withLighting.map((e) => `${e.name}: ${e.lighting!.trim()}`).join("\n\n");
  }

  return null;
}

/**
 * Runs `resolveSeqLighting` for this Shot's Sequence and hands the result to
 * `buildShotLightingFillText`. Used both by the Shot edit page (to decide
 * whether to render the button at all) and by the button's own Server Action
 * (to compute what it actually writes) — so the two can never disagree about
 * when there is something to copy.
 */
export async function computeShotLightingFill(sequenceId: number): Promise<string | null> {
  const sequenceLighting = await resolveSeqLighting(sequenceId);
  return buildShotLightingFillText(sequenceLighting);
}
