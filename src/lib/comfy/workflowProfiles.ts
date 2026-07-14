// ---------------------------------------------------------------------------
// workflowProfiles.ts — Lightweight Seedance workflow profile metadata
// (GEN.SEEDANCE.2).
//
// Pure, deterministic module: no DB, no browser, no network, no LLM call.
// Never rewrites the stored ComfyUI workflow JSON. Resolves a profile only
// from a stable, explicit signature already present in the workflow JSON
// (a node's class_type — never the mutable `name`/`description` DB fields,
// never a raw DB id, never the `kind` field alone). A workflow with no
// matching signature is "generic" (`null` profile) and receives no
// specialized validation — the existing generic path is untouched.
//
// A resolved WorkflowProfile is a STABLE, STATIC contract — the audited
// expectation of what this profile's workflow should look like (e.g. "has
// a Text Prompt input", "accepts 1 image"). It is never re-derived from
// whatever the current workflow JSON happens to contain: if a required
// node goes missing or a workflow is edited to no longer match its own
// profile, that is a diagnosable *mismatch* (warning/blocking), never a
// silently downgraded `false` capability that makes the diagnostic vanish.
// auditWorkflowNodes() computes the *actual* current node state separately,
// and diagnoseWorkflowGeneration() compares expected vs. actual.
//
// Reuses parseWorkflow.ts's ParsedWorkflow/WorkflowInput and
// buildGenerationPayload.ts's detectDynamicBatchUiInfo directly — this
// module never re-implements node/title parsing or Dynamic Batch
// detection.
// ---------------------------------------------------------------------------

import type { ParsedWorkflow } from "./parseWorkflow";
import { detectDynamicBatchUiInfo } from "./buildGenerationPayload";
import type { PromptCompilerPresetId } from "@/lib/prompts/promptCompilerPresets";
import { PROMPT_COMPILER_PRESETS } from "@/lib/prompts/promptCompilerPresets";

export type WorkflowEngine = "seedance";

export type WorkflowGenerationMode =
  | "text-to-video"
  | "animate-keyframe"
  | "prompt-timeline"
  | "reference-to-video"
  | "generic";

export type WorkflowProductionTier = "draft" | "standard" | "pro";

export type WorkflowSupportedInputs = {
  textPrompt: boolean;
  dynamicImages: boolean;
  /** Always false in this ticket — full First/Last Frame support is GEN.SEEDANCE.3, never claimed early. */
  firstFrame: boolean;
  lastFrame: boolean;
  referenceVideo: boolean;
  referenceAudio: boolean;
};

export type WorkflowLimits = {
  /** Max images this workflow can accept, however supplied (fixed Load Image slots or Dynamic Batch selection). 0 = no image input at all. */
  images: number;
  /** Max reference video inputs. 0 = none. */
  videos: number;
  /** Max reference audio inputs. 0 = none. */
  audio: number;
};

