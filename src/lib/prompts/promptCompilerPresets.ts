// ---------------------------------------------------------------------------
// promptCompilerPresets.ts — Seedance Prompt Compiler presets (PROMPT.COMPILER.2)
//
// Pure, deterministic module: no DB, no LLM call, no browser/network access.
// Defines the four MVP presets, their Required/Recommended/Optional source
// groups (on top of the canonical buildPromptCompilationContext contract),
// the requirement validation that gates "Generate Draft", a deterministic
// fingerprint used for staleness detection, and small pure helpers (draft
// text cleanup, user-message formatting) shared by the server action and
// its tests.
// ---------------------------------------------------------------------------

import type {
  PromptCompilationContext,
  PromptCompilationSourceFlags,
} from "./buildPromptCompilationContext";
import {
  isFirstFrameRole,
  isLastFrameRole,
} from "@/lib/referenceImageRoles";

// REFROLE.MVP.1 — isFirstFrameRole/isLastFrameRole now live in the shared
// reference-image role catalogue (src/lib/referenceImageRoles.ts) and are
// re-exported here unchanged so every existing import site
// (e.g. src/lib/comfy/workflowProfiles.ts) keeps working without edits —
// one role contract, never two contradictory ones.
export { isFirstFrameRole, isLastFrameRole };

export type PromptCompilerPresetId =
  | "text-to-video"
  | "animate-keyframe"
  | "prompt-timeline"
  | "reference-to-video"
  | "first-last-frame";

/** The four optional source groups a user can toggle, on top of the always-included `shot` group. */
export type PromptCompilerSourceId =
  | "casting"
  | "assetBibles"
  | "references"
  | "sequenceContext"
  | "projectContext";

export const PROMPT_COMPILER_SOURCE_IDS: readonly PromptCompilerSourceId[] = [
  "casting",
  "assetBibles",
  "references",
  "sequenceContext",
  "projectContext",
];

/**
 * "required": checked, not decheckable while this preset is selected.
 * "recommended": checked by default, user may uncheck.
 * "optional": unchecked by default, user may check.
 * "excluded": never sent for this preset — forced unchecked, not decheckable
 * (e.g. Text-to-Video never sends images to the LLM).
 */
export type PromptCompilerSourceRequirement =
  | "required"
  | "recommended"
  | "optional"
  | "excluded";

export type PromptCompilerPreset = {
  id: PromptCompilerPresetId;
  label: string;
  description: string;
  sources: Record<PromptCompilerSourceId, PromptCompilerSourceRequirement>;
  /** Preset-specific instructions appended to the shared system prompt. English only. */
  instructions: string;
};

export const PROMPT_COMPILER_PRESETS: Record<PromptCompilerPresetId, PromptCompilerPreset> = {
  "text-to-video": {
    id: "text-to-video",
    label: "Text-to-Video",
    description:
      "Generate a video draft from narrative Shot context alone. No image is sent to the model.",
    sources: {
      casting: "recommended",
      assetBibles: "recommended",
      references: "excluded",
      sequenceContext: "recommended",
      projectContext: "optional",
    },
    instructions:
      "Preset: Text-to-Video. Write a single continuous video generation prompt " +
      "describing the shot's action across its full duration, using only the " +
      "Shot, casting and Asset Bible context provided. No reference image " +
      "exists for this preset — never mention or reference an @ImageN tag.",
  },
  "animate-keyframe": {
    id: "animate-keyframe",
    label: "Animate Keyframe",
    description:
      "Generate a video draft that animates a selected keyframe image using the shot's action and duration.",
    sources: {
      casting: "optional",
      assetBibles: "recommended",
      references: "required",
      sequenceContext: "optional",
      projectContext: "optional",
    },
    instructions:
      "Preset: Animate Keyframe. Describe the motion and action that should " +
      "animate the provided keyframe reference image into a short video, " +
      "using the Shot's action, camera and duration context. Reference the " +
      "keyframe explicitly by its exact tag (e.g. @Image1). Do not invent " +
      "content not visible in the keyframe or not present in the Shot context.",
  },
  "prompt-timeline": {
    id: "prompt-timeline",
    label: "Prompt Timeline",
    description:
      "Generate a video draft from the shot's existing timed Prompt Segments. No new timing is invented.",
    sources: {
      casting: "optional",
      assetBibles: "optional",
      references: "excluded",
      sequenceContext: "optional",
      projectContext: "optional",
    },
    instructions:
      "Preset: Prompt Timeline. Combine the Shot Prompt/action with the " +
      "provided Timeline segments — using their exact existing time codes — " +
      "into a single generation prompt describing the whole shot in order. " +
      "Never invent new time codes, never merge or split existing segments, " +
      "and never add a segment that was not provided.",
  },
  "reference-to-video": {
    id: "reference-to-video",
    label: "Reference-to-Video",
    description:
      "Generate a video draft from selected reference images, in their exact selection order.",
    sources: {
      casting: "optional",
      assetBibles: "recommended",
      references: "required",
      sequenceContext: "optional",
      projectContext: "optional",
    },
    instructions:
      "Preset: Reference-to-Video. Describe how the provided reference " +
      "images combine into a coherent video, respecting their exact given " +
      "order and their role/variant/usage notes when present. Reference " +
      "every provided tag (e.g. @Image1, @Image2, ...) by its exact tag. " +
      "Never invent an image, role, or reference that was not provided.",
  },
  "first-last-frame": {
    id: "first-last-frame",
    label: "First/Last Frame",
    description:
      "Generate a video draft describing the transformation from a First Frame reference to a Last Frame reference.",
    sources: {
      casting: "optional",
      assetBibles: "recommended",
      references: "required",
      sequenceContext: "optional",
      projectContext: "optional",
    },
    instructions:
      "Preset: First/Last Frame. Describe the transformation across the " +
      "shot's duration from the exact First Frame reference to the exact " +
      "Last Frame reference, respecting their exact tags (e.g. @Image1 for " +
      "the First Frame, @Image2 for the Last Frame, in the order provided). " +
      "Never invent, swap, or duplicate either frame; the two frames must " +
      "always remain distinct.",
  },
};

