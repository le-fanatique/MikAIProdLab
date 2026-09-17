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
  | { ownerType: "asset"; id: number; name: string };

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

  return truncateToLimit(`MikAI · Asset ${input.id} · `, input.name.trim());
}
