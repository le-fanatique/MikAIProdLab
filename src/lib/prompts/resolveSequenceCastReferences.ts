// ---------------------------------------------------------------------------
// resolveSequenceCastReferences.ts — IND.SEQGEN.RESOLVE.1.
//
// Mechanical extraction of the two data-resolution sections previously
// inline in the Sequence Storyboard generate page (lines 230-376 as they
// stood before this ticket): "Cast Assets across every Shot of the Sequence
// (unique)" and "Only Asset casting references feed generation in this
// MVP" — plus everything else that lived in that same span (the
// storyboardComposition/storyboardRefs query-param reads, the resulting
// `availableImages`, and the workflow JSON parse), because the page
// consumes all of it downstream and the ticket draws its boundary at the
// next section comment ("Dynamic Batch UI info"), not at the casting logic
// alone.
//
// Same SQL, in the same order, moved verbatim — this ticket changes no
// behavior. See `.agents/executor_report.md` for the queries the author
// judged redundant and deliberately left in place.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { shotAssets, assets, assetReferenceImages } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { filterAvailableImagesBySelection } from "@/lib/comfy/filterAvailableImagesBySelection";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import type { SequenceStoryboardReferenceInput } from "@/lib/prompts/buildSequenceStoryboardPrompt";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import { refImageUrl } from "@/lib/refImageUrl";
import type { StoryboardCastAsset } from "@/components/StoryboardAssetsPanel";

type AssetRow = typeof assets.$inferSelect;
type AssetReferenceImageRow = typeof assetReferenceImages.$inferSelect;

export type SequenceCastRow = {
  shotId: number;
  assetId: AssetRow["id"];
  assetName: AssetRow["name"];
  assetType: AssetRow["type"];
  description: AssetRow["description"];
  notes: AssetRow["notes"];
  visualIdentity: AssetRow["visualIdentity"];
  usageRules: AssetRow["usageRules"];
  forbiddenVariations: AssetRow["forbiddenVariations"];
  // ASSET.PROMPTCARD.1 — same reasoning as the three fields above.
  promptCard: AssetRow["promptCard"];
};

export type SequenceAssetReferenceRow = {
  id: AssetReferenceImageRow["id"];
  assetId: AssetReferenceImageRow["assetId"];
  imagePath: AssetReferenceImageRow["imagePath"];
  label: AssetReferenceImageRow["label"];
  imageRole: AssetReferenceImageRow["imageRole"];
  variantState: AssetReferenceImageRow["variantState"];
  usageNotes: AssetReferenceImageRow["usageNotes"];
  approvedForGeneration: AssetReferenceImageRow["approvedForGeneration"];
};

export type ResolveSequenceCastReferencesArgs = {
  shotIds: number[];
  currentSearchParams: Record<string, string>;
  workflowJson: string;
};

export type ResolveSequenceCastReferencesResult = {
  castByShot: Map<number, SequenceCastRow[]>;
  assetRefsByAsset: Map<number, SequenceAssetReferenceRow[]>;
  refMetaByRefId: Map<string, SequenceStoryboardReferenceInput>;
  castingEditorAssets: StoryboardCastAsset[];
  storyboardCompositionParam: string;
  useGuideComposition: boolean;
  storyboardRefsParam: string;
  hasExplicitSelection: boolean;
  availableImages: RuntimeImageOption[];
  parsed: ReturnType<typeof parseComfyWorkflow>;
};

