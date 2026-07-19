type ComfyNode = {
  class_type?: string;
  _meta?: {
    title?: string;
  };
  inputs?: Record<string, unknown>;
};

type ComfyWorkflowJson = Record<string, ComfyNode>;

export type WorkflowInputKind =
  | "text"
  | "image"
  | "video"
  | "integer"
  | "float"
  | "boolean"
  | "select"
  | "seed"
  | "string"
  | "unknown";

export type WorkflowOutputKind = "image" | "video" | "unknown";
export type InferredWorkflowKind = "image" | "video" | "unknown";

export type WorkflowInput = {
  nodeId: string;
  title: string;
  label: string;
  classType: string;
  kind: WorkflowInputKind;
  defaultValue: string | null;
  inputOptions?: string[];
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

// Returns the "primary" scalar value from a node's inputs object.
// Checks common key names used by ComfyUI primitive nodes.
function getPrimaryInputValue(inputs: Record<string, unknown>): unknown {
  if ("value" in inputs) return inputs["value"];
  if ("text" in inputs) return inputs["text"];
  if ("prompt" in inputs) return inputs["prompt"];
  if ("string" in inputs) return inputs["string"];
  return undefined;
}

function classifyInputKind(
  classType: string,
  title: string,
  inputs: Record<string, unknown>
): WorkflowInputKind {
  // Image — checked before text to avoid false matches
  if (classType === "LoadImage" || /Image.*Load|Load.*Image/i.test(classType)) return "image";

  // SHOT.VIDEO.LIBRARY.1, Lot C — video, mirroring the image rule above
  // structurally (never a workflow-name-based profile). As of this ticket
  // no workflow in this app's library actually has a node matching this —
  // both "video"-kind workflows found in the DB (SeedanceLow/SeedanceMid)
  // are image-to-video *generators* (their own input is `LoadImage`, only
  // their *output* is video); see claude_report.md for the full audit.
  // This rule exists so a REAL video-input node (e.g. a future
  // `LoadVideo`/`VHS_LoadVideo`-class node) is picked up automatically the
  // day one is added, without a second detection pass.
  if (classType === "LoadVideo" || /Video.*Load|Load.*Video/i.test(classType)) return "video";

  // Text — PrimitiveStringMultiline exact match, then broad pattern
  if (classType === "PrimitiveStringMultiline" || /Text|String/i.test(classType)) return "text";

  // Haystack for pattern matching on the rest
  const haystack = `${classType} ${title}`.toLowerCase();

  // Seed before integer — seed is a specialised integer with randomisation semantics
  if (haystack.includes("seed")) return "seed";

  // Boolean
  if (/bool(ean)?/i.test(classType)) return "boolean";

  // Integer — "INT", "INTEGER", "PrimitiveInt", any classType containing "int"
  if (/int(eger)?/i.test(classType)) return "integer";

  // Float
  if (/float|real/i.test(classType)) return "float";

  // Select / COMBO dropdown
  if (classType === "COMBO" || /combo/i.test(classType)) return "select";

  // Value-based fallback when classType gives no clear signal
  const primary = getPrimaryInputValue(inputs);
  if (typeof primary === "boolean") return "boolean";
  if (typeof primary === "number") return Number.isInteger(primary) ? "integer" : "float";
  if (typeof primary === "string") return "string";

  return "unknown";
}

function extractDefaultValue(
  kind: WorkflowInputKind,
  classType: string,
  inputs: Record<string, unknown>
): string | null {
  if (kind === "image" || kind === "video") return null;

  // Preserve existing behaviour: only PrimitiveStringMultiline yields a default for text
  if (kind === "text") {
    if (classType === "PrimitiveStringMultiline") {
      const val = inputs["value"];
      return typeof val === "string" ? val : null;
    }
    return null;
  }

  const primary = getPrimaryInputValue(inputs);

  if (kind === "seed" || kind === "integer") {
    if (typeof primary === "number") return String(Math.trunc(primary));
    if (typeof primary === "string" && /^-?\d+$/.test(primary.trim())) return primary.trim();
    return null;
  }

  if (kind === "float") {
    if (typeof primary === "number") return String(primary);
    if (typeof primary === "string" && primary.trim() !== "" && !isNaN(parseFloat(primary))) {
      return primary.trim();
    }
    return null;
  }

  if (kind === "boolean") {
    if (typeof primary === "boolean") return primary ? "true" : "false";
    if (primary === "true" || primary === "false") return String(primary);
    return null;
  }

  if (kind === "select") {
    // COMBO nodes store options as an array in inputs.value; first element is the default
    const rawValue = inputs["value"];
    if (Array.isArray(rawValue)) {
      const first = rawValue[0];
      return typeof first === "string" && first.trim() ? first.trim() : null;
    }
    return typeof primary === "string" && primary.trim() ? primary.trim() : null;
  }

  if (kind === "string") {
    return typeof primary === "string" && primary.trim() ? primary.trim() : null;
  }

  // unknown — best-effort
  if (typeof primary === "string") return primary;
  if (typeof primary === "number" || typeof primary === "boolean") return String(primary);
  return null;
}

function extractInputOptions(
  kind: WorkflowInputKind,
  inputs: Record<string, unknown>
): string[] | undefined {
  if (kind !== "select") return undefined;
  const rawValue = inputs["value"];
  if (!Array.isArray(rawValue)) return undefined;
  const options = rawValue
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return options.length > 0 ? options : undefined;
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
    const safeInputs = node.inputs ?? {};
    const kind = classifyInputKind(classType, title, safeInputs);
    const defaultValue = extractDefaultValue(kind, classType, safeInputs);
    const inputOptions = extractInputOptions(kind, safeInputs);

    const entry: WorkflowInput = { nodeId, title, label, classType, kind, defaultValue };
    if (inputOptions !== undefined) entry.inputOptions = inputOptions;
    inputs.push(entry);
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
