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
import {
  detectDirectRepeatableInput,
  expandDirectRepeatableInputsWorkflow,
} from "@/lib/comfy/expandDirectRepeatableInputs";
import { patchWorkflowPayload, type WorkflowPayloadPatchResult } from "@/lib/comfy/patchWorkflowPayload";

// ---------------------------------------------------------------------------
// resolveImageExpansionMode — SEQGEN.STORYBOARD.3-FIX2
//
// Single decision point shared by buildGenerationPayload (which expand
// function to call) and detectDynamicBatchUiInfo (what the picker UI should
// show), so the two can never disagree about which mode a workflow uses.
// Priority: an explicit `(Dynamic Batch Input)` marker always wins (existing
// workflows keep their exact current behavior, unchanged) — direct
// repeatable inputs are only considered when no such marker exists, and are
// themselves purely structural (numbered `model.images.image_N` ports on an
// OpenAIGPTImageNodeV2 node, never the workflow's name or id).
// ---------------------------------------------------------------------------

type ImageExpansionMode =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | {
      kind: "dynamic-batch" | "direct-repeatable-inputs";
      nodeId: string;
      title: string;
      templateChainNodeIds: string[];
      templateChainTitles: string[];
    };

function buildChainTitles(
  workflow: Record<string, { _meta?: { title?: string }; class_type?: string }>,
  nodeIds: string[]
): string[] {
  return nodeIds.map((nid) => {
    const node = workflow[nid];
    if (!node) return nid;
    const t = node._meta?.title ?? node.class_type ?? nid;
    return t.replace("(Input)", "").replace("(Dynamic Batch Input)", "").replace("(Repeatable)", "").trim();
  });
}

function resolveImageExpansionMode(workflowJson: string): ImageExpansionMode {
  let parsedWorkflow: Record<string, { _meta?: { title?: string }; class_type?: string }>;
  try {
    parsedWorkflow = JSON.parse(workflowJson);
  } catch {
    return { kind: "error", error: "Invalid workflow JSON." };
  }

  const batchDetection = detectDynamicBatchInput(workflowJson);
  if (batchDetection.ok) {
    const trace = traceUpstreamTemplateChain(parsedWorkflow, batchDetection.info);
    if (!trace.ok) return { kind: "error", error: trace.error };
    return {
      kind: "dynamic-batch",
      nodeId: batchDetection.info.nodeId,
      title: batchDetection.info.title.replace("(Dynamic Batch Input)", "").trim(),
      templateChainNodeIds: trace.templateChainNodeIds,
      templateChainTitles: buildChainTitles(parsedWorkflow, trace.templateChainNodeIds),
    };
  }
  if (batchDetection.error !== null) {
    return { kind: "error", error: batchDetection.error };
  }

  // No Dynamic Batch node — try direct repeatable inputs.
  const directDetection = detectDirectRepeatableInput(workflowJson);
  if (directDetection.ok) {
    const info = directDetection.info;
    const templatePort = info.populatedPorts[0];
    const trace = traceUpstreamTemplateChain(parsedWorkflow, {
      nodeId: info.targetNodeId,
      title: info.targetTitle,
      classType: info.targetClassType,
      templateInputKey: templatePort.key,
      templateSourceNodeId: templatePort.sourceNodeId,
      templateSourceOutputIndex: templatePort.sourceOutputIndex,
    });
    if (!trace.ok) return { kind: "error", error: trace.error };
    return {
      kind: "direct-repeatable-inputs",
      nodeId: info.targetNodeId,
      title: info.targetTitle,
      templateChainNodeIds: trace.templateChainNodeIds,
      templateChainTitles: buildChainTitles(parsedWorkflow, trace.templateChainNodeIds),
    };
  }
  if (directDetection.error !== null) {
    return { kind: "error", error: directDetection.error };
  }

  return { kind: "none" };
}

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

  const mode = resolveImageExpansionMode(params.workflowJson);
  if (mode.kind === "error") {
    return { ok: false, error: mode.error };
  }

  let expansion: DynamicBatchExpansionResult;
  if (mode.kind === "dynamic-batch") {
    expansion = expandDynamicBatchWorkflow({
      workflowJson: params.workflowJson,
      selectedImages: params.batchSelectedImages ?? [],
    });
  } else if (mode.kind === "direct-repeatable-inputs") {
    expansion = expandDirectRepeatableInputsWorkflow({
      workflowJson: params.workflowJson,
      selectedImages: params.batchSelectedImages ?? [],
    });
  } else {
    // "none" — no batch node and no direct repeatable inputs detected:
    // unchanged passthrough, identical to today's no-expansion behavior.
    expansion = {
      ok: true,
      workflowJson: params.workflowJson,
      expandedNodeIds: [],
      templateChainNodeIds: [],
      batchNodeId: "",
      batchInputKeys: [],
      preview: { batchTitle: "", templateChainTitles: [], selectedImageCount: 0, clonedNodeCount: 0 },
    };
  }

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
      /**
       * SEQGEN.STORYBOARD.3-FIX3 — which expansion mode this is, so a
       * caller (the Sequence generate page) can decide how to initialize
       * its selection without re-deriving the mode itself from workflow
       * structure (a second, divergent detection heuristic). Classic
       * Dynamic Batch workflows keep their exact current behavior
       * (absence of `batchImages_<nodeId>` = nothing selected); only
       * `direct-repeatable-inputs` initializes from `storyboardRefs`.
       */
      mode: "dynamic-batch" | "direct-repeatable-inputs";
    };

export function detectDynamicBatchUiInfo(workflowJson: string): DynamicBatchUiInfo {
  const mode = resolveImageExpansionMode(workflowJson);
  if (mode.kind === "none") return { kind: "none" };
  if (mode.kind === "error") return { kind: "error", message: mode.error };

  return {
    kind: "ready",
    batchNodeId: mode.nodeId,
    templateChainNodeIds: mode.templateChainNodeIds,
    batchTitle: mode.title,
    templateChainTitles: mode.templateChainTitles,
    mode: mode.kind,
  };
}
