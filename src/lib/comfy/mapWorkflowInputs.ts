import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";

export type RuntimeImageSource = "shot" | "asset";

export type RuntimeImageOption = {
  id: string;
  source: RuntimeImageSource;
  imagePath: string;
  label: string;
  role: string | null;
  assetName?: string;
  assetType?: string;
  // ASSET.BIBLE.2 — only ever set for source === "asset" (shot reference
  // images have no variant/approval columns); undefined, not false/null,
  // when not applicable, so callers can distinguish "not an asset image"
  // from "an asset image not yet approved".
  variantState?: string | null;
  approved?: boolean;
};

export type RuntimeShotReferenceImage = {
  id: number;
  imagePath: string;
  label: string | null;
  imageRole: string | null;
  sourceFilename: string | null;
};

export type RuntimeAssetReferenceImage = {
  id: number;
  assetId: number;
  imagePath: string;
  label: string | null;
  imageRole: string | null;
  sourceFilename: string | null;
  // ASSET.BIBLE.2
  variantState: string | null;
  approvedForGeneration: boolean;
};

export type RuntimeAssignedAsset = {
  assetId: number;
  assetName: string;
  assetType: string;
};

export type WorkflowInputMappingKind = "text" | "image" | "unknown";

export type WorkflowInputMapping = {
  input: WorkflowInput;
  mappingKind: WorkflowInputMappingKind;
  suggestedText: string | null;
  availableImages: RuntimeImageOption[];
};

export function getRuntimeImageLabel(input: {
  label: string | null;
  sourceFilename: string | null;
  imageRole: string | null;
}): string {
  const label = input.label?.trim();
  if (label) return label;
  const filename = input.sourceFilename?.trim();
  if (filename) return filename;
  const role = input.imageRole?.trim();
  if (role) return role;
  return "Image";
}

export function buildRuntimeImageOptions(
  shotRefImages: RuntimeShotReferenceImage[],
  castAssetRefImages: RuntimeAssetReferenceImage[],
  assignedAssets: RuntimeAssignedAsset[]
): RuntimeImageOption[] {
  const options: RuntimeImageOption[] = [];

  for (const image of shotRefImages) {
    options.push({
      id: `shot-${image.id}`,
      source: "shot",
      imagePath: image.imagePath,
      label: getRuntimeImageLabel(image),
      role: image.imageRole,
    });
  }

  for (const image of castAssetRefImages) {
    const assigned = assignedAssets.find((a) => a.assetId === image.assetId);
    if (!assigned) continue;
    options.push({
      id: `asset-${image.assetId}-${image.id}`,
      source: "asset",
      imagePath: image.imagePath,
      label: getRuntimeImageLabel(image),
      role: image.imageRole,
      assetName: assigned.assetName,
      assetType: assigned.assetType,
      variantState: image.variantState,
      approved: image.approvedForGeneration,
    });
  }

  return options;
}

export function mapWorkflowInputs(
  inputs: WorkflowInput[],
  suggestedText: string,
  availableImages: RuntimeImageOption[],
  textOverrideByNodeId?: Record<string, string>
): WorkflowInputMapping[] {
  return inputs.map((input): WorkflowInputMapping => {
    if (input.kind === "text") {
      const effectiveText = textOverrideByNodeId?.[input.nodeId] ?? suggestedText;
      return {
        input,
        mappingKind: "text",
        suggestedText: effectiveText,
        availableImages: [],
      };
    }
    if (input.kind === "image") {
      return {
        input,
        mappingKind: "image",
        suggestedText: null,
        availableImages,
      };
    }
    return {
      input,
      mappingKind: "unknown",
      suggestedText: null,
      availableImages: [],
    };
  });
}
