// ---------------------------------------------------------------------------
// expandDirectRepeatableInputs.ts — Pure helpers for the "direct repeatable
// image inputs" mode (SEQGEN.STORYBOARD.3-FIX2, generalized in
// COMFY.DIRECTPORTS.1).
//
// Some workflows (e.g. GPT Image 2 / OpenAIGPTImageNodeV2, or ByteDance's
// reference-image nodes) accept a fixed set of numbered semantic ports —
// `image_1`, `image_2`, `image_3`, ... under any dotted prefix
// (`model.images.image_N`, `model.reference_images.image_N`, ...) — each
// connected directly to its own `LoadImage (Input) (Repeatable)` node, with
// no `ImageBatchMulti`/`ImpactMakeImageBatch` node in between. Feeding these
// workflows through the existing Dynamic Batch mechanism (a single
// array-style input on one batch node) does not preserve the per-image
// semantics the node expects.
//
// COMFY.DIRECTPORTS.1 — detection is purely on the `image_N` port suffix,
// never on a node's class_type: the convention is the port naming, not any
// specific node. See DIRECT_PORT_PATTERN's own header for why the anchor on
// `image_` is mandatory.
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
  removeOrphanedTemplateChainNodes,
} from "./expandDynamicBatch";

// COMFY.EMPTYSEL.1 — this mode's own empty-selection sentence, named so it
// can be recognized by `isEmptySelectionError` (buildGenerationPayload.ts)
// instead of a literal comparison at each call site. Deliberately a
// different sentence from the Dynamic Batch one above: it names "direct
// repeatable image inputs", not "Dynamic Image Batch" — the wording itself
// is unchanged by this ticket.
export const DIRECT_REPEATABLE_EMPTY_SELECTION_MESSAGE =
  "Add at least one image to the direct repeatable image inputs before generating.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * COMFY.DIRECTPORTS.1 — the convention is the numbered `image_N` port
 * suffix, never a node's class_type. `ByteDance2ReferenceNodeV2` exposes
 * `model.reference_images.image_N` next to it exactly the same way
 * `OpenAIGPTImageNodeV2` exposes `model.images.image_N`: the prefix differs,
 * the `image_N` suffix does not. The class_type check is dropped entirely —
 * any node carrying at least one `image_N`-suffixed port is a candidate.
 *
 * The anchor on the literal `image_` segment is deliberate and not
 * negotiable: nodes in the wild also expose `video_N`, `audio_N` and
 * `asset_N` ports on the same node, and a bare `_(\d+)$` pattern would wire
 * an image selection onto a video port.
 */
const DIRECT_PORT_PATTERN = /^(?:.+\.)?image_(\d+)$/;

export type DirectRepeatablePort = {
  key: string;
  index: number;
  sourceNodeId: string;
  sourceOutputIndex: number;
};

/**
 * COMFY.DIRECTPORTS.1b — one node in a group. A node is retained here only
 * if EVERY one of its `image_N` ports resolves to a real image source
 * (Correctif 1) — a node with even one malformed port is excluded from
 * candidacy entirely, never surfaced as an error (see the module-level
 * note above `detectDirectRepeatableInput`).
 */
export type DirectRepeatableGroupNode = {
  nodeId: string;
  title: string;
  classType: string;
  /** Ascending by index — populatedPorts[0] is this node's own cloning template port. */
  populatedPorts: DirectRepeatablePort[];
};

export type DirectRepeatableInputInfo = {
  /**
   * The smallest numeric node id in the group (Correctif 2, §14 "L'identité
   * du groupe") — the stable, deterministic key used for `batchImages_<id>`
   * and its sibling URL params. For a single-node group (the ordinary case,
   * OpenAI included) this is simply that node's own id, unchanged.
   */
  targetNodeId: string;
  /** The representative (lowest-id) node's title for a group of one; every member's title joined for a real group — the key stays single, the display name may not (§14). */
  targetTitle: string;
  /** class_type of the representative (targetNodeId) node. */
  targetClassType: string;
  /** Ascending by index — the representative node's own populated ports. Kept for backward compatibility with callers that only ever dealt with one node (buildGenerationPayload's templatePort = info.populatedPorts[0]). */
  populatedPorts: DirectRepeatablePort[];
  /**
   * COMFY.DIRECTPORTS.1b — every node in the group, sorted by ascending
   * numeric id, each with its OWN populated ports (own prefix, own port
   * keys — group members are never assumed to share a naming convention,
   * only the same upstream image source). Length 1 for the ordinary,
   * non-grouped case; `groupNodes[0]` is always the representative
   * (`targetNodeId`/`targetTitle`/`targetClassType`/`populatedPorts` above).
   */
  groupNodes: DirectRepeatableGroupNode[];
};

// ---------------------------------------------------------------------------
// detectDirectRepeatableInput
// ---------------------------------------------------------------------------

