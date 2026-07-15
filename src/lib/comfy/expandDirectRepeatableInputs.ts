// ---------------------------------------------------------------------------
// expandDirectRepeatableInputs.ts — Pure helpers for the "direct repeatable
// image inputs" mode (SEQGEN.STORYBOARD.3-FIX2).
//
// Some workflows (e.g. GPT Image 2 / OpenAIGPTImageNodeV2) accept a fixed
// set of numbered semantic ports — `model.images.image_1`, `image_2`,
// `image_3`, ... — each connected directly to its own
// `LoadImage (Input) (Repeatable)` node, with no `ImageBatchMulti`/
// `ImpactMakeImageBatch` node in between. Feeding these workflows through
// the existing Dynamic Batch mechanism (a single array-style input on one
// batch node) does not preserve the per-image semantics the node expects.
//
// This is a dedicated sibling of expandDynamicBatch.ts, not a parameterized
// variant of it — kept deliberately separate so neither file's own
// detect/trace/expand contract becomes ambiguous. It reuses that file's
// already-exported, protocol-agnostic node-graph primitives
// (isRecord/isStringArray2/getTitle/maxNumericId/isImageSourceNode/
// normalizeWorkflowJson/parseWorkflowJson) and its exported
// traceUpstreamTemplateChain/buildIncrementedInputName — never a second,
// divergent implementation of chain tracing or port-name incrementing.
//
// No DB access. No fetch. No server-only. Deterministic.
// ---------------------------------------------------------------------------

import {
  type ComfyNode,
  type ComfyWorkflow,
  type DynamicBatchInputInfo,
  type DynamicBatchExpansionImage,
  type DynamicBatchExpansionResult,
  isRecord,
  isStringArray2,
  getTitle,
  maxNumericId,
  isImageSourceNode,
  normalizeWorkflowJson,
  parseWorkflowJson,
  traceUpstreamTemplateChain,
  buildIncrementedInputName,
} from "./expandDynamicBatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The workflow structure this mode targets — kept as a constant, not read from the workflow's name/id, so detection stays purely structural. */
const DIRECT_TARGET_CLASS_TYPE = "OpenAIGPTImageNodeV2";
const DIRECT_PORT_PATTERN = /^model\.images\.image_(\d+)$/;

export type DirectRepeatablePort = {
  key: string;
  index: number;
  sourceNodeId: string;
  sourceOutputIndex: number;
};

export type DirectRepeatableInputInfo = {
  targetNodeId: string;
  targetTitle: string;
  targetClassType: string;
  /** Ascending by index — populatedPorts[0] is the cloning template (lowest-numbered port). */
  populatedPorts: DirectRepeatablePort[];
};

// ---------------------------------------------------------------------------
// detectDirectRepeatableInput
// ---------------------------------------------------------------------------

export function detectDirectRepeatableInput(
  workflow: unknown
): { ok: true; info: DirectRepeatableInputInfo } | { ok: false; error: string | null } {
  let wf: Record<string, unknown>;
  try {
    wf = normalizeWorkflowJson(workflow);
  } catch {
    return { ok: false, error: "Invalid workflow JSON." };
  }

  const candidateNodes: { nodeId: string; node: ComfyNode }[] = [];
  for (const [nodeId, nodeRaw] of Object.entries(wf)) {
    if (!isRecord(nodeRaw)) continue;
    const node = nodeRaw as ComfyNode;
    if (node.class_type !== DIRECT_TARGET_CLASS_TYPE) continue;
    const inputs = node.inputs ?? {};
    const hasDirectPort = Object.keys(inputs).some((k) => DIRECT_PORT_PATTERN.test(k));
    if (!hasDirectPort) continue;
    candidateNodes.push({ nodeId, node });
  }

  if (candidateNodes.length === 0) return { ok: false, error: null };
  if (candidateNodes.length > 1) {
    return {
      ok: false,
      error:
        "Only one OpenAI GPT Image 2 node with direct image inputs is supported. " +
        "Remove the extra node.",
    };
  }

  const { nodeId: targetNodeId, node: targetNode } = candidateNodes[0];
  const inputs = targetNode.inputs ?? {};

  const populatedPorts: DirectRepeatablePort[] = [];
  for (const [key, value] of Object.entries(inputs)) {
    const match = key.match(DIRECT_PORT_PATTERN);
    if (!match) continue;
    const index = parseInt(match[1], 10);

    if (!isStringArray2(value)) {
      return {
        ok: false,
        error: `Direct image input "${key}" on node ${targetNodeId} is not connected to an upstream node.`,
      };
    }
    const [sourceNodeId, sourceOutputIndex] = value;
    const sourceNodeRaw = wf[sourceNodeId];
    if (!isRecord(sourceNodeRaw) || !isImageSourceNode(sourceNodeRaw as ComfyNode)) {
      return {
        ok: false,
        error: `Direct image input "${key}" on node ${targetNodeId} is not connected to a Load Image node.`,
      };
    }

    populatedPorts.push({ key, index, sourceNodeId, sourceOutputIndex });
  }

  if (populatedPorts.length === 0) {
    return {
      ok: false,
      error: `Node ${targetNodeId} exposes numbered image_N inputs but none are connected to a Load Image node.`,
    };
  }

  populatedPorts.sort((a, b) => a.index - b.index);

  return {
    ok: true,
    info: {
      targetNodeId,
      targetTitle: getTitle(targetNode, targetNodeId),
      targetClassType: targetNode.class_type ?? DIRECT_TARGET_CLASS_TYPE,
      populatedPorts,
    },
  };
}

