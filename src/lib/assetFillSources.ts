import type { FillSource } from "@/lib/textInputKind";

/**
 * ASSET.GENERATION.FILL.VISUAL.IDENTITY.1 — single source of truth for the
 * Fill menu built from Asset Description, Notes and Visual Identity, shared
 * by AssetGenerationPanel and the Asset generate page (previously duplicated).
 */
export function buildAssetFillSources(
  description: string | null | undefined,
  notes: string | null | undefined,
  visualIdentity: string | null | undefined,
): FillSource[] {
  const descTrimmed = description?.trim() ?? "";
  const notesTrimmed = notes?.trim() ?? "";
  const visualIdentityTrimmed = visualIdentity?.trim() ?? "";

  const assetContextText = [descTrimmed, notesTrimmed, visualIdentityTrimmed]
    .filter((v) => v.length > 0)
    .join("\n\n");

  return [
    descTrimmed ? { id: "description", label: "Asset Description", text: descTrimmed } : null,
    notesTrimmed ? { id: "notes", label: "Asset Notes", text: notesTrimmed } : null,
    descTrimmed && notesTrimmed
      ? { id: "desc_notes", label: "Description + Notes", text: `${descTrimmed}\n${notesTrimmed}` }
      : null,
    visualIdentityTrimmed
      ? { id: "visual_identity", label: "Visual Identity", text: visualIdentityTrimmed }
      : null,
    visualIdentityTrimmed && (descTrimmed || notesTrimmed)
      ? { id: "asset_context", label: "Asset Context", text: assetContextText }
      : null,
  ].filter((s): s is FillSource => s !== null);
}