export function getPromptCompilerPreset(id: PromptCompilerPresetId): PromptCompilerPreset {
  return PROMPT_COMPILER_PRESETS[id];
}

/** Default checkbox state for a preset before any user interaction. */
export function getDefaultSourceFlags(
  preset: PromptCompilerPreset
): PromptCompilationSourceFlags {
  const flags = {} as PromptCompilationSourceFlags;
  for (const id of PROMPT_COMPILER_SOURCE_IDS) {
    const req = preset.sources[id];
    flags[id] = req === "required" || req === "recommended";
  }
  return flags;
}

/** Whether a source's checkbox must stay disabled (its state is fixed by the preset). */
export function isSourceLocked(
  preset: PromptCompilerPreset,
  sourceId: PromptCompilerSourceId
): boolean {
  const req = preset.sources[sourceId];
  return req === "required" || req === "excluded";
}

/**
 * Resolves the final flags actually sent to buildPromptCompilationContext:
 * required/excluded sources are forced regardless of user input; recommended/
 * optional sources use the user's current checkbox state (falling back to
 * the preset default when absent). Pure — never mutates userFlags.
 */
export function resolveEffectiveSourceFlags(
  preset: PromptCompilerPreset,
  userFlags: Partial<PromptCompilationSourceFlags>
): PromptCompilationSourceFlags {
  const result = {} as PromptCompilationSourceFlags;
  for (const id of PROMPT_COMPILER_SOURCE_IDS) {
    const req = preset.sources[id];
    if (req === "required") result[id] = true;
    else if (req === "excluded") result[id] = false;
    else result[id] = userFlags[id] ?? req === "recommended";
  }
  return result;
}

/** Role strings that count as a keyframe/first-frame reference, matched case-insensitively. Never auto-assigned — only ever compared against a role the caller already set. */
const KEYFRAME_ROLE_ALIASES = new Set(["keyframe", "first frame", "first_frame", "firstframe"]);

function isKeyframeRole(role: string | null): boolean {
  if (!role) return false;
  return KEYFRAME_ROLE_ALIASES.has(role.trim().toLowerCase());
}

function hasValidDuration(context: PromptCompilationContext): boolean {
  const duration = context.shot.durationSeconds;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0;
}

const DURATION_MISSING_MESSAGE =
  "A valid Shot duration (greater than zero) is required to generate a draft.";

/**
 * Content-based "Generate Draft" gate. Runs against the already-normalized
 * context (never against raw DB rows), so it reflects exactly what would be
 * sent to the LLM. Every preset requires a valid Shot duration, plus one
 * preset-specific headline requirement — the requirement named first in
 * each preset's rules. Never fabricates or auto-selects a missing source.
 */