// ---------------------------------------------------------------------------
// traceAllDirectChains — every originally-populated port's own upstream
// chain (usually just its own LoadImage node), unioned. Needed so
// buildGenerationPayload's `displayMappings` filter hides every original
// port's source from "Suggested Inputs" — not only the one chosen as the
// cloning template — once they're all disconnected and replaced below.
// ---------------------------------------------------------------------------

function traceAllDirectChains(
  workflow: unknown,
  info: DirectRepeatableInputInfo
): { ok: true; unionNodeIds: string[]; templateChainNodeIds: string[]; imageSourceNodeId: string } | { ok: false; error: string } {
  const unionNodeIds = new Set<string>();
  let templateChainNodeIds: string[] | null = null;
  let imageSourceNodeId: string | null = null;

  for (const port of info.populatedPorts) {
    const syntheticInfo: DynamicBatchInputInfo = {
      nodeId: info.targetNodeId,
      title: info.targetTitle,
      classType: info.targetClassType,
      templateInputKey: port.key,
      templateSourceNodeId: port.sourceNodeId,
      templateSourceOutputIndex: port.sourceOutputIndex,
    };
    const trace = traceUpstreamTemplateChain(workflow, syntheticInfo);
    if (!trace.ok) return { ok: false, error: trace.error };
    for (const id of trace.templateChainNodeIds) unionNodeIds.add(id);
    if (templateChainNodeIds === null) {
      // populatedPorts[0] (lowest index) is the canonical cloning template.
      templateChainNodeIds = trace.templateChainNodeIds;
      imageSourceNodeId = trace.imageSourceNodeId;
    }
  }

  if (templateChainNodeIds === null || imageSourceNodeId === null) {
    return { ok: false, error: "No populated direct image port to trace." };
  }

  return {
    ok: true,
    unionNodeIds: Array.from(unionNodeIds),
    templateChainNodeIds,
    imageSourceNodeId,
  };
}

// ---------------------------------------------------------------------------
// expandDirectRepeatableInputsWorkflow
// ---------------------------------------------------------------------------

