// ---------------------------------------------------------------------------
// expandDynamicBatch.ts — Pure helpers for Dynamic Batch Template Chain
// Runtime Expansion (WFBUILD.1A).
//
// No DB access. No fetch. No server-only. Deterministic.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ComfyNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

type ComfyWorkflow = Record<string, ComfyNode>;

export type DynamicBatchInputInfo = {
  nodeId: string;
  title: string;
  classType: string;
  templateInputKey: string;
  templateSourceNodeId: string;
  templateSourceOutputIndex: number;
};

export type DynamicBatchTraceResult =
  | {
      ok: true;
      batch: DynamicBatchInputInfo;
      templateChainNodeIds: string[];
      imageSourceNodeId: string;
    }
  | { ok: false; error: string };

export type DynamicBatchExpansionImage = {
  id: string;
  imagePath: string;
};

export type DynamicBatchExpansionResult =
  | {
      ok: true;
      workflowJson: string;
      expandedNodeIds: string[];
      templateChainNodeIds: string[];
      batchNodeId: string;
      batchInputKeys: string[];
      preview: {
        batchTitle: string;
        templateChainTitles: string[];
        selectedImageCount: number;
        clonedNodeCount: number;
      };
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Guards / helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray2(value: unknown): value is [string, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}

function getTitle(node: ComfyNode, nodeId: string): string {
  return node._meta?.title ?? node.class_type ?? `Node ${nodeId}`;
}

function numericIds(workflow: ComfyWorkflow): number[] {
  return Object.keys(workflow)
    .map(Number)
    .filter((n) => !isNaN(n));
}

function maxNumericId(workflow: ComfyWorkflow): number {
  const ids = numericIds(workflow);
  return ids.length > 0 ? Math.max(...ids) : 0;
}

// ---------------------------------------------------------------------------
// normalizeWorkflowJson — accepts string or object, returns parsed object
// ---------------------------------------------------------------------------

function normalizeWorkflowJson(input: unknown): Record<string, unknown> {
  if (typeof input === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error("Invalid workflow JSON.");
    }
    if (!isRecord(parsed)) {
      throw new Error("Invalid workflow JSON.");
    }
    // Reject UI format
    if (Array.isArray(parsed["nodes"]) || Array.isArray(parsed["links"])) {
      throw new Error("Invalid workflow JSON.");
    }
    return parsed;
  }

  if (isRecord(input)) {
    // Reject UI format even for objects
    if (Array.isArray(input["nodes"]) || Array.isArray(input["links"])) {
      throw new Error("Invalid workflow JSON.");
    }
    return input;
  }

  throw new Error("Invalid workflow JSON.");
}

// ---------------------------------------------------------------------------
// parseWorkflowJson — internal, string-only parser returning ComfyWorkflow
// ---------------------------------------------------------------------------

