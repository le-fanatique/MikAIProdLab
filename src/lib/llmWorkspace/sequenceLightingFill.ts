// ---------------------------------------------------------------------------
// sequenceLightingFill.ts — LLMW.LIGHTING.SURFACE.1 (B15b)
//
// The logic behind the Sequence edit page's "Fill from environment" button
// (§5.9 of docs/LLM_WORKSPACE_PRODUCT_VISION.md). Split in two on purpose:
//
//   - `buildSequenceLightingFillText` is pure — no database, no React, no
//     "server-only". What to copy, in what order, and when there is nothing
//     to offer, all live here where a test can call it directly with a plain
//     array. Putting this in JSX (a button's onClick, or inline in a Server
//     Component's render) would make it unprovable — the ticket's own
//     instruction.
//   - `computeSequenceLightingFill` is the thin, `server-only` wrapper that
//     runs the query and hands its result to the pure function above.
//
// The query itself is not duplicated: `resolveSequenceEnvironmentAssets`
// (`variables/registry.ts`) is the one place it lives, extracted for exactly
// this consumer — see that function's own comment for why calling
// `resolveSeqLighting` from here instead would be wrong (it short-circuits
// to `{ source: "own" }` and never reaches the environment query at all
// whenever the Sequence's own field already has a value, which is exactly
// the case this button exists to overwrite).
// ---------------------------------------------------------------------------

import "server-only";
import {
  resolveSequenceEnvironmentAssets,
  type SeqLightingEnvironmentEntry,
} from "./variables/registry";

/**
 * Concatenates every environment Asset that has a non-blank `lighting`
 * value, in the order given (the caller's query already orders by
 * `assets.name` ascending — this function does not re-sort). Several
 * environments are a normal case (decided in B15a): no election rule, every
 * one of them is included, each with its own name so the assembled value
 * stays legible. Returns `null` when there is nothing to copy — no
 * environment at all, or none of them has a lighting value — so the caller
 * knows not to offer the button: writing an empty value is worse than
 * offering nothing.
 */
export function buildSequenceLightingFillText(
  environments: SeqLightingEnvironmentEntry[]
): string | null {
  const withLighting = environments.filter(
    (e) => e.lighting != null && e.lighting.trim() !== ""
  );
  if (withLighting.length === 0) return null;
  return withLighting.map((e) => `${e.name}: ${e.lighting!.trim()}`).join("\n\n");
}

/**
 * Runs the environment query for this Sequence and hands it to
 * `buildSequenceLightingFillText`. Used both by the Sequence edit page (to
 * decide whether to render the button at all) and by the button's own
 * Server Action (to compute what it actually writes) — so the two can never
 * disagree about when there is something to copy.
 */
export async function computeSequenceLightingFill(sequenceId: number): Promise<string | null> {
  const environments = await resolveSequenceEnvironmentAssets(sequenceId);
  return buildSequenceLightingFillText(environments);
}
