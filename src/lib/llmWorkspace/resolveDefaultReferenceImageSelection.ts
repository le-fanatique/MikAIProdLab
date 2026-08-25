// ---------------------------------------------------------------------------
// resolveDefaultReferenceImageSelection.ts — ASSET.LIGHTING.PLACE.3.
//
// Pure function: no DB, no browser, no React state. The single place that
// decides which reference image ids `AssetLightingFromImagePanel` starts
// pre-checked with, extracted out of its `useState` initializer so the rule
// itself — not just its call site — is provable in a node test.
//
// The rule, exactly, per the ticket:
//   - at least one image is `approvedForGeneration` → those images are
//     selected by default, in their existing order, capped at `maxCount`;
//   - otherwise → nothing is selected.
//
// **This does not reintroduce the approval gate `ASSET.LIGHTING.PLACE.2`
// removed.** Approval here decides only what starts pre-checked — never
// whether the card renders, nor which images are offered: every image in
// `referenceImages` stays in the grid and stays clickable, approved or not,
// because `ASSET.REFERENCE_IMAGES` (this panel's own declared image source)
// never filters on approval either.
// ---------------------------------------------------------------------------

export type ApprovableReferenceImage = { id: number; approvedForGeneration: boolean };

export function resolveDefaultReferenceImageSelection(
  referenceImages: ApprovableReferenceImage[],
  maxCount: number
): number[] {
  const approved = referenceImages.filter((image) => image.approvedForGeneration);
  if (approved.length === 0) return [];
  return approved.slice(0, maxCount).map((image) => image.id);
}