function parseWorkflowJson(raw: string): ComfyWorkflow | null {
  try {
    return normalizeWorkflowJson(raw) as ComfyWorkflow;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// findFirstConnectedInput
// ---------------------------------------------------------------------------

export function findFirstConnectedInput(
  node: unknown
): { key: string; value: [string, number] } | null {
  if (!isRecord(node)) return null;
  const inputs = node["inputs"];
  if (!isRecord(inputs)) return null;

  for (const [key, value] of Object.entries(inputs)) {
    if (isStringArray2(value)) {
      return { key, value: value as [string, number] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// isImageSourceNode
// ---------------------------------------------------------------------------

function isImageSourceNode(node: ComfyNode): boolean {
  const ct = node.class_type ?? "";
  if (ct === "LoadImage") return true;
  if (/Image.*Load|Load.*Image/i.test(ct)) return true;
  if (node.inputs && typeof node.inputs["image"] === "string") return true;
  return false;
}

// ---------------------------------------------------------------------------
// detectDynamicBatchInput
// ---------------------------------------------------------------------------

export function detectDynamicBatchInput(
  workflow: unknown
): { ok: true; info: DynamicBatchInputInfo } | { ok: false; error: string | null } {
  let wf: Record<string, unknown>;
  try {
    wf = normalizeWorkflowJson(workflow);
  } catch {
    return { ok: false, error: "Invalid workflow JSON." };
  }

  const candidates: DynamicBatchInputInfo[] = [];

  for (const [nodeId, nodeRaw] of Object.entries(wf)) {
    if (!isRecord(nodeRaw)) continue;
    const node = nodeRaw as ComfyNode;
    const metaTitle = node._meta?.title ?? "";
    if (!metaTitle.includes("(Dynamic Batch Input)")) continue;

    const connected = findFirstConnectedInput(node);
    if (!connected) continue;

    candidates.push({
      nodeId,
      title: getTitle(node, nodeId),
      classType: node.class_type ?? "Unknown",
      templateInputKey: connected.key,
      templateSourceNodeId: connected.value[0],
      templateSourceOutputIndex: connected.value[1],
    });
  }

  if (candidates.length === 0) return { ok: false, error: null };
  if (candidates.length > 1) {
    return {
      ok: false,
      error:
        "Only one Dynamic Batch Input is supported in V1. " +
        "Remove extra (Dynamic Batch Input) markers from this workflow.",
    };
  }

  return { ok: true, info: candidates[0] };
}

// ---------------------------------------------------------------------------
// traceUpstreamTemplateChain
// ---------------------------------------------------------------------------

export function traceUpstreamTemplateChain(
  workflow: unknown,
  batch: DynamicBatchInputInfo
): DynamicBatchTraceResult {
  let wf: Record<string, unknown>;
  try {
    wf = normalizeWorkflowJson(workflow);
  } catch {
    return { ok: false, error: "Invalid workflow JSON." };
  }
  const typedWf = wf as ComfyWorkflow;

  const chainNodeIds: string[] = [];
  const visited = new Set<string>();
  let currentId = batch.templateSourceNodeId;

  // Validate batch node exists
  if (!typedWf[batch.nodeId]) {
    return { ok: false, error: `Batch node ${batch.nodeId} not found in workflow.` };
  }

  while (true) {
    if (visited.has(currentId)) {
      return {
        ok: false,
        error: "Cycle detected in the template chain leading to the batch node. Check for loops.",
      };
    }
    visited.add(currentId);

    const node = typedWf[currentId];
    if (!node) {
      return {
        ok: false,
        error: `Node ${currentId} not found in workflow: unable to infer template chain.`,
      };
    }

    chainNodeIds.push(currentId);

    // Stop if we reached an image source
    if (isImageSourceNode(node)) {
      return {
        ok: true,
        batch,
        templateChainNodeIds: chainNodeIds.reverse(), // source first, batch-last-node last
        imageSourceNodeId: currentId,
      };
    }

    // Find the single upstream connected input to continue tracing
    const inputs = node.inputs ?? {};
    const connectedEntries = Object.entries(inputs).filter(([, v]) => isStringArray2(v));

    if (connectedEntries.length === 0) {
      const ct = node.class_type ?? "Unknown";
      return {
        ok: false,
        error:
          `Dynamic Batch setup is invalid. The batch node must receive a linear image chain ` +
          `starting from a Load Image node. Node ${currentId} (${ct}) has no connected inputs.`,
      };
    }

    if (connectedEntries.length > 1) {
      return {
        ok: false,
        error:
          "Dynamic Batch supports one image source in V1. " +
          `Node ${currentId} has ${connectedEntries.length} connected inputs — use a single linear chain.`,
      };
    }

    // Continue upstream
    currentId = (connectedEntries[0][1] as [string, number])[0];
  }
}

// ---------------------------------------------------------------------------
// buildIncrementedInputName
// ---------------------------------------------------------------------------

export function buildIncrementedInputName(
  templateInputName: string,
  index: number
): string {
  const match = templateInputName.match(/^(.+?)(\d+)$/);
  if (!match) {
    throw new Error(
      'Dynamic batch input naming pattern is not supported. ' +
        `Input "${templateInputName}" must end with a number, for example "image1".`
    );
  }
  const prefix = match[1];
  const baseNumber = parseInt(match[2], 10);
  return `${prefix}${baseNumber + index}`;
}

// ---------------------------------------------------------------------------
// expandDynamicBatchWorkflow
// ---------------------------------------------------------------------------

export function expandDynamicBatchWorkflow(params: {
  workflowJson: string;
  selectedImages: DynamicBatchExpansionImage[];
}): DynamicBatchExpansionResult {
  const { workflowJson, selectedImages } = params;

  // --- 1. Parse ---
  const workflow = parseWorkflowJson(workflowJson);
  if (!workflow) {
    return { ok: false, error: "Workflow JSON could not be parsed." };
  }

  // --- 2. Detect batch input ---
  const detection = detectDynamicBatchInput(workflow);
  if (!detection.ok) {
    // null error = no batch node → not an error, just return unchanged
    if (detection.error === null) {
      return {
        ok: true,
        workflowJson,
        expandedNodeIds: [],
        templateChainNodeIds: [],
        batchNodeId: "",
        batchInputKeys: [],
        preview: {
          batchTitle: "",
          templateChainTitles: [],
          selectedImageCount: 0,
          clonedNodeCount: 0,
        },
      };
    }
    return { ok: false, error: detection.error };
  }

  const batch = detection.info;

  // --- 3. Trace chain ---
  const trace = traceUpstreamTemplateChain(workflow, batch);
  if (!trace.ok) return { ok: false, error: trace.error };

  // --- 4. Validate selected images ---
  if (selectedImages.length === 0) {
    return {
      ok: false,
      error: "Add at least one image to Dynamic Image Batch before generating.",
    };
  }

  // --- 5. Clone workflow (deep copy — never mutate original) ---
  let expanded: ComfyWorkflow;
  try {
    expanded = structuredClone(workflow) as ComfyWorkflow;
  } catch {
    expanded = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
  }

  const { templateChainNodeIds } = trace;
  const batchNode = expanded[batch.nodeId];
  if (!batchNode || !isRecord(batchNode)) {
    return { ok: false, error: `Batch node ${batch.nodeId} not found in expanded workflow.` };
  }

  // --- 6. Remove old template-slot connection from batch node ---
  // The original template slot (e.g. image1) connected to the template chain
  // must be cleared — we'll replace it with the cloned chains.
  if (batchNode.inputs && batchNode.inputs[batch.templateInputKey] !== undefined) {
    delete batchNode.inputs[batch.templateInputKey];
  }

  // --- 7. Collect titles for preview ---
  const templateChainTitles: string[] = templateChainNodeIds.map((nid) => {
    const node = expanded[nid];
    if (!node) return nid;
    const title = node._meta?.title ?? node.class_type ?? nid;
    return title.replace("(Input)", "").replace("(Dynamic Batch Input)", "").trim();
  });

  let nextId = maxNumericId(expanded) + 1;
  const expandedNodeIds: string[] = [];
  const batchInputKeys: string[] = [];

  // --- 8. Clone chain once per image ---
  for (let i = 0; i < selectedImages.length; i++) {
    const image = selectedImages[i];
    const inputName = buildIncrementedInputName(batch.templateInputKey, i);
    batchInputKeys.push(inputName);

    if (batchNode.inputs && batchNode.inputs[inputName] !== undefined) {
      return {
        ok: false,
        error: `Batch input "${inputName}" already exists. Naming pattern conflict.`,
      };
    }

    const idMapping: Record<string, string> = {};
    const newChainIds: string[] = [];

    // Clone each node in the chain (in order: source → ... → last before batch)
    for (const oldId of templateChainNodeIds) {
      const originalNode = expanded[oldId];
      if (!originalNode) {
        return { ok: false, error: `Template chain node ${oldId} not found during cloning.` };
      }

      const newId = String(nextId++);
      idMapping[oldId] = newId;
      newChainIds.push(newId);

      // Deep-clone the node
      const cloned = JSON.parse(JSON.stringify(originalNode)) as ComfyNode;

      // Strip (Input) and (Dynamic Batch Input) markers from cloned _meta.title
      // so they won't be picked up as regular inputs by patchWorkflowPayload.
      if (cloned._meta?.title) {
        cloned._meta = {
          ...cloned._meta,
          title: cloned._meta.title
            .replace("(Input)", "")
            .replace("(Dynamic Batch Input)", "")
            .trim(),
        };
      }

      expanded[newId] = cloned;
      expandedNodeIds.push(newId);
    }

    // --- 9. Remap internal references in cloned nodes ---
    for (let j = 0; j < newChainIds.length; j++) {
      const newId = newChainIds[j];
      const node = expanded[newId];
      if (!node || !node.inputs) continue;

      const remappedInputs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node.inputs)) {
        if (isStringArray2(value) && idMapping[value[0]] !== undefined) {
          // Reference to another node in the same cloned chain → remap
          remappedInputs[key] = [idMapping[value[0]], value[1]];
        } else {
          remappedInputs[key] = value;
        }
      }
      expanded[newId] = { ...node, inputs: remappedInputs };
    }

    // --- 10. Patch the cloned LoadImage with the selected image ---
    const clonedSourceId = idMapping[trace.imageSourceNodeId];
    if (!clonedSourceId) {
      return {
        ok: false,
        error: `Failed to find cloned image source for image index ${i}.`,
      };
    }
    const clonedSource = expanded[clonedSourceId];
    if (!clonedSource || !clonedSource.inputs) {
      return {
        ok: false,
        error: `Cloned image source ${clonedSourceId} has no inputs.`,
      };
    }
    clonedSource.inputs["image"] = image.imagePath;

    // --- 11. Connect last cloned node to batch ---
    const lastClonedId = newChainIds[newChainIds.length - 1];
    const lastNode = expanded[lastClonedId];
    if (!lastNode) {
      return {
        ok: false,
        error: `Last cloned node ${lastClonedId} not found.`,
      };
    }

    // The output index is always 0 for single-output nodes in ComfyUI
    if (!batchNode.inputs) {
      batchNode.inputs = {};
    }
    batchNode.inputs[inputName] = [lastClonedId, 0];
  }

  return {
    ok: true,
    workflowJson: JSON.stringify(expanded),
    expandedNodeIds,
    templateChainNodeIds,
    batchNodeId: batch.nodeId,
    batchInputKeys,
    preview: {
      batchTitle: batch.title.replace("(Dynamic Batch Input)", "").trim(),
      templateChainTitles,
      selectedImageCount: selectedImages.length,
      clonedNodeCount: expandedNodeIds.length,
    },
  };
}