// ---------------------------------------------------------------------------
// orderStoryboardReferences.ts — IND.REFORDER.1
//
// Which image carries which `@ImageN` label in the Sequence Storyboard prompt.
//
// Lifted out of the generate page unchanged. It was ~15 lines in the middle of
// 1 100, and it decides something the prompt depends on absolutely: the model
// is told "@Image3 is the environment", so if position 3 of what is actually
// sent holds a different image, the prompt lies and nothing reports it.
//
// That is the same class of failure as the `inputcount` bug found in daily use
// — the extra images were sent and silently ignored. Wrong order fails the same
// way: no error, a slightly worse result, no way to tell why.
//
// Pure: given the batch's own selection and the available images, it returns
// the order and the metadata. No database, no request.
// ---------------------------------------------------------------------------

export type OrderableImage = { id: string };

/**
 * SEQGEN.STORYBOARD.3's rule, preserved verbatim in intent.
 *
 * **`@ImageN` must designate the image actually sent at that position.** When
 * the workflow has a Dynamic Batch node, that is the batch's own selected
 * order and subset — never the raw Storyboard Assets order, which the user can
 * reorder or narrow independently inside the batch panel. Only a workflow
 * without a batch node, where images are assigned per node instead, falls back
 * to the full available order.
 *
 * A selected id with no metadata is dropped rather than emitted as a hole: a
 * gap would shift every later label by one, which is exactly the silent
 * mismatch this function exists to prevent.
 */
export function orderStoryboardReferences<TMeta>(params: {
  /** True when a Dynamic Batch node was detected and is usable. */
  hasDynamicBatch: boolean;
  /** The batch's own selection, in its own order. */
  batchSelectedIds: string[];
  /** Everything selectable, in display order — the fallback when there is no batch node. */
  availableImages: OrderableImage[];
  /** Reference metadata by id. An id absent here is dropped. */
  metaByRefId: Map<string, TMeta>;
}): { orderedIds: string[]; references: TMeta[] } {
  const orderedIds = params.hasDynamicBatch
    ? params.batchSelectedIds
    : params.availableImages.map((img) => img.id);

  const references = orderedIds
    .map((id) => params.metaByRefId.get(id))
    .filter((meta): meta is TMeta => meta !== undefined);

  return { orderedIds, references };
}