/**
 * Validates every `image_N`-suffixed port on one node and returns them
 * sorted ascending, or `null` if the node is not a valid candidate.
 *
 * COMFY.DIRECTPORTS.1b, Correctif 1 — a node is retained only if ALL of its
 * `image_N` ports resolve to a real image source. With the class_type gate
 * gone (Part B), "this node carries our ports" is no longer a safe signal
 * that the node is actually one of ours: a node with a merely malformed
 * port (unconnected, or fed by something that isn't an image source — e.g.
 * `#54`'s `LoadImage -> Resize Image v2 -> model.images.image_1`, where the
 * direct source is a resize node, not a Load Image) is simply not a
 * candidate. It is excluded here, silently — never surfaced as a named
 * per-port error, because we can no longer tell whether that node was ever
 * meant to be one of ours in the first place.
 */
function validateCandidatePorts(
  wf: Record<string, unknown>,
  node: ComfyNode
): DirectRepeatablePort[] | null {
  const inputs = node.inputs ?? {};
  const ports: DirectRepeatablePort[] = [];

  for (const [key, value] of Object.entries(inputs)) {
    const match = key.match(DIRECT_PORT_PATTERN);
    if (!match) continue;
    const index = parseInt(match[1], 10);

    if (!isStringArray2(value)) return null;
    const [sourceNodeId, sourceOutputIndex] = value;
    const sourceNodeRaw = wf[sourceNodeId];
    if (!isRecord(sourceNodeRaw) || !isImageSourceNode(sourceNodeRaw as ComfyNode)) return null;

    ports.push({ key, index, sourceNodeId, sourceOutputIndex });
  }

  if (ports.length === 0) return null;
  ports.sort((a, b) => a.index - b.index);
  return ports;
}

