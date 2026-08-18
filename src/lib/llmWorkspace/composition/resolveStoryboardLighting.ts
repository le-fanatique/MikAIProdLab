// ---------------------------------------------------------------------------
// composition/resolveStoryboardLighting.ts — LLMW.STORYBOARD.LIGHTING.1
//
// Resolves the lighting rig a storyboard composition renders, at the three
// levels it is actually built at.
//
// **Why precedence and not accumulation.** The author's craft model, given
// 2026-08-19 as a former lighting supervisor in animation:
//
//   > le plus malin c'est de travailler ton rig d'éclairage en upstream et
//   > d'affiner jusqu'au shot […] tu crées un environment, qui a une ambiance
//   > lumineuse, ta séquence se trouve dans cet environment, tu ajustes
//   > globalement ton rig de light hérité de l'environment, par rapport à la
//   > narration et les caméras axe master de la séquence. Une fois dans les
//   > shots, tu fine tune ton rig de light pour mettre en valeur les
//   > personnages ou le sens narratif du shot.
//
// The refinement is real — but it happens **in the text**, by copying a level
// down and editing it (B15b's "Fill from environment" button is that gesture),
// not by concatenating levels at prompt time. He put it plainly:
//
//   > recuperer le prompt de l'env dans la sequence, et juste decider de
//   > l'overrider en reprennant le text et en ajoutant ou supprimant certain
//   > mots, ca me parait pas trop cher, et plus agile qu un systeme additif.
//   > C'est un peu la meme logique que l'override de project style à la
//   > sequence par rapport au projet.
//
// The analogy is exact, and the codebase already implements it:
// `sequence_style_overrides` copies the Project Style snapshot byte-for-byte,
// then replaces it whole on update, "never merged field-by-field", and
// resolution is override-else-inherit. Lighting follows the same shape.
//
// An accumulating render would also have printed the same content twice — the
// environment's ambiance raw, and again inside the sequence's edited copy of
// it.
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

export type StoryboardLighting = {
  /** The effective lighting for each Shot, keyed by shot id. `null` means none resolved anywhere. */
  byShotId: Record<number, string | null>;
};

/**
 * `shots` carries each Shot's own `lighting` column, in any order.
 *
 * **Precedence, not accumulation** — the Shot's own field when set, otherwise
 * the Sequence's effective lighting (`resolveSeqLighting`, which already
 * resolves its own field before its environment Assets, B15a).
 *
 * The refinement the author describes happens **in the text**, not at prompt
 * time: he fills a level from the one above and edits it — B15b's "Fill from
 * environment" button is exactly that gesture — so the more specific value
 * already contains the inherited one as he rewrote it. Concatenating the levels
 * would print the ambiance twice, once raw and once edited.
 *
 * This mirrors `sequence_style_overrides` (`src/lib/projectStyle/resolveSequenceStyle.ts`)
 * exactly, and the author named the analogy himself: content copied from the
 * level above at creation, then *"only ever replaced whole by an explicit
 * update, never merged field-by-field"*, with resolution a plain
 * override-else-inherit.
 *
 * **Nothing here blocks.** His arbitration, 2026-08-19: he wants to generate
 * with no lighting direction at all, as a proof of concept of action and
 * framing, while the environment is still unlocked. Nothing resolved means
 * nothing rendered, never a refusal.
 */
export async function resolveStoryboardLighting(
  sequenceId: number,
  shots: Array<{ id: number; lighting: string | null }>
): Promise<StoryboardLighting> {
  const seq = await resolveSeqLighting(sequenceId);

  const sequenceLighting =
    seq.source === "own"
      ? seq.lighting.trim()
      : seq.source === "environment"
        ? seq.environments
            .filter((e): e is { name: string; lighting: string } => Boolean(e.lighting?.trim()))
            .map((e) => `${e.name}: ${e.lighting.trim()}`)
            .join("; ") || null
        : null;

  const byShotId: Record<number, string | null> = {};
  for (const shot of shots) {
    const own = shot.lighting?.trim();
    byShotId[shot.id] = own ? own : sequenceLighting;
  }

  return { byShotId };
}
