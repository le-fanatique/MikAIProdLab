import type { WorkflowInputMapping, RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import { refImageUrl } from "@/lib/refImageUrl";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";

type Props = {
  basePath: string;
  mappings: WorkflowInputMapping[];
  selectedImageByNodeId: Record<string, string>;
  // SEQGEN.STORYBOARD.2 (retake 3) — extra params (storyboard=1,
  // storyboardRefs) that must survive this GET form's submit even though
  // they aren't imageNode_* fields. Reuses the same hidden-field passthrough
  // pattern already used elsewhere; no new query-param mechanism.
  preserveParams?: Record<string, string>;
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
  const roleLabel = getReferenceImageRoleLabel(first.role);
  return roleLabel ? `${base} · ${roleLabel}` : base;
}

function buildOptionLabel(img: RuntimeImageOption): string {
  const roleLabel = getReferenceImageRoleLabel(img.role);
  const withRole = roleLabel ? `${img.label} · ${roleLabel}` : img.label;
  const withVariant = img.variantState ? `${withRole} · ${img.variantState}` : withRole;
  // ASSET.BIBLE.2 — a native <select><option> can't hold a real badge, so
  // the "not approved" warning has to be plain text here too. Only ever
  // shown for asset-sourced images (approved is undefined for shot images).
  return img.approved === false ? `${withVariant} (Not approved)` : withVariant;
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
  preserveParams,
}: Props) {
  const imageMappings = mappings.filter((m) => m.mappingKind === "image");
  if (imageMappings.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[#6e767d]">
        Choose which reference image should be used for each image input.
      </p>

      <form method="GET" action={basePath}>
        {preserveParams &&
          Object.entries(preserveParams).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
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
                      {/* ASSET.BIBLE.2 — clear, un-ambiguous status for the
                          previewed candidate: readable without opening the
                          select, and an unapproved image is never silently
                          treated as approved just because it's the current
                          preview/suggestion. */}
                      {previewImage && previewImage.source === "asset" && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getReferenceImageRoleLabel(previewImage.role) && (
                            <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                              {getReferenceImageRoleLabel(previewImage.role)}
                            </span>
                          )}
                          {previewImage.variantState && (
                            <span className="inline-flex items-center rounded border border-[#3a4046] px-1.5 py-0.5 text-[10px] font-medium text-[#6e767d]">
                              {previewImage.variantState}
                            </span>
                          )}
                          {previewImage.approved === false ? (
                            <span className="inline-flex items-center rounded border border-[#cda24f]/40 bg-[#cda24f]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cda24f]">
                              Not approved
                            </span>
                          ) : previewImage.approved === true ? (
                            <span className="inline-flex items-center rounded border border-[#6b9e72]/40 bg-[#6b9e72]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#6b9e72]">
                              Approved
                            </span>
                          ) : null}
                        </div>
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
