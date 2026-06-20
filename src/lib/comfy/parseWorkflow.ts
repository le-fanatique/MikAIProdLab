type ComfyNode = {
  class_type?: string;
  _meta?: {
    title?: string;
  };
  inputs?: Record<string, unknown>;
};

type ComfyWorkflowJson = Record<string, ComfyNode>;

export type WorkflowInputKind = "text" | "image" | "unknown";
export type WorkflowOutputKind = "image" | "video" | "unknown";
export type InferredWorkflowKind = "image" | "video" | "unknown";

export type WorkflowInput = {
  nodeId: string;
  title: string;
  label: string;
  classType: string;
  kind: WorkflowInputKind;
  defaultValue: string | null;
};

export type WorkflowOutput = {
  nodeId: string;
  title: string;
  label: string;
  classType: string;
  kind: WorkflowOutputKind;
  filenamePrefix: string | null;
};

export type ParsedWorkflow = {
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
  inferredKind: InferredWorkflowKind;
  nodeCount: number;
};

const IMAGE_SAVERS = new Set(["SaveImage", "SaveImageWebsocket", "SaveAnimatedWEBP"]);
const VIDEO_SAVERS = new Set(["SaveVideo", "VHS_VideoCombine"]);

function buildTitle(nodeId: string, node: ComfyNode): string {
  return node._meta?.title ?? node.class_type ?? `Node ${nodeId}`;
}

function buildLabel(title: string): string {
  return title.replace("(Input)", "").replace("(Output)", "").trim();
}

function classifyInputKind(classType: string): WorkflowInputKind {
  if (classType === "PrimitiveStringMultiline") return "text";
  if (/Text|String/i.test(classType)) return "text";
  if (classType === "LoadImage") return "image";
  if (/Image.*Load|Load.*Image/i.test(classType)) return "image";
  return "unknown";
}

function extractDefaultValue(classType: string, inputs: Record<string, unknown> | undefined): string | null {
  if (classType === "PrimitiveStringMultiline") {
    const val = inputs?.["value"];
    return typeof val === "string" ? val : null;
  }
  return null;
}

function classifyOutputKind(classType: string): WorkflowOutputKind {
  if (IMAGE_SAVERS.has(classType)) return "image";
  if (VIDEO_SAVERS.has(classType)) return "video";
  return "unknown";
}

export function validateComfyWorkflowJson(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;

  const obj = parsed as Record<string, unknown>;

  // Reject UI format
  if (Array.isArray(obj["nodes"]) || Array.isArray(obj["links"])) return false;

  // At least one node must have class_type, inputs, or _meta
  const hasValidNode = Object.values(obj).some((v) => {
    if (typeof v !== "object" || v === null) return false;
    const node = v as Record<string, unknown>;
    return "class_type" in node || "inputs" in node || "_meta" in node;
  });

  return hasValidNode;
}

export function detectWorkflowInputs(workflow: ComfyWorkflowJson): WorkflowInput[] {
  const inputs: WorkflowInput[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    const metaTitle = node._meta?.title ?? "";
    if (!metaTitle.includes("(Input)")) continue;

    const classType = node.class_type ?? "Unknown";
    const title = buildTitle(nodeId, node);
    const label = buildLabel(title);
    const kind = classifyInputKind(classType);
    const defaultValue = extractDefaultValue(classType, node.inputs);

    inputs.push({ nodeId, title, label, classType, kind, defaultValue });
  }
  return inputs;
}

export function detectWorkflowOutputs(workflow: ComfyWorkflowJson): WorkflowOutput[] {
  const outputs: WorkflowOutput[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    const classType = node.class_type ?? "Unknown";
    const metaTitle = node._meta?.title ?? "";
    const isSaver = IMAGE_SAVERS.has(classType) || VIDEO_SAVERS.has(classType);
    const hasOutputMarker = metaTitle.includes("(Output)");

    if (!isSaver && !hasOutputMarker) continue;

    const title = buildTitle(nodeId, node);
    const label = buildLabel(title);
    const kind = classifyOutputKind(classType);
    const filenamePrefix = typeof node.inputs?.["filename_prefix"] === "string"
      ? node.inputs["filename_prefix"]
      : null;

    outputs.push({ nodeId, title, label, classType, kind, filenamePrefix });
  }
  return outputs;
}

export function inferWorkflowKind(outputs: WorkflowOutput[]): InferredWorkflowKind {
  if (outputs.some((o) => o.kind === "video")) return "video";
  if (outputs.some((o) => o.kind === "image")) return "image";
  return "unknown";
}

export function parseComfyWorkflow(raw: string): ParsedWorkflow | null {
  if (!validateComfyWorkflowJson(raw)) return null;

  const workflow = JSON.parse(raw) as ComfyWorkflowJson;
  const inputs = detectWorkflowInputs(workflow);
  const outputs = detectWorkflowOutputs(workflow);
  const inferredKind = inferWorkflowKind(outputs);
  const nodeCount = Object.keys(workflow).length;

  return { inputs, outputs, inferredKind, nodeCount };
}
