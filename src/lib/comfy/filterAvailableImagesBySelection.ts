// ---------------------------------------------------------------------------
// filterAvailableImagesBySelection.ts — SEQGEN.STORYBOARD.2 (retake).
//
// Pure function: no DB, no browser, no network. Extracted out of
// ShotGenerationPanel.tsx so the actual transport of a Storyboard Assets
// selection into the real generation payload (via `availableImages` — see
// that component) is independently, deterministically testable, not just
// exercised by an SSR read of the whole panel.
// ---------------------------------------------------------------------------

import type { RuntimeImageOption } from "./mapWorkflowInputs";

/**
 * Reorders/filters `allImages` down to exactly the ids in `selectedIds`, in
 * the exact order `selectedIds` gives them — never the source array's own
 * order. An id with no match (stale/removed reference) is silently dropped,
 * never fabricated. When `selectedIds` is empty, returns `allImages`
 * unchanged (today's default behavior: every cast/shot reference stays
 * available).
 */
export function filterAvailableImagesBySelection(
  allImages: RuntimeImageOption[],
  selectedIds: string[]
): RuntimeImageOption[] {
  if (selectedIds.length === 0) return allImages;

  const byId = new Map(allImages.map((img) => [img.id, img]));
  const result: RuntimeImageOption[] = [];
  for (const id of selectedIds) {
    const match = byId.get(id);
    if (match) result.push(match);
  }
  return result;
}
