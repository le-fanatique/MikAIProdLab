import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";

const CHARACTER_RE = /character|person|subject|actor/i;
const ENVIRONMENT_RE = /environment|location|background|scene/i;
const STYLE_RE = /style/i;
const KEYFRAME_RE = /keyframe/i;
const REFERENCE_RE = /reference/i;
const LIGHTING_RE = /lighting|light/i;

export function suggestImageForNode(
  nodeLabel: string,
  availableImages: RuntimeImageOption[]
): string | null {
  if (availableImages.length === 0) return null;
  if (availableImages.length === 1) return availableImages[0].id;

  if (CHARACTER_RE.test(nodeLabel)) {
    const match =
      availableImages.find((img) => img.source === "asset" && img.assetType === "character") ??
      availableImages.find((img) => img.role === "character");
    if (match) return match.id;
  }

  if (ENVIRONMENT_RE.test(nodeLabel)) {
    const match =
      availableImages.find((img) => img.source === "shot" && img.role === "environment") ??
      availableImages.find((img) => img.source === "asset" && img.assetType === "environment") ??
      availableImages.find((img) => img.role === "environment");
    if (match) return match.id;
  }

  if (STYLE_RE.test(nodeLabel)) {
    const match = availableImages.find((img) => img.role === "style");
    if (match) return match.id;
  }

  if (KEYFRAME_RE.test(nodeLabel)) {
    const match = availableImages.find((img) => img.role === "keyframe");
    if (match) return match.id;
  }

  if (REFERENCE_RE.test(nodeLabel)) {
    const match = availableImages.find((img) => img.role === "reference");
    if (match) return match.id;
  }

  if (LIGHTING_RE.test(nodeLabel)) {
    const match = availableImages.find((img) => img.role === "lighting");
    if (match) return match.id;
  }

  return availableImages[0].id;
}
