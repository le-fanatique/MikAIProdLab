// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3 step 3, ticket §1.2/§3.
// Pure: no network, no DB. Given the full list of images InvokeAI reports for
// a board, decides which are new import candidates — excluding what MikAI
// itself pushed there (`invoke_pushed_images`) and what a previous sync
// already imported (`invoke_imported_images`). This is the decision the
// ticket names as the one pure function the mechanism's correctness rests
// on (ticket §3), proven by mutation, independent of the count-only
// short-circuit around it (§1.2) and of the transactional write that follows
// a positive decision.

export interface InvokeBoardImageRef {
  imageName: string;
}

export interface SelectInvokeImagesToImportArgs {
  /** Every image InvokeAI currently reports for the board (order preserved). */
  images: readonly InvokeBoardImageRef[];
  /** `image_name`s MikAI has pushed to this board — never re-imported as-is. */
  pushedImageNames: ReadonlySet<string>;
  /** `image_name`s a previous sync already imported for this board. */
  alreadyImportedImageNames: ReadonlySet<string>;
}

/**
 * Returns the subset of `images`, in the same order, that is neither a
 * pushed image nor an already-imported one. Deliberately order-preserving
 * (not re-sorted) and side-effect free: the caller decides what to do with
 * the result.
 */
export function selectInvokeImagesToImport(
  args: SelectInvokeImagesToImportArgs
): InvokeBoardImageRef[] {
  return args.images.filter(
    (image) =>
      !args.pushedImageNames.has(image.imageName) &&
      !args.alreadyImportedImageNames.has(image.imageName)
  );
}
