// ---------------------------------------------------------------------------
// buildGenerationPayload.ts — Canonical generation pipeline (GEN.SEEDANCE.1)
//
// The single place that turns "stored workflow + selected panel state" into
// the payload that will actually be queued. Every surface (Shot panel,
// Asset panel, the standalone /map page, and the server action that queues
// generation) calls this instead of re-implementing
// detect -> trace -> expand -> filter -> patch by hand, so the preview shown
// to the user and the payload that gets queued can never structurally
// diverge (they always run the exact same function with the exact same
// inputs).
//
// Pure with respect to the workflow JSON: never mutates the caller's
// `workflowJson` string/object (expandDynamicBatchWorkflow deep-clones,
// patchWorkflowPayload re-parses its own local copy every call).
// ---------------------------------------------------------------------------

import type { WorkflowInput } from "@/lib/comfy/parseWorkflow";
import {
  mapWorkflowInputs,
  type RuntimeImageOption,
  type WorkflowInputMapping,
} from "@/lib/comfy/mapWorkflowInputs";
import {
  detectDynamicBatchInput,
  traceUpstreamTemplateChain,
  expandDynamicBatchWorkflow,
  type DynamicBatchExpansionImage,
  type DynamicBatchExpansionResult,
} from "@/lib/comfy/expandDynamicBatch";
import { patchWorkflowPayload, type WorkflowPayloadPatchResult } from "@/lib/comfy/patchWorkflowPayload";

// ---------------------------------------------------------------------------
// buildGenerationPayload — expand -> filter -> patch
// ---------------------------------------------------------------------------

export type BuildGenerationPayloadParams = {
  /** Raw, immutable `comfy_workflows.workflowJson` — never the mutated/expanded copy. */
  workflowJson: string;
  /** `parseComfyWorkflow(workflowJson).inputs` */
  inputs: WorkflowInput[];
  suggestedText: string;
  availableImages: RuntimeImageOption[];
  textOverrideByNodeId?: Record<string, string>;
  selectedImageByNodeId?: Record<string, string>;
  scalarOverrideByNodeId?: Record<string, string>;
  /** Resolved, in the exact order the Dynamic Batch should clone them. Empty/omitted when the workflow has no Dynamic Batch node, or none are selected yet. */
  batchSelectedImages?: DynamicBatchExpansionImage[];
};

export type BuildGenerationPayloadResult =
  | {
      ok: true;
      /** Every mapped input, unfiltered — for displaying "Suggested Inputs" etc. */
      mappings: WorkflowInputMapping[];
      /** Same as `mappings`, minus the Dynamic Batch template-chain image inputs (already represented by the batch clones, must never be double-patched). */
      displayMappings: WorkflowInputMapping[];
      /** Always the `ok:true` shape — a workflow with no Dynamic Batch node is a valid "unchanged passthrough" expansion, not an error. */
      expansion: Extract<DynamicBatchExpansionResult, { ok: true }>;
      patch: WorkflowPayloadPatchResult;
    }
  | { ok: false; error: string };

export function buildGenerationPayload(
  params: BuildGenerationPayloadParams
): BuildGenerationPayloadResult {
  const mappings = mapWorkflowInputs(
    params.inputs,
    params.suggestedText,
    params.availableImages,
    params.textOverrideByNodeId
  );

  const expansion = expandDynamicBatchWorkflow({
    workflowJson: params.workflowJson,
    selectedImages: params.batchSelectedImages ?? [],
  });

  if (!expansion.ok) {
    return { ok: false, error: expansion.error };
  }

  const displayMappings = mappings.filter((m) => {
    if (m.mappingKind !== "image") return true;
    return !expansion.templateChainNodeIds.includes(m.input.nodeId);
  });

  const patch = patchWorkflowPayload(expansion.workflowJson, displayMappings, {
    selectedImageByNodeId: params.selectedImageByNodeId,
    scalarOverrideByNodeId: params.scalarOverrideByNodeId,
  });

  return { ok: true, mappings, displayMappings, expansion, patch };
}

// ---------------------------------------------------------------------------
// detectDynamicBatchUiInfo — the detect+trace+title-building step shared by
// every surface that renders the Dynamic Batch image list UI. Read-only,
// never touches selections/expansion — just "does this workflow have a
// batch node, and if so what does it look like".
// ---------------------------------------------------------------------------

export type DynamicBatchUiInfo =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      batchNodeId: string;
      templateChainNodeIds: string[];
      batchTitle: string;
      templateChainTitles: string[];
    };

export function detectDynamicBatchUiInfo(workflowJson: string): DynamicBatchUiInfo {
  const detection = detectDynamicBatchInput(workflowJson);
  if (!detection.ok) {
    // null = no batch node in this workflow at all — not an error.
    if (detection.error === null) return { kind: "none" };
    return { kind: "error", message: detection.error };
  }

  let parsedWorkflow: Record<string, { _meta?: { title?: string }; class_type?: string }>;
  try {
    parsedWorkflow = JSON.parse(workflowJson);
  } catch {
    return { kind: "error", message: "Invalid workflow JSON." };
  }

  const trace = traceUpstreamTemplateChain(parsedWorkflow, detection.info);
  if (!trace.ok) return { kind: "error", message: trace.error };

  const templateChainTitles = trace.templateChainNodeIds.map((nid) => {
    const node = parsedWorkflow[nid];
    if (!node) return nid;
    const t = node._meta?.title ?? node.class_type ?? nid;
    return t.replace("(Input)", "").replace("(Dynamic Batch Input)", "").trim();
  });

  return {
    kind: "ready",
    batchNodeId: detection.info.nodeId,
    templateChainNodeIds: trace.templateChainNodeIds,
    batchTitle: detection.info.title.replace("(Dynamic Batch Input)", "").trim(),
    templateChainTitles,
  };
}