export type WorkflowProfile = {
  /** Stable, engine-derived identifier — never a DB id. */
  id: string;
  /** English UI label. */
  label: string;
  engine: WorkflowEngine;
  generationMode: WorkflowGenerationMode;
  productionTier: WorkflowProductionTier;
  /** The stable, EXPECTED capability contract for this profile — never re-derived per call, see module doc comment. */
  supportedInputs: WorkflowSupportedInputs;
  /** The stable, EXPECTED limits for this profile. */
  limits: WorkflowLimits;
  /** Prompt Compiler preset ids this profile's generation mode is compatible with. */
  compatiblePresetIds: PromptCompilerPresetId[];
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type RawComfyNode = { class_type?: string };
type RawComfyWorkflowJson = Record<string, RawComfyNode>;

/**
 * Scans the raw stored JSON for a node with an exact class_type match.
 * Deliberately does not reuse parseComfyWorkflow: that helper only surfaces
 * nodes whose _meta.title contains "(Input)"/"(Output)", but an engine node
 * like ByteDanceImageToVideoNode carries no such marker — it is the
 * generation node itself, not a runtime-editable input/output. Read-only;
 * never mutates or rewrites the JSON.
 */
function hasNodeWithClassType(workflowJson: string, classType: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(workflowJson);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  return Object.values(parsed as RawComfyWorkflowJson).some(
    (node) => node && typeof node === "object" && node.class_type === classType
  );
}

const BYTEDANCE_IMAGE_TO_VIDEO_CLASS_TYPE = "ByteDanceImageToVideoNode";

/**
 * The only profile currently backed by a real, audited workflow in the
 * Library (see the Claude report for the audit): SeedanceLow, driven by a
 * ByteDanceImageToVideoNode (Seedance's image-to-video ComfyUI custom
 * node), fed by exactly one "Load Image (Input)" and one
 * "Text Prompt (Input)", with no Dynamic Batch, no First/Last Frame
 * markers, and no reference video/audio input — i.e. the "Animate
 * Keyframe" generation mode.
 *
 * These `supportedInputs`/`limits` values are the STABLE EXPECTATION for
 * any workflow that resolves to this profile — they describe what a
 * well-formed ByteDanceImageToVideoNode-driven workflow should have, per
 * the audit, not what a particular instance's JSON currently parses to.
 * auditWorkflowNodes() reports the actual, current state separately, and
 * diagnoseWorkflowGeneration() flags any mismatch explicitly.
 *
 * No other engine signature is resolved here: no other real workflow in
 * the current Library carries an unambiguous, stable Seedance signature
 * (audited — see report). Adding more signatures without a real workflow
 * to verify them against would violate the ticket's conservative-resolution
 * requirement, so none are added speculatively.
 */
const SEEDANCE_IMAGE_TO_VIDEO_PROFILE: WorkflowProfile = {
  id: "seedance-image-to-video",
  label: "Seedance — Image to Video",
  engine: "seedance",
  generationMode: "animate-keyframe",
  productionTier: "standard",
  supportedInputs: {
    textPrompt: true,
    dynamicImages: false,
    firstFrame: false,
    lastFrame: false,
    referenceVideo: false,
    referenceAudio: false,
  },
  limits: {
    images: 1,
    videos: 0,
    audio: 0,
  },
  compatiblePresetIds: ["animate-keyframe"],
};

/**
 * Resolves a workflow's profile purely from a stable signature already
 * present in its stored JSON. Returns null (generic workflow, no
 * specialized validation) when no known signature matches — never guesses,
 * never infers a Seedance capability from the free-text `kind` field alone.
 * Returns the same stable profile object regardless of the workflow's
 * current parsed state (see module doc comment) — never mutated by callers.
 */
export function resolveWorkflowProfile(workflowJson: string): WorkflowProfile | null {
  if (!hasNodeWithClassType(workflowJson, BYTEDANCE_IMAGE_TO_VIDEO_CLASS_TYPE)) {
    return null;
  }
  return {
    ...SEEDANCE_IMAGE_TO_VIDEO_PROFILE,
    supportedInputs: { ...SEEDANCE_IMAGE_TO_VIDEO_PROFILE.supportedInputs },
    limits: { ...SEEDANCE_IMAGE_TO_VIDEO_PROFILE.limits },
    compatiblePresetIds: [...SEEDANCE_IMAGE_TO_VIDEO_PROFILE.compatiblePresetIds],
  };
}

// ---------------------------------------------------------------------------
// Actual node state audit — compares against the profile's stable expectation
// ---------------------------------------------------------------------------

export type WorkflowNodeState = {
  hasTextPromptNode: boolean;
  imageInputCount: number;
  dynamicBatchPresent: boolean;
};

/**
 * Reads the workflow's *current*, real node state — reusing parseWorkflow's
 * already-parsed inputs and buildGenerationPayload's Dynamic Batch
 * detection directly, never re-implementing either. This is the "actual"
 * half of the expected/actual comparison diagnoseWorkflowGeneration()
 * performs against a resolved profile's stable `supportedInputs`/`limits`.
 */
export function auditWorkflowNodes(workflowJson: string, parsed: ParsedWorkflow): WorkflowNodeState {
  return {
    hasTextPromptNode: parsed.inputs.some(
      (i) => i.kind === "text" && i.label.trim().toLowerCase() === "text prompt"
    ),
    imageInputCount: parsed.inputs.filter((i) => i.kind === "image").length,
    dynamicBatchPresent: detectDynamicBatchUiInfo(workflowJson).kind === "ready",
  };
}

// ---------------------------------------------------------------------------
// Runtime diagnostics
// ---------------------------------------------------------------------------

export type WorkflowGenerationDiagnosticSeverity = "warning" | "blocking";

export type WorkflowGenerationDiagnostic = {
  severity: WorkflowGenerationDiagnosticSeverity;
  /** English, UI-facing. */
  message: string;
};

export type WorkflowGenerationDiagnosticInput = {
  profile: WorkflowProfile | null;
  /** The workflow's actual, currently-detected node state — see auditWorkflowNodes(). Ignored when profile is null. */
  nodeState: WorkflowNodeState;
  /** The Prompt Compiler preset currently active for this generation, if any (e.g. via a PROMPT.COMPILER.3 handoff). Not a real preset id -> treated as unknown, never crashes — and never treated as a match via inherited/prototype keys (see sanitization below). */
  presetId: string | null;
  /** Whether the workflow's resolved Text Prompt (Input) currently has a non-empty effective value. */
  hasTextPromptValue: boolean;
  /** Count of distinct image input nodes that currently have a selection (excludes Dynamic Batch template-chain nodes, counted separately below). */
  selectedImageCount: number;
  dynamicBatchActive: boolean;
  dynamicBatchSelectedCount: number;
};

export type WorkflowGenerationDiagnosticsResult = {
  /** Deterministic, ordered. */
  diagnostics: WorkflowGenerationDiagnostic[];
  /** True whenever any diagnostic is "blocking" — Generate must be disabled. */
  blocked: boolean;
};

/**
 * Own-property preset lookup — `in`/plain indexing would also match
 * inherited Object.prototype keys such as "__proto__", "constructor" or
 * "toString", letting a malformed sessionStorage value be treated as a
 * "known" preset and then crash when compatiblePresetIds.includes() (or
 * any other real-preset-only logic) is reached. Object.hasOwn is immune:
 * it only ever matches a key actually defined on PROMPT_COMPILER_PRESETS.
 */
function isKnownPresetId(value: string): value is PromptCompilerPresetId {
  return Object.hasOwn(PROMPT_COMPILER_PRESETS, value);
}

/**
 * Pure diagnostic gate. Generic workflows (`profile === null`) receive no
 * specialized validation at all — the existing generic path is untouched.
 * Never mutates selections, tags, Dynamic Batch state or the stored JSON;
 * only reports. Never treats an inherited/prototype key (e.g. "__proto__")
 * as a known preset — such a value always produces the same "unknown
 * preset" warning as any other unrecognized string, never a crash.
 */
export function diagnoseWorkflowGeneration(
  input: WorkflowGenerationDiagnosticInput
): WorkflowGenerationDiagnosticsResult {
  if (!input.profile) {
    return { diagnostics: [], blocked: false };
  }

  const { profile, nodeState } = input;
  const diagnostics: WorkflowGenerationDiagnostic[] = [];

  if (input.presetId !== null) {
    if (!isKnownPresetId(input.presetId)) {
      diagnostics.push({
        severity: "warning",
        message: `Unknown preset "${input.presetId}" — compatibility with this workflow could not be verified.`,
      });
    } else if (!profile.compatiblePresetIds.includes(input.presetId)) {
      diagnostics.push({
        severity: "blocking",
        message: `The "${input.presetId}" preset is not compatible with this workflow's "${profile.generationMode}" generation mode.`,
      });
    }
  }

  // Expected vs. actual — a profile that expects a Text Prompt node but no
  // longer has one (workflow edited/broken) is a structural mismatch, not
  // a silently-downgraded capability. Blocking: without the node, a
  // compiled prompt has nowhere real to go.
  if (profile.supportedInputs.textPrompt && !nodeState.hasTextPromptNode) {
    diagnostics.push({
      severity: "blocking",
      message:
        'This workflow profile expects a "Text Prompt (Input)" node, but none was found. ' +
        "The workflow may have been edited or renamed.",
    });
  } else if (profile.supportedInputs.textPrompt && !input.hasTextPromptValue) {
    diagnostics.push({
      severity: "warning",
      message: "This workflow expects a Text Prompt, but none is currently set.",
    });
  }

  // Expected vs. actual image node count — a structural drift from the
  // audited profile (extra or missing Load Image nodes), reported as a
  // warning rather than blocking: the workflow may still function.
  if (!nodeState.dynamicBatchPresent && nodeState.imageInputCount !== profile.limits.images) {
    diagnostics.push({
      severity: "warning",
      message:
        `This workflow's profile expects ${profile.limits.images} image input` +
        `${profile.limits.images === 1 ? "" : "s"}, but ${nodeState.imageInputCount} ` +
        `${nodeState.imageInputCount === 1 ? "is" : "are"} currently present.`,
    });
  }

  const effectiveImageCount = input.dynamicBatchActive
    ? input.dynamicBatchSelectedCount
    : input.selectedImageCount;

  if (profile.limits.images > 0 && effectiveImageCount > profile.limits.images) {
    diagnostics.push({
      severity: "blocking",
      message:
        `This workflow accepts at most ${profile.limits.images} ` +
        `image${profile.limits.images === 1 ? "" : "s"}, but ${effectiveImageCount} ` +
        `${effectiveImageCount === 1 ? "is" : "are"} currently selected.`,
    });
  }

  if (input.dynamicBatchActive && !profile.supportedInputs.dynamicImages) {
    diagnostics.push({
      severity: "warning",
      message: "This workflow has a Dynamic Batch input that is not declared as supported by its profile.",
    });
  }

  return {
    diagnostics,
    blocked: diagnostics.some((d) => d.severity === "blocking"),
  };
}
