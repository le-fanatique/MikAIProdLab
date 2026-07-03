import type { WorkflowInputMapping, RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { refImageUrl } from "@/lib/refImageUrl";

type Props = {
  basePath: string;
  mappings: WorkflowInputMapping[];
  selectedImageByNodeId: Record<string, string>;
};

function resolvePreviewImage(
  availableImages: RuntimeImageOption[],
  selectedId: string
): RuntimeImageOption | null {
  if (!availableImages.length) return null;
  if (selectedId) {
    const found = availableImages.find((img) => img.id === selectedId);
    if (found) return found;
  }
  return availableImages[0];
}

function buildAutoLabel(availableImages: RuntimeImageOption[]): string {
  if (!availableImages.length) return "No images available";
  const first = availableImages[0];
  const base = `Auto · ${first.label}`;
  return first.role ? `${base} · ${first.role}` : base;
}

function buildOptionLabel(img: RuntimeImageOption): string {
  return img.role ? `${img.label} · ${img.role}` : img.label;
}

type AssetGroup = { label: string; images: RuntimeImageOption[] };

function buildAssetGroups(availableImages: RuntimeImageOption[]): AssetGroup[] {
  const map = new Map<string, AssetGroup>();
  for (const img of availableImages) {
    if (img.source !== "asset") continue;
    const key = img.assetName ? `${img.assetName}__${img.assetType ?? ""}` : "__fallback__";
    if (!map.has(key)) {
      const groupLabel = img.assetName
        ? img.assetType
          ? `${img.assetName} (${img.assetType})`
          : img.assetName
        : "Asset References";
      map.set(key, { label: groupLabel, images: [] });
    }
    map.get(key)!.images.push(img);
  }
  return Array.from(map.values());
}

export default function WorkflowImageSelectionForm({
  basePath,
  mappings,
  selectedImageByNodeId,
}: Props) {
  const imageMappings = mappings.filter((m) => m.mappingKind === "image");
  if (imageMappings.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#6e767d]">
        Choose which reference image should be used for each image input.
      </p>

      <form method="GET" action={basePath}>
        <div className="flex flex-col gap-6">
          {imageMappings.map((mapping) => {
            const nodeId = mapping.input.nodeId;
            const label =
              mapping.input.label || mapping.input.title || `Node ${nodeId}`;
            const selectedId = selectedImageByNodeId[nodeId] ?? "";
            const previewImage = resolvePreviewImage(
              mapping.availableImages,
              selectedId
            );

            const shotImages = mapping.availableImages.filter(
              (img) => img.source === "shot"
            );
            const assetGroups = buildAssetGroups(mapping.availableImages);

            return (
              <div key={nodeId} className="flex flex-col gap-2">
                {/* Input label */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#e7e9ec]">
                    {label}
                  </span>
                  <span className="text-[10px] text-[#4b5158] font-mono">
                    · node {nodeId}
                  </span>
                </div>

                {mapping.availableImages.length === 0 ? (
                  <p className="text-xs text-[#4b5158]">
                    No reference images available.
                  </p>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    {previewImage && (
                      <div className="shrink-0 w-20 rounded border border-[#2c3035] overflow-hidden bg-[#0d0e10]">
                        <img
                          src={refImageUrl(previewImage.imagePath)}
                          alt={previewImage.label}
                          className="w-full aspect-square object-cover"
                        />
                      </div>
                    )}

                    {/* Select */}
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <select
                        name={`imageNode_${nodeId}`}
                        defaultValue={selectedId}
                        className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
                      >
                        <option value="">
                          {buildAutoLabel(mapping.availableImages)}
                        </option>
                        {shotImages.length > 0 && (
                          <optgroup label="Shot References">
                            {shotImages.map((img) => (
                              <option key={img.id} value={img.id}>
                                {buildOptionLabel(img)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {assetGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.images.map((img) => (
                              <option key={img.id} value={img.id}>
                                {buildOptionLabel(img)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {previewImage && (
                        <p className="text-[10px] text-[#4b5158] truncate">
                          {previewImage.source === "shot"
                            ? "Shot reference"
                            : `${previewImage.assetName ?? ""} / ${previewImage.assetType ?? ""}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Update Preview
          </button>
        </div>
      </form>
    </div>
  );
}
