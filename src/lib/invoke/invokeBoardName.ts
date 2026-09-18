// INVOKE.PUSH.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.1 step 2, §6 "Nom des
// boards". Pure and deterministic: no network, no DB. Decides both the
// readable form (`MikAI · Shot 012 · Title`, `MikAI · Asset 42 · Name`) AND
// the truncation/uniqueness the ticket delegates to this module.
//
// Uniqueness is carried by MikAI's own `invoke_boards` unique constraint on
// (owner type, owner id) — InvokeAI itself never enforces board name
// uniqueness. This module's own job is only to make two different owners
// visually distinguishable in Invoke's board list, which is why the shot
// code (or, absent one, the numeric id) and the asset's numeric id are
// always part of the string, never just the human title/name alone.

const INVOKE_BOARD_NAME_MAX_LENGTH = 300; // InvokeAI's own `create_board` query param: max_length=300.
const ELLIPSIS = "…";

export type InvokeBoardNameInput =
  | { ownerType: "shot"; id: number; shotCode: string | null; title: string }
  | { ownerType: "asset"; id: number; name: string }
  // INVOKE.PUSH.2 — docs/INVOKE_ROUNDTRIP_SPEC.md §7 decision 6: a shot's
  // storyboard draft board and the shot's own board are deliberately
  // distinct addresses (see src/db/schema/invoke.ts's `ownerType` comment),
  // so this is its own variant, not a flag on the `"shot"` one above.
  | { ownerType: "shot_storyboard"; id: number; shotCode: string | null; title: string }
  | { ownerType: "sequence_storyboard"; id: number; sequenceCode: string | null; title: string }
  // INVOKE.STYLE.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §8 lot 3: the project
  // itself is the owner (one board per project, ownerId = the project's
  // id), so this variant carries the project's name only — no id in the
  // displayed name, per the ticket's exact naming rule (uniqueness is still
  // carried by invoke_boards' own (ownerType, ownerId) unique constraint,
  // never by this string).
  | { ownerType: "project_style"; id: number; projectName: string };

function truncateToLimit(prefix: string, tail: string): string {
  const full = `${prefix}${tail}`;
  if (full.length <= INVOKE_BOARD_NAME_MAX_LENGTH) return full;

  const room = INVOKE_BOARD_NAME_MAX_LENGTH - prefix.length - ELLIPSIS.length;
  if (room <= 0) {
    // The prefix alone doesn't fit — an extreme case (huge shot code/id),
    // but still return something within the limit rather than throw.
    return prefix.slice(0, INVOKE_BOARD_NAME_MAX_LENGTH);
  }
  return `${prefix}${tail.slice(0, room)}${ELLIPSIS}`;
}

/**
 * Builds the readable, per-owner Invoke board name. Deterministic: the same
 * input always produces the same output.
 */
export function buildInvokeBoardName(input: InvokeBoardNameInput): string {
  if (input.ownerType === "shot") {
    const shotLabel = input.shotCode?.trim() || `#${input.id}`;
    return truncateToLimit(`MikAI · Shot ${shotLabel} · `, input.title.trim());
  }

  if (input.ownerType === "shot_storyboard") {
    const shotLabel = input.shotCode?.trim() || `#${input.id}`;
    return truncateToLimit(`MikAI · Shot ${shotLabel} storyboard · `, input.title.trim());
  }

  if (input.ownerType === "sequence_storyboard") {
    const sequenceLabel = input.sequenceCode?.trim() || `#${input.id}`;
    return truncateToLimit(`MikAI · Sequence ${sequenceLabel} storyboard · `, input.title.trim());
  }

  if (input.ownerType === "project_style") {
    return truncateToLimit(`MikAI · Project style · `, input.projectName.trim());
  }

  return truncateToLimit(`MikAI · Asset ${input.id} · `, input.name.trim());
}
