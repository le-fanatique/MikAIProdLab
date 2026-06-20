import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";

export type WorkflowPayloadPatchKind = "text" | "image";

export type WorkflowPayloadPatch = {
  nodeId: string;
  label: string;
  kind: WorkflowPayloadPatchKind;
  inputKey: string;
  previousValue: unknown;
  nextValue: unknown;
};

export type WorkflowPayloadPatchResult = {
  patchedJson: Record<string, unknown>;
  patchedJsonText: string;
  patches: WorkflowPayloadPatch[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNodeLabel(mapping: WorkflowInputMapping): string {
  return mapping.input.label || mapping.input.title || `Node ${mapping.input.nodeId}`;
}

function findTextInputKey(
  inputs: Record<string, unknown>,
  classType: string
): string | null {
  if (classType === "PrimitiveStringMultiline" && "value" in inputs) return "value";
  if ("text" in inputs) return "text";
  if ("prompt" in inputs) return "prompt";
  if ("string" in inputs) return "string";
  return null;
}

export function patchWorkflowPayload(
  workflowJsonText: string,
  mappings: WorkflowInputMapping[]
): WorkflowPayloadPatchResult {
  const warnings: string[] = [];
  const patches: WorkflowPayloadPatch[] = [];

  let patchedJson: Record<string, unknown>;
  try {
    const parsed = JSON.parse(workflowJsonText) as unknown;
    if (!isRecord(parsed)) {
      return {
        patchedJson: {},
        patchedJsonText: "",
        patches: [],
        warnings: ["Workflow JSON could not be parsed."],
      };
    }
    patchedJson = parsed;
  } catch {
    return {
      patchedJson: {},
      patchedJsonText: "",
      patches: [],
      warnings: ["Workflow JSON could not be parsed."],
    };
  }

  let hasImagePatch = false;

  for (const mapping of mappings) {
    const { nodeId } = mapping.input;
    const label = getNodeLabel(mapping);

    if (mapping.mappingKind === "unknown") {
      continue;
    }

    const node = patchedJson[nodeId];
    if (!isRecord(node)) {
      warnings.push(`Node ${nodeId} not found in workflow JSON.`);
      continue;
    }

    const inputs = node["inputs"];
    if (!isRecord(inputs)) {
      warnings.push(`Node ${nodeId} has no inputs field.`);
      continue;
    }

    if (mapping.mappingKind === "text") {
      const inputKey = findTextInputKey(inputs, mapping.input.classType);
      if (inputKey === null) {
        warnings.push(
          `Text input '${label}' (node ${nodeId}): no compatible input field found.`
        );
        continue;
      }

      const previousValue = inputs[inputKey];
      const nextValue = mapping.suggestedText ?? "";
      inputs[inputKey] = nextValue;

      patches.push({ nodeId, label, kind: "text", inputKey, previousValue, nextValue });
    }

    if (mapping.mappingKind === "image") {
      if (!("image" in inputs)) {
        warnings.push(
          `Image input '${label}' (node ${nodeId}): no compatible image field found.`
        );
        continue;
      }

      if (mapping.availableImages.length === 0) {
        warnings.push(
          `Image input '${label}' (node ${nodeId}): no reference images available for this shot.`
        );
        continue;
      }

      const selectedImage = mapping.availableImages[0];
      const previousValue = inputs["image"];
      const nextValue = selectedImage.imagePath;
      inputs["image"] = nextValue;
      hasImagePatch = true;

      patches.push({
        nodeId,
        label,
        kind: "image",
        inputKey: "image",
        previousValue,
        nextValue,
      });

      warnings.push(
        `Image '${selectedImage.label}' used for preview on node ${nodeId} (first available). Upload to the ComfyUI input folder before running.`
      );
    }
  }

  if (hasImagePatch) {
    warnings.push(
      "Image paths in this preview are local app paths. They must be copied or uploaded to the ComfyUI input folder before running this workflow."
    );
  }

  const patchedJsonText = JSON.stringify(patchedJson, null, 2);

  return { patchedJson, patchedJsonText, patches, warnings };
}