export function validatePresetRequirements(
  presetId: PromptCompilerPresetId,
  context: PromptCompilationContext
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];

  if (!hasValidDuration(context)) {
    missing.push(DURATION_MISSING_MESSAGE);
  }

  switch (presetId) {
    case "text-to-video":
      if (!context.shot.shotPrompt && !context.shot.description && !context.shot.actionPitch) {
        missing.push(
          "Text-to-Video requires a Shot Prompt, a Description, or an Action pitch."
        );
      }
      break;
    case "animate-keyframe":
      if (!context.references.some((r) => isKeyframeRole(r.role))) {
        missing.push(
          "Animate Keyframe requires a selected reference image with an existing " +
            '"keyframe" or "first frame" role. Character/Environment references alone are not accepted.'
        );
      }
      break;
    case "prompt-timeline":
      if (!context.shot.hasPromptSegments || !context.shot.compiledPromptSegments) {
        missing.push("Prompt Timeline requires existing Prompt Segments on this shot.");
      }
      break;
    case "reference-to-video":
      if (context.references.length === 0) {
        missing.push("Reference-to-Video requires at least one selected reference image.");
      }
      break;
    case "first-last-frame": {
      const firstFrameRef = context.references.find((r) => isFirstFrameRole(r.role));
      const lastFrameRef = context.references.find((r) => isLastFrameRole(r.role));
      if (!firstFrameRef) {
        missing.push(
          'First/Last Frame requires a selected reference image with an existing "First Frame" role.'
        );
      }
      if (!lastFrameRef) {
        missing.push(
          'First/Last Frame requires a selected reference image with an existing "Last Frame" role.'
        );
      }
      if (firstFrameRef && lastFrameRef && firstFrameRef.refId === lastFrameRef.refId) {
        missing.push(
          "First/Last Frame requires two distinct references — the same image cannot serve as both the First Frame and the Last Frame."
        );
      }
      break;
    }
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}

/**
 * Deterministic fingerprint of everything that determines a draft's
 * content: preset, effective source flags, and the normalized context
 * (which itself already encodes reference order, casting, Asset Bibles and
 * enabled context). Any change to any of these changes the fingerprint —
 * used purely for client-side staleness comparison, never persisted to DB.
 */
export function computePromptCompilerFingerprint(
  presetId: PromptCompilerPresetId,
  sourceFlags: PromptCompilationSourceFlags,
  context: PromptCompilationContext
): string {
  return JSON.stringify({ presetId, sourceFlags, context });
}

/**
 * Strips a single leading/trailing Markdown code fence the model may have
 * wrapped the draft in, without reformulating or altering the content
 * itself. Returns the trimmed text (never fabricates content).
 */
export function cleanDraftText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:[a-zA-Z0-9_-]*)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

function joinNonEmpty(values: (string | null | undefined)[], sep: string): string | null {
  const parts = values.filter((v): v is string => Boolean(v && v.trim()));
  return parts.length > 0 ? parts.join(sep) : null;
}

/**
 * Formats the normalized context into the exact user-message text sent to
 * the LLM. Deterministic and pure: same context always produces the same
 * string. Never includes an empty section.
 */
export function buildPromptCompilerUserMessage(context: PromptCompilationContext): string {
  const parts: string[] = [];

  const shotLines: string[] = [];
  if (context.shot.title) shotLines.push(`Title: ${context.shot.title}`);
  if (context.shot.durationSeconds !== null) {
    shotLines.push(`Duration: ${context.shot.durationSeconds}s`);
  }
  if (context.shot.shotPrompt) shotLines.push(`Shot Prompt: ${context.shot.shotPrompt}`);
  if (context.shot.description) shotLines.push(`Description: ${context.shot.description}`);
  if (context.shot.actionPitch) shotLines.push(`Action: ${context.shot.actionPitch}`);
  if (context.shot.cameraPitch) shotLines.push(`Camera: ${context.shot.cameraPitch}`);
  if (context.shot.compiledPromptSegments) {
    shotLines.push(`Timeline (existing, exact time codes):\n${context.shot.compiledPromptSegments}`);
  }
  if (shotLines.length > 0) parts.push(`Shot:\n${shotLines.join("\n")}`);

  if (context.castAssets.length > 0) {
    const lines = context.castAssets.map((c) => {
      const bits = joinNonEmpty([c.assetName, c.assetType ? `(${c.assetType})` : null, c.description, c.notes], " ");
      return `- ${bits}`;
    });
    parts.push(`Casting:\n${lines.join("\n")}`);
  }

  if (context.references.length > 0) {
    const lines = context.references.map((r) => {
      const bits = joinNonEmpty([r.tag, r.label, r.role, r.variantState, r.usageNotes], " — ");
      return `- ${bits}`;
    });
    parts.push(`References (exact order):\n${lines.join("\n")}`);
  }

  if (context.assetBibles.length > 0) {
    const lines = context.assetBibles.map((b) => {
      const bits = joinNonEmpty([b.assetName, b.visualIdentity, b.usageRules, b.forbiddenVariations], " | ");
      return `- ${bits}`;
    });
    parts.push(`Asset Bibles:\n${lines.join("\n")}`);
  }

  if (context.sequenceContext) {
    const c = context.sequenceContext;
    const line = joinNonEmpty([c.title, c.summary, c.mood, c.locationHint, c.narrativePurpose], "\n");
    if (line) parts.push(`Sequence Context:\n${line}`);
  }

  if (context.projectContext) {
    const c = context.projectContext;
    const line = joinNonEmpty([c.name, c.pitch, c.story], "\n");
    if (line) parts.push(`Project Context:\n${line}`);
  }

  return parts.join("\n\n");
}
