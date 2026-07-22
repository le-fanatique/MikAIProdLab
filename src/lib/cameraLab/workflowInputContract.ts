// ---------------------------------------------------------------------------
// workflowInputContract.ts — CAMLAB.POLISH.1
//
// Pure, structural validation for the two Camera Lab generation columns:
//   - Column 1 (Generate Gaussian PLY) requires EXACTLY one image node
//     marked `(Input)`.
//   - Column 3 (Gaussian-to-image) requires EXACTLY two image nodes marked
//     `(Input)`, deterministically mapped: input 1 = Gaussian snapshot,
//     input 2 = source image. Recommended titles are
//     "Gaussian Snapshot (Input)" / "Source Image (Input)"; absent/generic
//     titles fall back to structural node order (both are still compatible,
//     since the structure is exactly binary), but a title that recognizably
//     names one role without its exact complement is treated as
//     contradictory and blocks — never a silent guess.
//
// Never infers a role from a workflow's name, id, or class_type — only from
// the `(Input)` marker count/order and, when present, the exact recommended
// label text.
// ---------------------------------------------------------------------------

import type { WorkflowInput, WorkflowInputKind } from "@/lib/comfy/parseWorkflow";

export const GAUSSIAN_SNAPSHOT_LABEL = "Gaussian Snapshot";
export const SOURCE_IMAGE_LABEL = "Source Image";

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
 * nodes, deterministically resolved to snapshot/source roles.
 *
 * `inputs` must be in the workflow's own structural (node id) order — the
 * same order `detectWorkflowInputs`/`parseComfyWorkflow` already produce.
 */
export function resolveGaussianToImageMapping(inputs: WorkflowInput[]): GaussianToImageMappingResult {
  const imageInputs = inputs.filter((i) => i.kind === "image");
  if (imageInputs.length !== 2) {
    return {
      ok: false,
      error: `This workflow has ${imageInputs.length} image node(s) marked "(Input)". Gaussian-to-image requires exactly two.`,
    };
  }

  // CAMLAB.POLISH.1 retake (Codex P1) — structural order is the single
  // source of truth: the FIRST node is always the snapshot role, the SECOND
  // is always the source role. Labels never invert that order — they only
  // ever confirm it (exact match in structural position) or contradict it
  // (anything else recognizable), never re-order it. This is what "premier
  // input deterministe = snapshot, second = source" means literally.
  const [a, b] = imageInputs;
  const aIsSnapshot = a.label === GAUSSIAN_SNAPSHOT_LABEL;
  const aIsSource = a.label === SOURCE_IMAGE_LABEL;
  const bIsSnapshot = b.label === GAUSSIAN_SNAPSHOT_LABEL;
  const bIsSource = b.label === SOURCE_IMAGE_LABEL;

  const anyRecognized = aIsSnapshot || aIsSource || bIsSnapshot || bIsSource;

  if (!anyRecognized) {
    // Absent/generic titles — compatible since the structure is exactly
    // binary. Structural order decides the roles.
    return { ok: true, snapshotNodeId: a.nodeId, sourceNodeId: b.nodeId };
  }

  if (aIsSnapshot && bIsSource) {
    return { ok: true, snapshotNodeId: a.nodeId, sourceNodeId: b.nodeId };
  }

  return {
    ok: false,
    error:
      `Image input titles are contradictory: expected the first "(Input)" node titled ` +
      `"${GAUSSIAN_SNAPSHOT_LABEL} (Input)" and the second titled "${SOURCE_IMAGE_LABEL} (Input)", ` +
      `found "${a.title}" and "${b.title}".`,
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

/**
 * Every `(Input)` node other than the single image node, classified by its
 * real `kind` into the form control it needs. A kind this module doesn't
 * recognize (e.g. `video`, `unknown`) is a hard block — never silently
 * dropped/ignored — so Camera Lab never queues a workflow with an input it
 * cannot actually present to the user.
 */
export function classifyNonImageInputs(inputs: WorkflowInput[]): ClassifyNonImageInputsResult {
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
      error: `Input "${input.label}" (node ${input.nodeId}) has an unsupported kind "${input.kind}". Generate Gaussian PLY cannot proceed until every "(Input)" node on this workflow is a recognized image, text, or scalar kind.`,
    };
  }
  return { ok: true, inputs: classified };
}
