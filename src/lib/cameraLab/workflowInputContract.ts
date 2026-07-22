// ---------------------------------------------------------------------------
// workflowInputContract.ts — CAMLAB.POLISH.1 / CAMLAB.POLISH.2
//
// Pure, structural validation for the two Camera Lab generation columns:
//   - Column 1 (Generate Gaussian PLY) requires EXACTLY one image node
//     marked `(Input)`.
//   - Column 3 (Gaussian-to-image) requires EXACTLY two image nodes marked
//     `(Input)`, deterministically mapped by their EXACT label, never by
//     JSON/node order: the node titled "Load Image Gaussian (Input)" always
//     receives the Column 2 snapshot; the node titled "Load Image (Input)"
//     always receives the Column 1 source image. Reordering the two nodes
//     in the workflow's stored JSON must never change this mapping.
//
// Never infers a role from a workflow's name, id, class_type, or node
// order — only from the exact `(Input)`-stripped label text. A missing,
// duplicated, or unrecognized label (including the CAMLAB.POLISH.1 recommended
// labels "Gaussian Snapshot (Input)" / "Source Image (Input)", which this
// ticket retires) blocks with an explicit diagnostic — never a silent guess.
// ---------------------------------------------------------------------------

import type { WorkflowInput, WorkflowInputKind } from "@/lib/comfy/parseWorkflow";

export const LOAD_IMAGE_GAUSSIAN_LABEL = "Load Image Gaussian";
export const LOAD_IMAGE_LABEL = "Load Image";

export type SingleImageInputResult =
  | { ok: true; nodeId: string; input: WorkflowInput }
  | { ok: false; error: string };

/** Column 1 gate: the workflow must expose exactly one `(Input)` image node. */
export function requireSingleImageInput(inputs: WorkflowInput[]): SingleImageInputResult {
  const imageInputs = inputs.filter((i) => i.kind === "image");
  if (imageInputs.length === 0) {
    return {
      ok: false,
      error: "This workflow has no image node marked \"(Input)\". Generate Gaussian PLY requires exactly one.",
    };
  }
  if (imageInputs.length > 1) {
    return {
      ok: false,
      error: `This workflow has ${imageInputs.length} image nodes marked "(Input)". Generate Gaussian PLY requires exactly one.`,
    };
  }
  return { ok: true, nodeId: imageInputs[0].nodeId, input: imageInputs[0] };
}

export type GaussianToImageMappingResult =
  | { ok: true; snapshotNodeId: string; sourceNodeId: string }
  | { ok: false; error: string };

/**
 * Column 3 gate: the workflow must expose exactly two `(Input)` image
 * nodes, deterministically resolved to snapshot/source roles by their EXACT
 * label — never by JSON/node order. `inputs` may be given in any order;
 * the result never depends on it.
 */
export function resolveGaussianToImageMapping(inputs: WorkflowInput[]): GaussianToImageMappingResult {
  const imageInputs = inputs.filter((i) => i.kind === "image");
  if (imageInputs.length !== 2) {
    return {
      ok: false,
      error: `This workflow has ${imageInputs.length} image node(s) marked "(Input)". Gaussian-to-image requires exactly two.`,
    };
  }

  // CAMLAB.POLISH.2 — label is the single source of truth, order is
  // irrelevant. Exactly one node must be titled "Load Image Gaussian
  // (Input)" and exactly one "Load Image (Input)"; anything else (missing,
  // duplicated, generic, or the retired CAMLAB.POLISH.1 recommended labels)
  // blocks with a diagnostic naming both the expected and found labels.
  const gaussianMatches = imageInputs.filter((i) => i.label === LOAD_IMAGE_GAUSSIAN_LABEL);
  const sourceMatches = imageInputs.filter((i) => i.label === LOAD_IMAGE_LABEL);

  if (gaussianMatches.length === 1 && sourceMatches.length === 1) {
    return { ok: true, snapshotNodeId: gaussianMatches[0].nodeId, sourceNodeId: sourceMatches[0].nodeId };
  }

  const foundLabels = imageInputs.map((i) => `"${i.title}"`).join(" and ");
  return {
    ok: false,
    error:
      `Image input titles must be exactly one "${LOAD_IMAGE_GAUSSIAN_LABEL} (Input)" and one ` +
      `"${LOAD_IMAGE_LABEL} (Input)", regardless of their order in the workflow. Found ${foundLabels}.`,
  };
}

// ---------------------------------------------------------------------------
// Column 1 retake round 2 — non-image `(Input)` nodes
// ---------------------------------------------------------------------------

export type NonImageInputFormKind = "text" | "scalar";

export type ClassifiedNonImageInput = {
  input: WorkflowInput;
  formKind: NonImageInputFormKind;
};

const TEXT_FORM_KINDS = new Set<WorkflowInputKind>(["text", "string"]);
const SCALAR_FORM_KINDS = new Set<WorkflowInputKind>(["integer", "float", "boolean", "select", "seed"]);

export type ClassifyNonImageInputsResult =
  | { ok: true; inputs: ClassifiedNonImageInput[] }
  | { ok: false; error: string };

/** CAMLAB.POLISH.2 retake (Codex P2) — which caller's action name to name in the unsupported-kind diagnostic. Defaults to Column 1's original wording so its exact existing message is preserved unchanged. */
export type NonImageInputsCallerContext = "Generate Gaussian PLY" | "Gaussian-to-image";

/**
 * Every `(Input)` node other than the single image node, classified by its
 * real `kind` into the form control it needs. A kind this module doesn't
 * recognize (e.g. `video`, `unknown`) is a hard block — never silently
 * dropped/ignored — so Camera Lab never queues a workflow with an input it
 * cannot actually present to the user.
 */
export function classifyNonImageInputs(
  inputs: WorkflowInput[],
  callerContext: NonImageInputsCallerContext = "Generate Gaussian PLY"
): ClassifyNonImageInputsResult {
  const classified: ClassifiedNonImageInput[] = [];
  for (const input of inputs) {
    if (input.kind === "image") continue;
    if (TEXT_FORM_KINDS.has(input.kind)) {
      classified.push({ input, formKind: "text" });
      continue;
    }
    if (SCALAR_FORM_KINDS.has(input.kind)) {
      classified.push({ input, formKind: "scalar" });
      continue;
    }
    return {
      ok: false,
      error: `Input "${input.label}" (node ${input.nodeId}) has an unsupported kind "${input.kind}". ${callerContext} cannot proceed until every "(Input)" node on this workflow is a recognized image, text, or scalar kind.`,
    };
  }
  return { ok: true, inputs: classified };
}
