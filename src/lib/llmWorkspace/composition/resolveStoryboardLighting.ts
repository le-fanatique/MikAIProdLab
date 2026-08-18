// ---------------------------------------------------------------------------
// composition/resolveStoryboardLighting.ts — LLMW.STORYBOARD.LIGHTING.1
//
// Resolves the lighting rig a storyboard composition renders, at the three
// levels it is actually built at.
//
// **Why the rig accumulates instead of falling back.** The author's craft
// model, given 2026-08-19 as a former lighting supervisor in animation:
//
//   > le plus malin c'est de travailler ton rig d'éclairage en upstream et
//   > d'affiner jusqu'au shot […] tu crées un environment, qui a une ambiance
//   > lumineuse, ta séquence se trouve dans cet environment, tu ajustes
//   > globalement ton rig de light hérité de l'environment, par rapport à la
//   > narration et les caméras axe master de la séquence. Une fois dans les
//   > shots, tu fine tune ton rig de light pour mettre en valeur les
//   > personnages ou le sens narratif du shot.
//
// So the Shot's line refines the Sequence's, which refines the environment's.
// Keeping only the most specific one would throw away the ambiance the whole
// scene is lit by.
//
// **Nothing here ever blocks.** Also his arbitration, same day: he wants to
// generate with no lighting direction at all — as a proof of concept of action
// and framing — while the environment is still unlocked, and update the
// lighting later before re-running. Every level is optional, and all three
// absent simply renders no lighting.
//
// Server-only: reads the database through the variable registry.
//
// This module exists because B14b wrote the same resolution twice, once in
// `sequenceGeneration.ts` and once in the generate page (which recomputes
// independently by its own convention). Two copies of a precedence rule is
// exactly how the two panes drift apart.
// ---------------------------------------------------------------------------

import "server-only";
import { resolveSeqLighting } from "../variables/registry";

export type StoryboardLightingRig = {
  /** The environment Assets' ambiance, in `resolveSeqLighting`'s own deterministic order. */
  environment: Array<{ name: string; lighting: string }>;
  /** The Sequence's own field — the global adjustment on that rig. */
  sequence: string | null;
  /** Each Shot's own field — the fine tune. Keyed by shot id; a missing key means none. */
  shotById: Record<number, string | null>;
};

/**
 * `shots` carries each Shot's own `lighting` column, in any order — the map it
 * produces is keyed, so order does not matter here.
 *
 * The environment ambiance and the Sequence's own field are read through
 * `resolveSeqLighting`, which owns the relation between a Sequence and its
 * environment Assets (B15a). **Its precedence rule is not re-implemented and
 * not bypassed**: when it reports `source: "own"` the Sequence has its own
 * value and no environment line is emitted for it, which is the one place the
 * accumulating model and B15a's "own wins" rule meet. See the note in
 * `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.9.
 */
export async function resolveStoryboardLightingRig(
  sequenceId: number,
  shots: Array<{ id: number; lighting: string | null }>
): Promise<StoryboardLightingRig> {
  const seq = await resolveSeqLighting(sequenceId);

  const environment =
    seq.source === "environment"
      ? seq.environments
          .filter((e): e is { name: string; lighting: string } => Boolean(e.lighting?.trim()))
          .map((e) => ({ name: e.name, lighting: e.lighting.trim() }))
      : [];
  const sequence = seq.source === "own" ? seq.lighting.trim() : null;

  const shotById: Record<number, string | null> = {};
  for (const shot of shots) {
    const own = shot.lighting?.trim();
    shotById[shot.id] = own ? own : null;
  }

  return { environment, sequence, shotById };
}
