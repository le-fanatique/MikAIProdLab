import Card from "@/components/Card";
import RegionCropBox from "@/components/storyboardExtraction/RegionCropBox";
import { refImageUrl } from "@/lib/refImageUrl";
import { getRegionColor } from "@/lib/storyboardExtraction/regionColors";
import type { sequenceStoryboardExtractionRegions } from "@/db/schema";

type Region = typeof sequenceStoryboardExtractionRegions.$inferSelect;

type Props = {
  sourceImagePath: string;
  sourceWidth: number;
  sourceHeight: number;
  regions: Region[];
  isEditable: boolean;
};

/** Preview card — source image with draggable/resizable region overlays (IND.CLIENTSPLIT.1, moved verbatim from extract/page.tsx). */
export default function RegionsPreview({ sourceImagePath, sourceWidth, sourceHeight, regions, isEditable }: Props) {
  return (
    <Card>
      <p className="text-[10px] text-[#4b5158] mb-2">
        Drag a region to move it, or drag a corner handle to resize — the numeric fields below update live.
        Click <span className="text-[#a4abb2]">Update</span> to save.
      </p>
      <div
        data-crop-container
        className="relative w-full max-w-3xl"
        style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={refImageUrl(sourceImagePath)}
          alt="Storyboard source"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />
        {regions.map((r, i) => (
          <RegionCropBox
            key={r.id}
            regionId={r.id}
            index={i}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            status={r.status}
            detectionMode={r.detectionMode}
            confidence={r.confidence}
            editable={isEditable && r.status !== "extracted"}
            color={getRegionColor(r.orderIndex)}
            lockRatioFieldId={`region-${r.id}-lock-ratio`}
            ratioSelectId="content-crop-ratio"
          />
        ))}
      </div>
    </Card>
  );
}