export function detectDirectRepeatableInput(
  workflow: unknown
): { ok: true; info: DirectRepeatableInputInfo } | { ok: false; error: string | null } {
  let wf: Record<string, unknown>;
  try {
    wf = normalizeWorkflowJson(workflow);
  } catch {
    return { ok: false, error: "Invalid workflow JSON." };
  }

  const retained: { nodeId: string; node: ComfyNode; ports: DirectRepeatablePort[] }[] = [];
  for (const [nodeId, nodeRaw] of Object.entries(wf)) {
    if (!isRecord(nodeRaw)) continue;
    const node = nodeRaw as ComfyNode;
    const inputs = node.inputs ?? {};
    const hasDirectPort = Object.keys(inputs).some((k) => DIRECT_PORT_PATTERN.test(k));
    if (!hasDirectPort) continue;

    const ports = validateCandidatePorts(wf, node);
    if (ports === null) continue; // excluded — not one of ours, not an error (Correctif 1)
    retained.push({ nodeId, node, ports });
  }

  if (retained.length === 0) return { ok: false, error: null };

  // COMFY.DIRECTPORTS.1b, Correctif 2 — group retained candidates by the
  // image source feeding their own lowest-indexed port. Candidates sharing
  // that source are a single reference set feeding several nodes at once
  // (the author's #56 case), not competing candidates; candidates on
  // different sources are a genuine ambiguity and still refused.
  const bySource = new Map<string, typeof retained>();
  for (const candidate of retained) {
    const sourceId = candidate.ports[0].sourceNodeId;
    const group = bySource.get(sourceId) ?? [];
    group.push(candidate);
    bySource.set(sourceId, group);
  }

  if (bySource.size > 1) {
    const named = retained.map((c) => `${getTitle(c.node, c.nodeId)} (${c.nodeId})`).join(", ");
    return {
      ok: false,
      error:
        "Multiple nodes carry direct numbered image inputs from different upstream sources: " +
        `${named}. Connect them to the same reference images to form a group, or remove the extra node.`,
    };
  }

  const group = retained.slice().sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
  const representative = group[0];

  const groupNodes: DirectRepeatableGroupNode[] = group.map((c) => ({
    nodeId: c.nodeId,
    title: getTitle(c.node, c.nodeId),
    classType: c.node.class_type ?? "Unknown",
    populatedPorts: c.ports,
  }));

  return {
    ok: true,
    info: {
      targetNodeId: representative.nodeId,
      targetTitle:
        group.length > 1
          ? groupNodes.map((n) => n.title).join(" + ")
          : getTitle(representative.node, representative.nodeId),
      targetClassType: representative.node.class_type ?? "Unknown",
      populatedPorts: representative.ports,
      groupNodes,
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
  groupNodes: DirectRepeatableGroupNode[]
): { ok: true; unionNodeIds: string[]; templateChainNodeIds: string[]; imageSourceNodeId: string } | { ok: false; error: string } {
  const unionNodeIds = new Set<string>();

  // Union of every group member's every port's own upstream chain — needed
  // so buildGenerationPayload's `displayMappings` filter hides every
  // original port's source from "Suggested Inputs", on every node in the
  // group, not only the one chosen as the cloning template.
  for (const groupNode of groupNodes) {
    for (const port of groupNode.populatedPorts) {
      const syntheticInfo: DynamicBatchInputInfo = {
        nodeId: groupNode.nodeId,
        title: groupNode.title,
        classType: groupNode.classType,
        templateInputKey: port.key,
        templateSourceNodeId: port.sourceNodeId,
        templateSourceOutputIndex: port.sourceOutputIndex,
      };
      const trace = traceUpstreamTemplateChain(workflow, syntheticInfo);
      if (!trace.ok) return { ok: false, error: trace.error };
      for (const id of trace.templateChainNodeIds) unionNodeIds.add(id);
    }
  }

  // COMFY.DIRECTPORTS.1b — the canonical cloning template is the
  // representative (lowest-id) group member's own lowest-indexed port. For
  // a real group (§14), every member's port[0] shares the exact same
  // upstream source by construction (that is what makes them a group), so
  // this single trace is the chain to clone once per selected image and
  // wire onto every member — never once per node.
  const representative = groupNodes[0];
  const templatePort = representative.populatedPorts[0];
  const templateTrace = traceUpstreamTemplateChain(workflow, {
    nodeId: representative.nodeId,
    title: representative.title,
    classType: representative.classType,
    templateInputKey: templatePort.key,
    templateSourceNodeId: templatePort.sourceNodeId,
    templateSourceOutputIndex: templatePort.sourceOutputIndex,
  });
  if (!templateTrace.ok) return { ok: false, error: templateTrace.error };

  return {
    ok: true,
    unionNodeIds: Array.from(unionNodeIds),
    templateChainNodeIds: templateTrace.templateChainNodeIds,
    imageSourceNodeId: templateTrace.imageSourceNodeId,
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

  const allChains = traceAllDirectChains(workflow, info.groupNodes);
  if (!allChains.ok) return { ok: false, error: allChains.error };

  if (selectedImages.length === 0) {
    return {
      ok: false,
      error: DIRECT_REPEATABLE_EMPTY_SELECTION_MESSAGE,
    };
  }

  let expanded: ComfyWorkflow;
  try {
    expanded = structuredClone(workflow) as ComfyWorkflow;
  } catch {
    expanded = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
  }

  // COMFY.DIRECTPORTS.1b — resolve every group member's live node reference
  // up front. A group of one (the ordinary case, OpenAI included) is just
  // this loop running once.
  const groupTargetNodes: Record<string, ComfyNode> = {};
  for (const groupNode of info.groupNodes) {
    const targetNode = expanded[groupNode.nodeId];
    if (!targetNode || !isRecord(targetNode)) {
      return { ok: false, error: `Target node ${groupNode.nodeId} not found in expanded workflow.` };
    }
    groupTargetNodes[groupNode.nodeId] = targetNode;
  }

  // Remove every originally-populated direct port unconditionally, on EVERY
  // node in the group — ports are always rebuilt fresh from the current
  // selection, so reducing the selection never leaves a stale port wired to
  // a removed reference on any group member
  // ("supprimer les ports directs devenus inutilises").
  for (const groupNode of info.groupNodes) {
    const targetNode = groupTargetNodes[groupNode.nodeId];
    if (targetNode.inputs) {
      for (const port of groupNode.populatedPorts) {
        delete targetNode.inputs[port.key];
      }
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
  // Reported for the representative (targetNodeId) node only, for backward
  // compatibility with the pre-1b single-node shape — every group member
  // gets the equivalent port wired below regardless of what is reported here.
  const portKeys: string[] = [];

  for (let i = 0; i < selectedImages.length; i++) {
    const image = selectedImages[i];

    // COMFY.DIRECTPORTS.1b — the model chain is cloned ONCE per selected
    // image, never once per node in the group: it is the same reference
    // set, already feeding every member.
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

    // Wire the single clone of rank `i` onto the port of rank `i` on EVERY
    // node in the group — each node increments its OWN template port key
    // (own prefix, own numbering), never a shared one.
    for (const groupNode of info.groupNodes) {
      let portKey: string;
      try {
        portKey = buildIncrementedInputName(groupNode.populatedPorts[0].key, i);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Direct image input naming pattern is not supported.",
        };
      }
      const targetNode = groupTargetNodes[groupNode.nodeId];
      if (!targetNode.inputs) targetNode.inputs = {};
      targetNode.inputs[portKey] = [lastClonedId, 0];
      if (groupNode.nodeId === info.targetNodeId) portKeys.push(portKey);
    }
  }

  // Remove every originally-populated port's source chain, now orphaned —
  // not only the port[0] chain reused as the clone template. All of them
  // were disconnected from targetNode above.
  const removal = removeOrphanedTemplateChainNodes(expanded, allChains.unionNodeIds);
  if (!removal.ok) return { ok: false, error: removal.error };

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
