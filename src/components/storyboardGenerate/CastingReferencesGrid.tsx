// ---------------------------------------------------------------------------
// CastingReferencesGrid — IND.CLIENTSPLIT.2
//
// The `@ImageN` casting grid, lifted out of the Sequence Storyboard generate
// page. Presentation only: it receives already-resolved mappings and images,
// and renders them. No state, no effect, no data access — the page keeps all
// of that, which is what makes this move provable by `tsc` alone in a
// repository with no DOM test harness.
// ---------------------------------------------------------------------------

import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";

type ImageMapping = {
  refId: string;
  imageLabel: string;
  assetName: string;
  assetType: string | null;
  roleLabel: string | null;
  approvedForGeneration: boolean | null;
};

type AvailableImage = { id: string; imagePath: string };

type Props = {
  imageMappings: ImageMapping[];
  availableImages: AvailableImage[];
  emptyMessage: string;
  /** The page owns URL building — it is the only thing here that is not a plain value. */
  refImageUrl: (imagePath: string) => string;
};

export default function CastingReferencesGrid({
  imageMappings,
  availableImages,
  emptyMessage,
  refImageUrl,
}: Props) {
  if (imageMappings.length === 0) {
    return <p className="text-xs text-[#b89a5a]">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {imageMappings.map((m) => {
        const img = availableImages.find((i) => i.id === m.refId);
        return (
          <div key={m.refId} className="flex flex-col gap-1 rounded border border-[#232629] p-1.5">
            {img && (
              <div className="relative aspect-square w-full bg-[#0d0e10] overflow-hidden rounded">
                <ThumbnailHoverPreview src={refImageUrl(img.imagePath)} alt={m.assetName} focusable>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refImageUrl(img.imagePath)} alt={m.assetName} className="w-full h-full object-cover" />
                </ThumbnailHoverPreview>
              </div>
            )}
            <span className="text-[10px] font-mono text-[#5b93d6]">{m.imageLabel}</span>
            <span className="text-xs text-[#a4abb2] truncate">{m.assetName}</span>
            <span className="text-[10px] text-[#4b5158] truncate">
              {m.assetType}
              {m.roleLabel ? ` · ${m.roleLabel}` : ""}
            </span>
            {!m.approvedForGeneration && (
              <span className="text-[9px] uppercase tracking-wider text-[#cda24f]">Not approved</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
