import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";

// SEQGEN.VIDEO.1 — "board" is the mandatory Sequence Storyboard visual
// anchor for a Sequence Video generation; distinct from "asset"/"shot" so
// callers that group/filter by source (Dynamic Batch image lists, casting
// grids) never mistake it for a casting reference. Additive: every existing
// `source === "shot" | "asset"` check still narrows correctly.
export type RuntimeImageSource = "shot" | "asset" | "board";

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

// SHOT.VIDEO.LIBRARY.1, Lot C — a video eligible as a ComfyUI workflow
// input. Deliberately a separate type from `RuntimeImageOption`: a video
// must never be offered to an image input or vice versa (see
// `mapWorkflowInputs`'s own kind-gated branches below). Scoped to the
// current Shot's own durable library only — never cross-Shot.
export type RuntimeVideoSource = "generation" | "sequence_split";

export type RuntimeVideoOption = {
  shotVideoId: number;
  videoPath: string;
  label: string;
  source: RuntimeVideoSource;
  durationSeconds: number | null;
  isApproved: boolean;
};

export type WorkflowInputMappingKind = "text" | "image" | "video" | "unknown";

export type WorkflowInputMapping = {
  input: WorkflowInput;
  mappingKind: WorkflowInputMappingKind;
  suggestedText: string | null;
  availableImages: RuntimeImageOption[];
  availableVideos: RuntimeVideoOption[];
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

export type RuntimeShotVideo = {
  id: number;
  videoPath: string;
  source: RuntimeVideoSource;
  durationSeconds: number | null;
  isApproved: boolean;
  /** e.g. "Split Run #12 · Segment #3" or "Generation Content" — precomputed server-side, same convention as `ShotVideoLibraryRow`'s own provenance label. */
  provenanceLabel: string;
};

/** SHOT.VIDEO.LIBRARY.1, Lot C — mirrors `buildRuntimeImageOptions`, scoped to one Shot's own durable video library only (never cross-Shot, never Asset/board videos — there are none). */
export function buildRuntimeVideoOptions(shotVideos: RuntimeShotVideo[]): RuntimeVideoOption[] {
  return shotVideos.map((v) => ({
    shotVideoId: v.id,
    videoPath: v.videoPath,
    label: v.provenanceLabel,
    source: v.source,
    durationSeconds: v.durationSeconds,
    isApproved: v.isApproved,
  }));
}

export function mapWorkflowInputs(
  inputs: WorkflowInput[],
  suggestedText: string,
  availableImages: RuntimeImageOption[],
  textOverrideByNodeId?: Record<string, string>,
  /** SHOT.VIDEO.LIBRARY.1, Lot C — additive, defaults to none so every existing caller (none of which has a video-input workflow to feed) keeps working unchanged. */
  availableVideos: RuntimeVideoOption[] = []
): WorkflowInputMapping[] {
  return inputs.map((input): WorkflowInputMapping => {
    if (input.kind === "text") {
      const effectiveText = textOverrideByNodeId?.[input.nodeId] ?? suggestedText;
      return {
        input,
        mappingKind: "text",
        suggestedText: effectiveText,
        availableImages: [],
        availableVideos: [],
      };
    }
    if (input.kind === "image") {
      return {
        input,
        mappingKind: "image",
        suggestedText: null,
        availableImages,
        availableVideos: [],
      };
    }
    if (input.kind === "video") {
      return {
        input,
        mappingKind: "video",
        suggestedText: null,
        availableImages: [],
        availableVideos,
      };
    }
    return {
      input,
      mappingKind: "unknown",
      suggestedText: null,
      availableImages: [],
      availableVideos: [],
    };
  });
}
