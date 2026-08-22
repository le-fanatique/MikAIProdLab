// ---------------------------------------------------------------------------
// workflowCatalog.ts — WF.CATALOG.1
//
// Pure module: no "use server", no database access, no React import, no
// network. It only declares the closed vocabulary the future workflow
// gallery will use, and the pure functions that read/write it.
//
// Precedent of shape:
//   - closed-registry validation: src/lib/llmWorkspace/templateStorage.ts
//   - `satisfies Record<Id, ...>` registry: `VARIABLE_REGISTRY`
//     (src/lib/llmWorkspace/variables/registry.ts:2841)
//   - `WORKFLOW_KINDS` as a local `as const` tuple:
//     src/actions/comfyWorkflows.ts:8 (reproduced here rather than imported,
//     since that file is a server action module and this one must stay pure)
//
// Reference for design, not for content: the Comfy-Org/workflow_templates
// catalogue. No workflow from that project is imported — only the principle
// that presentation metadata lives beside the workflow, never inside its
// JSON.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Kinds — mirrors the closed set already enforced by the `comfy_workflows`
// schema and by `WORKFLOW_KINDS` in src/actions/comfyWorkflows.ts.
// ---------------------------------------------------------------------------

export const WORKFLOW_KINDS = ["image", "video"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const WORKFLOW_STATUSES = ["active", "archived"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// ---------------------------------------------------------------------------
// 2.1 — WORKFLOW_CONTEXTS: the closed registry of entry points where a user
// *chooses* a workflow. Exactly six entries (ticket §2.1); do not add a
// seventh without re-auditing every page under src/app/ for a selection
// surface the ticket missed.
// ---------------------------------------------------------------------------

export const WORKFLOW_CONTEXT_IDS = [
  "shot-keyframe",
  "shot-video",
  "asset",
  "storyboard",
  "storyboard-video",
  "look-development",
] as const;

export type WorkflowContextId = (typeof WORKFLOW_CONTEXT_IDS)[number];

export interface WorkflowContextDefinition {
  /** UI label — English, per MikAI's UI language rule. */
  label: string;
  /** The workflow `kind`s this context accepts. */
  kinds: readonly WorkflowKind[];
}

export const WORKFLOW_CONTEXTS = {
  "shot-keyframe": {
    label: "Shot Keyframe",
    kinds: ["image"],
  },
  "shot-video": {
    label: "Shot Video",
    kinds: ["video"],
  },
  asset: {
    label: "Asset",
    kinds: ["image"],
  },
  storyboard: {
    label: "Storyboard",
    kinds: ["image"],
  },
  "storyboard-video": {
    label: "Storyboard Video",
    kinds: ["video"],
  },
  "look-development": {
    label: "Look Development",
    kinds: ["image", "video"],
  },
} as const satisfies Record<WorkflowContextId, WorkflowContextDefinition>;

export function isWorkflowContextId(value: string): value is WorkflowContextId {
  return (WORKFLOW_CONTEXT_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 2.2 — WORKFLOW_CATEGORIES: the closed list of gallery sections.
//
// Derived from the user's own 33 real `comfy_workflows` rows, not inferred
// from the six contexts above — the first version of this registry (five
// categories: keyframe/video/storyboard/look/utility) was inferred without
// data, as the ticket allowed, and flagged as such in the executor report.
// The user then read the real library and found it did not fit: "Look"
// matched no existing workflow, and "Keyframe" would have swallowed about
// twenty unrelated files. Replaced with these eight, validated by the user
// on 2026-08-22, and the real workflow-name groups that justify each one:
//   - "text-to-image"   -> GEMINI_T2I, GPT2_t2I, sdxl txt2image,
//                          Gemini 3pro Image
//   - "image-edit"      -> sdxl_i2i, Extend_Picture_Seedream,
//                          Gemini Banana2 and its variants
//   - "character-props" -> Gemini_CharacterSheet (+ _test), Gemini_PropSheet
//   - "multi-view"       -> MultiView_Qwen, GPT_EnviroMultiView,
//                          GEMINI_EnviroMultiView
//   - "storyboard"       -> GPT_STORYBOARD (+ _demo, + hight),
//                          Make ContactSheet
//   - "video"            -> the five Seedance* workflows
//   - "gaussian-camera"  -> gaussianPLY, GaussianQwen, gaussianQwenLightning
//     — these are Camera Lab's workflows, read by id from
//     `workflowDefaults.gaussianPlyId` / `gaussianToImageId` rather than
//     chosen. Camera Lab is deliberately absent from WORKFLOW_CONTEXTS
//     (ticket §2.1: no selection surface), but its workflows still need a
//     category to appear in the gallery — this is the role "utility"
//     originally played in the inferred list.
//   - "utility"          -> Grid2Batch, Batch2Grid, sdxl switch — real
//     format-conversion plumbing, now that "gaussian-camera" has its own
//     category instead of sharing this catch-all.
// ---------------------------------------------------------------------------

export const WORKFLOW_CATEGORY_IDS = [
  "text-to-image",
  "image-edit",
  "character-props",
  "multi-view",
  "storyboard",
  "video",
  "gaussian-camera",
  "utility",
] as const;

export type WorkflowCategoryId = (typeof WORKFLOW_CATEGORY_IDS)[number];

export const WORKFLOW_CATEGORIES = {
  "text-to-image": { label: "Text to Image" },
  "image-edit": { label: "Image Edit" },
  "character-props": { label: "Character & Props" },
  "multi-view": { label: "Multi-View" },
  storyboard: { label: "Storyboard" },
  video: { label: "Video" },
  "gaussian-camera": { label: "Gaussian / Camera" },
  utility: { label: "Utility" },
} as const satisfies Record<WorkflowCategoryId, { label: string }>;

export function isWorkflowCategoryId(value: string): value is WorkflowCategoryId {
  return (WORKFLOW_CATEGORY_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 2.3 — Parsers. Asymmetric on purpose (ticket §2.3):
//   - `parse*` (read side): tolerant. A corrupt value already in the
//     database degrades cleanly and never throws — a gallery must never
//     refuse to render because one row is corrupt.
//   - `validate*` (write side): strict. The same corrupt inputs are refused
//     explicitly, with a named error, never a silent fallback.
// ---------------------------------------------------------------------------

/**
 * Read-side, tolerant: corrupt JSON, `null`, an empty string, or a non-array
 * shape all degrade to `[]`. Individual non-string or blank entries are
 * dropped rather than failing the whole array.
 */
export function parseWorkflowTags(raw: string | null): string[] {
  if (raw === null || raw.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const tags: string[] = [];
  for (const entry of parsed) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      tags.push(entry.trim());
    }
  }
  return tags;
}

/**
 * Read-side, tolerant: corrupt JSON, `null`, an empty string, or a non-array
 * shape all degrade to `null` — which per `isWorkflowOfferedIn` rule 3 means
 * "offered everywhere the `kind` allows", the pre-migration behaviour.
 * Unknown context ids inside an otherwise valid array are dropped
 * individually rather than failing the whole array.
 *
 * If filtering drops every entry — every id in the stored array is unknown,
 * e.g. a context later renamed or removed from the registry — the result is
 * `null`, not `[]`. Do not "simplify" this to returning the empty array: an
 * empty array means "explicitly offered nowhere" to `isWorkflowOfferedIn`
 * (its `.includes()` check on rule 3 is false for every context), which
 * would silently drop the row from every gallery with no error. A `[]`
 * stored value cannot be legitimate either — `validateWorkflowContexts`
 * refuses an empty array at write time — so encountering `[]` (before or
 * after filtering) here is always corruption, and corruption degrades to
 * "unspecified" (`null`), never to "nowhere" (`[]`).
 */
export function parseWorkflowContexts(raw: string | null): WorkflowContextId[] | null {
  if (raw === null || raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const contexts: WorkflowContextId[] = [];
  for (const entry of parsed) {
    if (typeof entry === "string" && isWorkflowContextId(entry)) {
      contexts.push(entry);
    }
  }
  return contexts.length === 0 ? null : contexts;
}

// ---------------------------------------------------------------------------
// Write side — strict, named errors. Called by the validators the next
// ticket wires into the write path (creating/editing a `comfy_workflows`
// row). Not called anywhere yet in this ticket.
// ---------------------------------------------------------------------------

export type WorkflowCatalogValidationError =
  | { code: "invalid-json"; message: string }
  | { code: "invalid-shape"; message: string }
  | { code: "unknown-context"; message: string; value: string }
  | { code: "duplicate"; message: string; value: string }
  | { code: "empty"; message: string };

export type WorkflowTagsValidationResult =
  | { ok: true; value: string[] | null }
  | { ok: false; error: WorkflowCatalogValidationError };

export type WorkflowContextsValidationResult =
  | { ok: true; value: WorkflowContextId[] | null }
  | { ok: false; error: WorkflowCatalogValidationError };

function failTags(error: WorkflowCatalogValidationError): WorkflowTagsValidationResult {
  return { ok: false, error };
}

function failContexts(error: WorkflowCatalogValidationError): WorkflowContextsValidationResult {
  return { ok: false, error };
}

/**
 * Write-side, strict. `null` (no tags) is valid. Any non-null `raw` must be
 * a JSON array of non-empty, non-duplicate strings — anything else is
 * refused with a named error, never silently coerced.
 */
export function validateWorkflowTags(raw: string | null): WorkflowTagsValidationResult {
  if (raw === null) return { ok: true, value: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failTags({ code: "invalid-json", message: "Tags must be valid JSON." });
  }

  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    return failTags({ code: "invalid-shape", message: "Tags must be a JSON array of strings." });
  }

  const tags = parsed as string[];

  if (tags.length === 0) {
    return failTags({ code: "empty", message: "Tags must not be an empty array — omit the field instead." });
  }

  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length === 0) {
      return failTags({ code: "invalid-shape", message: "Tags must not be blank." });
    }
    if (seen.has(trimmed)) {
      return failTags({ code: "duplicate", message: `Duplicate tag: "${trimmed}".`, value: trimmed });
    }
    seen.add(trimmed);
  }

  return { ok: true, value: tags.map((tag) => tag.trim()) };
}

/**
 * Write-side, strict. `null` (offered everywhere the `kind` allows) is
 * valid. Any non-null `raw` must be a JSON array of known
 * `WorkflowContextId`s, no duplicates, not empty — anything else is refused
 * with a named error.
 */
export function validateWorkflowContexts(raw: string | null): WorkflowContextsValidationResult {
  if (raw === null) return { ok: true, value: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failContexts({ code: "invalid-json", message: "Contexts must be valid JSON." });
  }

  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    return failContexts({ code: "invalid-shape", message: "Contexts must be a JSON array of strings." });
  }

  const contexts = parsed as string[];

  if (contexts.length === 0) {
    return failContexts({ code: "empty", message: "Contexts must not be an empty array — omit the field instead." });
  }

  const seen = new Set<string>();
  for (const context of contexts) {
    if (!isWorkflowContextId(context)) {
      return failContexts({ code: "unknown-context", message: `Unknown context: "${context}".`, value: context });
    }
    if (seen.has(context)) {
      return failContexts({ code: "duplicate", message: `Duplicate context: "${context}".`, value: context });
    }
    seen.add(context);
  }

  return { ok: true, value: contexts as WorkflowContextId[] };
}

// ---------------------------------------------------------------------------
// WF.CATALOG.2 §2.1 — parseTagsInput: the one addition this ticket allows to
// this module. A user types a comma-separated list in a plain text field
// (`storyboard, gemini, rapide`), never JSON. Splits on comma, trims
// whitespace, drops empty entries, and deduplicates case-insensitively while
// keeping the first spelling seen (`Gemini` and `gemini` collapse to
// `Gemini`). Pure; the action serializes the result and passes it through
// `validateWorkflowTags`, which stays the single strict gate.
// ---------------------------------------------------------------------------

export function parseTagsInput(raw: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(trimmed);
  }

  return tags;
}

// ---------------------------------------------------------------------------
// 2.4 — isWorkflowOfferedIn: the single definition of "is this workflow
// offered here". Every page under src/app/ that lists workflows will call
// this instead of reimplementing the filter (next ticket).
// ---------------------------------------------------------------------------

export interface WorkflowOfferInput {
  kind: WorkflowKind;
  /** `null` means "everywhere the `kind` allows" — see `parseWorkflowContexts`. */
  contexts: WorkflowContextId[] | null;
  status: WorkflowStatus;
}

export function isWorkflowOfferedIn(workflow: WorkflowOfferInput, contextId: WorkflowContextId): boolean {
  // Rule 1: an archived workflow is never offered anywhere.
  if (workflow.status !== "active") return false;

  // Rule 2: the workflow's kind must be one this context accepts.
  const context = WORKFLOW_CONTEXTS[contextId];
  if (!(context.kinds as readonly WorkflowKind[]).includes(workflow.kind)) return false;

  // Rule 3: `contexts === null` means "offered everywhere the kind allows"
  // — this is the pre-migration behaviour, and it must stay that way so the
  // migration itself changes nothing visible. Do not invert this check.
  if (workflow.contexts === null) return true;

  return workflow.contexts.includes(contextId);
}