export async function resolveSequenceCastReferences({
  shotIds,
  currentSearchParams,
  workflowJson,
}: ResolveSequenceCastReferencesArgs): Promise<ResolveSequenceCastReferencesResult> {
  // --- Cast Assets across every Shot of the Sequence (unique) ---
  const castRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: shotAssets.shotId,
            assetId: assets.id,
            assetName: assets.name,
            assetType: assets.type,
            description: assets.description,
            notes: assets.notes,
            visualIdentity: assets.visualIdentity,
            usageRules: assets.usageRules,
            forbiddenVariations: assets.forbiddenVariations,
            promptCard: assets.promptCard,
          })
          .from(shotAssets)
          .innerJoin(assets, eq(shotAssets.assetId, assets.id))
          .where(inArray(shotAssets.shotId, shotIds))
          .orderBy(asc(assets.name))
      : [];
  const castByShot = new Map<number, typeof castRows>();
  const assetMetaById = new Map<number, (typeof castRows)[number]>();
  for (const row of castRows) {
    const list = castByShot.get(row.shotId) ?? [];
    list.push(row);
    castByShot.set(row.shotId, list);
    if (!assetMetaById.has(row.assetId)) assetMetaById.set(row.assetId, row);
  }
  const uniqueAssetIds = Array.from(assetMetaById.keys());

  const assetRefRows =
    uniqueAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            imagePath: assetReferenceImages.imagePath,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            variantState: assetReferenceImages.variantState,
            usageNotes: assetReferenceImages.usageNotes,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, uniqueAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];
  const assetRefsByAsset = new Map<number, typeof assetRefRows>();
  for (const row of assetRefRows) {
    const list = assetRefsByAsset.get(row.assetId) ?? [];
    list.push(row);
    assetRefsByAsset.set(row.assetId, list);
  }

  // --- Only Asset casting references feed generation in this MVP ---
  const allAvailableImages: RuntimeImageOption[] = [];
  const refMetaByRefId = new Map<string, SequenceStoryboardReferenceInput>();
  for (const assetId of uniqueAssetIds) {
    const meta = assetMetaById.get(assetId)!;
    for (const img of assetRefsByAsset.get(assetId) ?? []) {
      const refId = `asset-${assetId}-${img.id}`;
      allAvailableImages.push({
        id: refId,
        source: "asset",
        imagePath: img.imagePath,
        label: img.label?.trim() || img.imageRole?.trim() || "Image",
        role: img.imageRole,
        assetName: meta.assetName,
        assetType: meta.assetType,
        variantState: img.variantState,
        approved: img.approvedForGeneration,
      });
      refMetaByRefId.set(refId, {
        refId,
        assetId,
        assetName: meta.assetName,
        assetType: meta.assetType,
        role: img.imageRole,
        roleLabel: getReferenceImageRoleLabel(img.imageRole),
        label: img.label,
        variantState: img.variantState,
        approvedForGeneration: img.approvedForGeneration,
      });
    }
  }

  // Lot D (SEQGEN.STORYBOARD.CASTING.FIX1) — the same shape StoryboardAssetsPanel
  // already renders on the Storyboard workspace, recomputed here from the
  // data already fetched above (no second query, no second selection
  // contract): every Asset cast anywhere in this Sequence, including
  // references not currently selected.
  const shotIdsByAsset = new Map<number, Set<number>>();
  for (const row of castRows) {
    const shotSet = shotIdsByAsset.get(row.assetId) ?? new Set<number>();
    shotSet.add(row.shotId);
    shotIdsByAsset.set(row.assetId, shotSet);
  }
  const castingEditorAssets: StoryboardCastAsset[] = uniqueAssetIds.map((assetId) => {
    const meta = assetMetaById.get(assetId)!;
    const refs = assetRefsByAsset.get(assetId) ?? [];
    return {
      assetId,
      assetName: meta.assetName,
      assetType: meta.assetType,
      shotCount: shotIdsByAsset.get(assetId)?.size ?? 0,
      references: refs.map((r) => ({
        id: r.id,
        refId: `asset-${assetId}-${r.id}`,
        imageUrl: refImageUrl(r.imagePath),
        label: r.label,
        roleLabel: getReferenceImageRoleLabel(r.imageRole),
        variantState: r.variantState,
        approvedForGeneration: r.approvedForGeneration,
      })),
    };
  });

  // LLMW.STORYBOARD.COMPOSE.2 (B14b) — read server-side from the same
  // `searchParams` every other control on this page already reads, never a
  // client-built object (B16b's discipline).
  //
  // LLMW.STORYBOARD.DEFAULT.1 — **the guide composition is the default**, and
  // only the literal `"legacy"` opts out. B14b shipped the reverse so the
  // author could compare before committing; he ran his beta on 2026-08-19,
  // exercised it and found it better, so the default flipped. The legacy path
  // is untouched and still reachable.
  const storyboardCompositionParam = currentSearchParams["storyboardComposition"] ?? "guide";
  const useGuideComposition = storyboardCompositionParam !== "legacy";

  const storyboardRefsParam = currentSearchParams["storyboardRefs"] ?? "";
  const storyboardSelectedRefIds = storyboardRefsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // SEQGEN.STORYBOARD.3 (retake) — "selectionnees explicitement par
  // l'utilisateur" is a hard requirement here, unlike the Shot-level
  // default-preserve convention: an EMPTY selection must mean "nothing
  // available", not "everything available". filterAvailableImagesBySelection
  // itself is never modified (its own default-preserve contract is correct
  // for its other callers) — only this caller's own fallback changes.
  const hasExplicitSelection = storyboardSelectedRefIds.length > 0;
  const availableImages = hasExplicitSelection
    ? filterAvailableImagesBySelection(allAvailableImages, storyboardSelectedRefIds)
    : [];

  const parsed = parseComfyWorkflow(workflowJson);

  return {
    castByShot,
    assetRefsByAsset,
    refMetaByRefId,
    castingEditorAssets,
    storyboardCompositionParam,
    useGuideComposition,
    storyboardRefsParam,
    hasExplicitSelection,
    availableImages,
    parsed,
  };
}
