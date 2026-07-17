// ---------------------------------------------------------------------------
// imageInputCompatibility.ts — SEQGEN.VIDEO.1
//
// Pure classification of a workflow's image-input compatibility for the
// mandatory Sequence Storyboard board mapping. Kept out of
// sequenceVideoGeneration.ts ("use server") because it is synchronous —
// every exported top-level function in a "use server" file must be async.
// ---------------------------------------------------------------------------

export type ImageInputCompatibility =
  | { kind: "none" }
  | { kind: "mono"; nodeId: string }
  | { kind: "ambiguous"; nodeIds: string[] }
  | { kind: "multi" };

/**
 * Classifies this workflow's image-input compatibility, using its parsed
 * `(Input)` structure — NEVER its name/id. Returns the exact mandatory
 * mapping decision Lot B needs:
 *   - "none": zero image inputs and no Dynamic Batch — incompatible.
 *   - "mono": exactly one plain image input, no Dynamic Batch — the board
 *     maps to it automatically (unambiguous by construction).
 *   - "ambiguous": more than one plain image input and no Dynamic Batch —
 *     ships with no automatic choice; the caller must block and ask for an
 *     explicit `boardTargetNodeId`.
 *   - "multi": a Dynamic Batch / direct-repeatable node is present — the
 *     board occupies the first slot, optional references fill the rest.
 */
export function classifyImageInputCompatibility(
  imageInputNodeIds: string[],
  multiImageSupported: boolean
): ImageInputCompatibility {
  if (multiImageSupported) return { kind: "multi" };
  if (imageInputNodeIds.length === 0) return { kind: "none" };
  if (imageInputNodeIds.length === 1) return { kind: "mono", nodeId: imageInputNodeIds[0] };
  return { kind: "ambiguous", nodeIds: imageInputNodeIds };
}