export function expandDirectRepeatableInputsWorkflow(params: {
  workflowJson: string;
  selectedImages: DynamicBatchExpansionImage[];
}): DynamicBatchExpansionResult {
  const { workflowJson, selectedImages } = params;

  const workflow = parseWorkflowJson(workflowJson);
  if (!workflow) {
    return { ok: false, error: "Workflow JSON could not be parsed." };
  }

  const detection = detectDirectRepeatableInput(workflow);
  if (!detection.ok) {
    if (detection.error === null) {
      return {
        ok: true,
        workflowJson,
        expandedNodeIds: [],
        templateChainNodeIds: [],
        batchNodeId: "",
        batchInputKeys: [],
        preview: { batchTitle: "", templateChainTitles: [], selectedImageCount: 0, clonedNodeCount: 0 },
      };
    }
    return { ok: false, error: detection.error };
  }
  const info = detection.info;

  const allChains = traceAllDirectChains(workflow, info);
  if (!allChains.ok) return { ok: false, error: allChains.error };

  if (selectedImages.length === 0) {
    return {
      ok: false,
      error: "Add at least one image to the direct GPT Image 2 inputs before generating.",
    };
  }

  let expanded: ComfyWorkflow;
  try {
    expanded = structuredClone(workflow) as ComfyWorkflow;
  } catch {
    expanded = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
  }

  const targetNode = expanded[info.targetNodeId];
  if (!targetNode || !isRecord(targetNode)) {
    return { ok: false, error: `Target node ${info.targetNodeId} not found in expanded workflow.` };
  }

  // Remove every originally-populated direct port unconditionally — ports
  // are always rebuilt fresh from the current selection, so reducing the
  // selection never leaves a stale port wired to a removed reference
  // ("supprimer les ports directs devenus inutilises").
  if (targetNode.inputs) {
    for (const port of info.populatedPorts) {
      delete targetNode.inputs[port.key];
    }
  }

  const { templateChainNodeIds } = allChains;
  const templateChainTitles: string[] = templateChainNodeIds.map((nid) => {
    const node = expanded[nid];
    if (!node) return nid;
    const title = node._meta?.title ?? node.class_type ?? nid;
    return title.replace("(Input)", "").replace("(Repeatable)", "").trim();
  });

  let nextId = maxNumericId(expanded) + 1;
  const expandedNodeIds: string[] = [];
  const portKeys: string[] = [];
  const templatePortKey = info.populatedPorts[0].key;

  for (let i = 0; i < selectedImages.length; i++) {
    const image = selectedImages[i];
    let portKey: string;
    try {
      portKey = buildIncrementedInputName(templatePortKey, i);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Direct image input naming pattern is not supported.",
      };
    }
    portKeys.push(portKey);

    const idMapping: Record<string, string> = {};
    const newChainIds: string[] = [];

    for (const oldId of templateChainNodeIds) {
      const originalNode = expanded[oldId];
      if (!originalNode) {
        return { ok: false, error: `Template chain node ${oldId} not found during cloning.` };
      }
      const newId = String(nextId++);
      idMapping[oldId] = newId;
      newChainIds.push(newId);

      const cloned = JSON.parse(JSON.stringify(originalNode)) as ComfyNode;
      if (cloned._meta?.title) {
        cloned._meta = {
          ...cloned._meta,
          title: cloned._meta.title.replace("(Input)", "").replace("(Repeatable)", "").trim(),
        };
      }
      expanded[newId] = cloned;
      expandedNodeIds.push(newId);
    }

    for (let j = 0; j < newChainIds.length; j++) {
      const newId = newChainIds[j];
      const node = expanded[newId];
      if (!node || !node.inputs) continue;
      const remappedInputs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node.inputs)) {
        if (isStringArray2(value) && idMapping[value[0]] !== undefined) {
          remappedInputs[key] = [idMapping[value[0]], value[1]];
        } else {
          remappedInputs[key] = value;
        }
      }
      expanded[newId] = { ...node, inputs: remappedInputs };
    }

    const clonedSourceId = idMapping[allChains.imageSourceNodeId];
    if (!clonedSourceId) {
      return { ok: false, error: `Failed to find cloned image source for image index ${i}.` };
    }
    const clonedSource = expanded[clonedSourceId];
    if (!clonedSource || !clonedSource.inputs) {
      return { ok: false, error: `Cloned image source ${clonedSourceId} has no inputs.` };
    }
    clonedSource.inputs["image"] = image.imagePath;

    const lastClonedId = newChainIds[newChainIds.length - 1];
    const lastNode = expanded[lastClonedId];
    if (!lastNode) {
      return { ok: false, error: `Last cloned node ${lastClonedId} not found.` };
    }

    if (!targetNode.inputs) targetNode.inputs = {};
    targetNode.inputs[portKey] = [lastClonedId, 0];
  }

  return {
    ok: true,
    workflowJson: JSON.stringify(expanded),
    // Union of ALL originally-populated ports' source chains — every one of
    // them is now disconnected and replaced, so all must be hidden from
    // displayMappings, not only the one chain reused as the clone template.
    expandedNodeIds,
    templateChainNodeIds: allChains.unionNodeIds,
    batchNodeId: info.targetNodeId,
    batchInputKeys: portKeys,
    preview: {
      batchTitle: info.targetTitle,
      templateChainTitles,
      selectedImageCount: selectedImages.length,
      clonedNodeCount: expandedNodeIds.length,
    },
  };
}
