import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import type { WorkflowInputKind } from "@/lib/comfy/parseWorkflow";

export type WorkflowPayloadPatchKind =
  | "text"
  | "image"
  | "integer"
  | "float"
  | "boolean"
  | "select"
  | "seed"
  | "string";

export type PatchWorkflowPayloadOptions = {
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
};

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

const SCALAR_KINDS = new Set<WorkflowInputKind>([
  "integer",
  "float",
  "boolean",
  "select",
  "seed",
  "string",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNodeLabel(mapping: WorkflowInputMapping): string {
  return mapping.input.label || mapping.input.title || `Node ${mapping.input.nodeId}`;
}

// SEQGEN.STORYBOARD.3 — exported so a reader (extractQueuedTextValues in
// src/actions/sequenceGeneration.ts, for job provenance snapshots) can
// reuse this exact write-time rule instead of duplicating a second,
// potentially divergent priority order.
export function findTextInputKey(
  inputs: Record<string, unknown>,
  classType: string
): string | null {
  if (classType === "PrimitiveStringMultiline" && "value" in inputs) return "value";
  if ("text" in inputs) return "text";
  if ("prompt" in inputs) return "prompt";
  if ("string" in inputs) return "string";
  return null;
}

function findScalarInputKey(inputs: Record<string, unknown>): string | null {
  for (const key of ["value", "text", "prompt", "string"] as const) {
    if (key in inputs) return key;
  }
  return null;
}

function coerceScalarValue(
  kind: WorkflowInputKind,
  rawValue: string
): { ok: true; value: string | number | boolean } | { ok: false; reason: string } {
  const value = rawValue.trim();

  if (value === "") {
    if (kind === "string" || kind === "select") return { ok: true, value: "" };
    return { ok: false, reason: `Empty value for ${kind} input — skipped.` };
  }

  if (kind === "integer" || kind === "seed") {
    if (!/^-?\d+$/.test(value)) {
      return { ok: false, reason: "Expected an integer value." };
    }
    return { ok: true, value: Number.parseInt(value, 10) };
  }

  if (kind === "float") {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return { ok: false, reason: "Expected a numeric value." };
    }
    return { ok: true, value: parsed };
  }

  if (kind === "boolean") {
    if (value === "true") return { ok: true, value: true };
    if (value === "false") return { ok: true, value: false };
    return { ok: false, reason: "Expected true or false." };
  }

  if (kind === "select" || kind === "string") {
    return { ok: true, value };
  }

  return { ok: false, reason: "Unsupported scalar input kind." };
}

export function patchWorkflowPayload(
  workflowJsonText: string,
  mappings: WorkflowInputMapping[],
  options: PatchWorkflowPayloadOptions = {}
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

    // Scalar inputs (mappingKind is "unknown" but input.kind is a recognised scalar)
    if (mapping.mappingKind === "unknown" && SCALAR_KINDS.has(mapping.input.kind)) {
      const rawOverride = options.scalarOverrideByNodeId?.[nodeId];
      if (rawOverride === undefined) {
        // No override — keep the original workflow value unchanged
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

      const inputKey = findScalarInputKey(inputs);
      if (inputKey === null) {
        warnings.push(
          `Scalar input '${label}' (node ${nodeId}): no compatible input field found.`
        );
        continue;
      }

      const coerced = coerceScalarValue(mapping.input.kind, rawOverride);
      if (!coerced.ok) {
        warnings.push(`Scalar input '${label}' (node ${nodeId}): ${coerced.reason}`);
        continue;
      }

      const previousValue = inputs[inputKey];
      inputs[inputKey] = coerced.value;

      patches.push({
        nodeId,
        label,
        kind: mapping.input.kind as WorkflowPayloadPatchKind,
        inputKey,
        previousValue,
        nextValue: coerced.value,
      });

      continue;
    }

    // Truly unknown — skip
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

      const requestedImageId = options.selectedImageByNodeId?.[nodeId];
      let selectedImage = mapping.availableImages[0];
      let explicitSelection = false;

      if (requestedImageId) {
        const found = mapping.availableImages.find((img) => img.id === requestedImageId);
        if (found) {
          selectedImage = found;
          explicitSelection = true;
        } else {
          warnings.push(
            `Selected image '${requestedImageId}' not found for image input '${label}' (node ${nodeId}). Using first available image.`
          );
        }
      }

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
        explicitSelection
          ? `Image '${selectedImage.label}' selected for preview on node ${nodeId}. Upload to the ComfyUI input folder before running.`
          : `Image '${selectedImage.label}' used for preview on node ${nodeId} (first available). Upload to the ComfyUI input folder before running.`
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
