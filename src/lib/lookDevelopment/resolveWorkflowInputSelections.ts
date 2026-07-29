// ---------------------------------------------------------------------------
// resolveWorkflowInputSelections.ts — STYLE.1.G.CORE.1 Round 3 (Finding 1)
//
// Pure (no DB/network). Turns a caller-supplied `LookWorkflowInputSelections`
// plus the parsed workflow and resolved references into the exact
// `selectedImageByNodeId` / `batchSelectedImages` / `textOverrideByNodeId` /
// `scalarOverrideByNodeId` shape that `buildGenerationPayload` (the ONE
// canonical patcher) already accepts — never a second patcher, never a
// second expansion pass.
//
// Every node id is validated against the real parsed workflow inputs before
// anything is used. Every selected reference (the caller's resolved
// `references` list) must be reachable through EXACTLY one path — an
// ordinary image assignment, or the Dynamic Batch / direct-repeatable
// ordered list — or the whole request is refused. Nothing is silently
// dropped.
// ---------------------------------------------------------------------------

import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";
import type { DynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import type { DynamicBatchExpansionImage } from "@/lib/comfy/expandDynamicBatch";
import type { WorkflowPayloadPatch } from "@/lib/comfy/patchWorkflowPayload";
import type { ResolvedLookReference } from "./resolveLookReferences";
import type { LookWorkflowInputSelections } from "./contracts";

const SCALAR_KINDS = new Set(["integer", "float", "boolean", "select", "seed", "string"]);

export type ResolvedWorkflowInputSelections = {
  selectedImageByNodeId: Record<string, string>;
  batchSelectedImages: DynamicBatchExpansionImage[];
  textOverrideByNodeId: Record<string, string>;
  scalarOverrideByNodeId: Record<string, string>;
};

export type ResolveWorkflowInputSelectionsResult =
  | { ok: true; result: ResolvedWorkflowInputSelections }
  | { ok: false; error: string };

/** Same `id` convention `runLookTestGenerationCore`/`runExistingLookTestCore` already use to build `RuntimeImageOption[]`. */
function refRuntimeId(referenceId: number): string {
  return `look-ref-${referenceId}`;
}

export function resolveLookWorkflowInputSelections(args: {
  inputs: WorkflowInput[];
  batchInfo: DynamicBatchUiInfo;
  references: ResolvedLookReference[];
  selections: LookWorkflowInputSelections;
}): ResolveWorkflowInputSelectionsResult {
  const { inputs, batchInfo, references, selections } = args;

  const referenceById = new Map(references.map((r) => [r.id, r]));
  const imageNodeIds = new Set(inputs.filter((i) => i.kind === "image").map((i) => i.nodeId));
  const textNodeIds = new Set(inputs.filter((i) => i.kind === "text").map((i) => i.nodeId));
  const scalarNodeIds = new Set(inputs.filter((i) => SCALAR_KINDS.has(i.kind)).map((i) => i.nodeId));

  const templateChainNodeIds = new Set(batchInfo.kind === "ready" ? batchInfo.templateChainNodeIds : []);
  const mappedReferenceIds = new Set<number>();

  // --- Ordinary image assignments ---
  const imageAssignments = selections.imageAssignments ?? [];
  const selectedImageByNodeId: Record<string, string> = {};
  const seenImageNodeIds = new Set<string>();
  for (const assignment of imageAssignments) {
    if (!imageNodeIds.has(assignment.nodeId)) {
      return { ok: false, error: `Image assignment refers to node "${assignment.nodeId}", which is not an image input of this workflow.` };
    }
    if (templateChainNodeIds.has(assignment.nodeId)) {
      return {
        ok: false,
        error: `Node "${assignment.nodeId}" is part of this workflow's Dynamic Batch template chain — assign references to it through dynamicBatchReferenceIds, not imageAssignments.`,
      };
    }
    if (seenImageNodeIds.has(assignment.nodeId)) {
      return { ok: false, error: `Node "${assignment.nodeId}" was assigned more than once.` };
    }
    seenImageNodeIds.add(assignment.nodeId);
    const ref = referenceById.get(assignment.referenceId);
    if (!ref) {
      return { ok: false, error: `Image assignment refers to reference ${assignment.referenceId}, which is not part of this test's resolved references.` };
    }
    selectedImageByNodeId[assignment.nodeId] = refRuntimeId(ref.id);
    mappedReferenceIds.add(ref.id);
  }

  // --- Dynamic Batch / direct-repeatable ordered selection ---
  const dynamicBatchReferenceIds = selections.dynamicBatchReferenceIds ?? [];
  if (dynamicBatchReferenceIds.length > 0 && batchInfo.kind !== "ready") {
    return { ok: false, error: "dynamicBatchReferenceIds was provided, but this workflow has no Dynamic Batch or direct-repeatable input node." };
  }
  const batchSelectedImages: DynamicBatchExpansionImage[] = [];
  const seenBatchRefIds = new Set<number>();
  for (const referenceId of dynamicBatchReferenceIds) {
    const ref = referenceById.get(referenceId);
    if (!ref) {
      return { ok: false, error: `dynamicBatchReferenceIds refers to reference ${referenceId}, which is not part of this test's resolved references.` };
    }
    if (seenBatchRefIds.has(referenceId)) {
      return { ok: false, error: `Reference ${referenceId} was listed more than once in dynamicBatchReferenceIds.` };
    }
    seenBatchRefIds.add(referenceId);
    batchSelectedImages.push({ id: refRuntimeId(ref.id), imagePath: ref.imagePath });
    mappedReferenceIds.add(ref.id);
  }

  // --- Every selected reference must be mapped somewhere — never silently dropped ---
  for (const ref of references) {
    if (!mappedReferenceIds.has(ref.id)) {
      return {
        ok: false,
        error: `Reference ${ref.id} ("${ref.label ?? "untitled"}") is selected for this test but is not mapped to any workflow input (imageAssignments or dynamicBatchReferenceIds) — refusing rather than silently dropping it.`,
      };
    }
  }

  // --- Text overrides ---
  const textOverrideByNodeId: Record<string, string> = {};
  for (const [nodeId, text] of Object.entries(selections.textOverrideByNodeId ?? {})) {
    if (!textNodeIds.has(nodeId)) {
      return { ok: false, error: `Text override refers to node "${nodeId}", which is not a text input of this workflow.` };
    }
    textOverrideByNodeId[nodeId] = text;
  }

  // --- Scalar / select / seed overrides ---
  const scalarOverrideByNodeId: Record<string, string> = {};
  for (const [nodeId, val] of Object.entries(selections.scalarOverrideByNodeId ?? {})) {
    if (!scalarNodeIds.has(nodeId)) {
      return { ok: false, error: `Scalar override refers to node "${nodeId}", which is not a scalar/select/seed input of this workflow.` };
    }
    scalarOverrideByNodeId[nodeId] = val;
  }

  return {
    ok: true,
    result: { selectedImageByNodeId, batchSelectedImages, textOverrideByNodeId, scalarOverrideByNodeId },
  };
}

const SCALAR_PATCH_KINDS = new Set(["integer", "float", "boolean", "select", "seed", "string"]);

/**
 * STYLE.1.G.CORE.1 Round 4 (Finding 3) — `patchWorkflowPayload` (the one
 * canonical patcher, reused as-is) silently SKIPS an override it cannot
 * apply (wrong type, missing input field, etc.) and only records a
 * free-text warning — it never fails the whole build. That is the right
 * behavior for the Advanced Payload Editor / regular generation surfaces,
 * but for Look Development every override is an EXPLICIT caller request:
 * silently ignoring it (as the two runners did before this fix) means the
 * Look Test is created, the job is queued, and the snapshot records an
 * override that was never actually applied to the payload — an honest
 * provenance violation. This checks, after a successful
 * `buildGenerationPayload` call, that every requested override node
 * produced a real patch of the matching kind; any explicit override that
 * did not is refused BEFORE any Look Test/job row is created. Normal
 * informational warnings unrelated to an explicit override (e.g. the
 * "upload to the ComfyUI input folder" image note) are never rejected.
 */
export function verifyLookWorkflowOverridesApplied(args: {
  patches: WorkflowPayloadPatch[];
  textOverrideByNodeId: Record<string, string>;
  scalarOverrideByNodeId: Record<string, string>;
}): { ok: true } | { ok: false; error: string } {
  for (const nodeId of Object.keys(args.textOverrideByNodeId)) {
    const applied = args.patches.some((p) => p.nodeId === nodeId && p.kind === "text");
    if (!applied) {
      return { ok: false, error: `The explicit text override for node "${nodeId}" could not be applied to this workflow — refusing rather than silently ignoring it.` };
    }
  }
  for (const nodeId of Object.keys(args.scalarOverrideByNodeId)) {
    const applied = args.patches.some((p) => p.nodeId === nodeId && SCALAR_PATCH_KINDS.has(p.kind));
    if (!applied) {
      return { ok: false, error: `The explicit scalar/select/seed override for node "${nodeId}" could not be applied to this workflow — refusing rather than silently ignoring it.` };
    }
  }
  return { ok: true };
}
