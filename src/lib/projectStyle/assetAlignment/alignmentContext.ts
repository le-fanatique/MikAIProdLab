// ---------------------------------------------------------------------------
// alignmentContext.ts — STYLE.1.F.CORE (Retake Round 1)
//
// Pure. Builds the deterministic context for the explicit "Align with
// Project Style" LLM proposal: Project Story (bounded — read-only narrative
// context, never written back), the Asset's own current fields (the
// baseline the proposal must edit, never invent, and the exact same
// representation the strict parser and Apply compare against — see below),
// and the active Style split into its two pillars plus Asset-applicable
// approved rules (styleContext.ts — the one shared compiler, never a third
// independent one).
//
// Codex Round 1 P1 ("The LLM sees a trimmed/truncated baseline different
// from the baseline it must preserve and that Apply may overwrite"): this
// module used to truncate each Asset field to 2,000 characters while the
// parser/Apply compared against the untrimmed, unbounded DB value — a field
// longer than 2,000 characters could be shown to the model incomplete, and
// Apply would then overwrite the complete field with a reply based on that
// incomplete view. There is now exactly ONE canonical representation of an
// Asset's editable fields, computed once by
// resolveAssetAlignmentOwnership.ts (trimmed, "" for null/empty — never
// truncated) and passed unchanged through context building, the prompt, the
// parser's baseline comparison, and Apply's already-aligned/real-change
// checks. This module never re-bounds or re-trims an Asset field — a field
// that does not fit `MAX_ALIGNMENT_FIELD_LENGTH` must be refused by the
// caller BEFORE this function is ever called
// (`isAssetAlignmentBaselineWithinBounds`, contracts.ts), never silently
// shortened here.
//
// No DB id, secret, URL, clock or mutable provider metadata ever enters
// this context — every field here is either project/asset prose already
// meant for human/LLM reading, or an already-compiled Style text segment.
// Deterministic: the same raw input always produces the exact same bounded
// context, with every empty field/section omitted rather than emitted as
// "(none)" scaffolding (mirrors compileStyleSnapshot's own omission rule).
// ---------------------------------------------------------------------------

import type { AssetAlignmentFieldValues } from "./contracts";

// Bounds are deliberately larger than asset-description-from-context.ts's
// (pitch 200 / story 300 / outline 300): the alignment task must reason
// about concrete world/design logic, not just tone, so it is given more
// Project Story context. Still fixed, documented limits — never unbounded.
// Truncating these is safe: Project Story fields are read-only narrative
// context, never round-tripped back into a write (unlike the Asset's own
// editable fields below).
export const ALIGNMENT_MAX_PITCH_LENGTH = 300;
export const ALIGNMENT_MAX_STORY_LENGTH = 600;
export const ALIGNMENT_MAX_OUTLINE_LENGTH = 600;

export type AssetAlignmentContextInput = {
  project: {
    name: string;
    pitch: string | null;
    story: string | null;
    outline: string | null;
  };
  /** `name`/`type` plus the canonical AssetAlignmentFieldValues — already trimmed/bounded by the caller, never re-bounded here. */
  asset: { name: string; type: string } & AssetAlignmentFieldValues;
  /** From styleContext.ts's compileAssetStyleSegments — already pillar-separated and Asset-filtered. */
  style: { worldSegment: string; visualSegment: string; rulesSegment: string };
};

export type AssetAlignmentContext = {
  project: { name: string; pitch: string | null; story: string | null; outline: string | null };
  asset: { name: string; type: string } & AssetAlignmentFieldValues;
  style: { worldSegment: string; visualSegment: string; rulesSegment: string };
};

function boundedTrim(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** Pure. Same input always yields the exact same context — no DB, no clock, no randomness. Never truncates an Asset field — the caller must refuse before calling this if a field exceeds its bound. */
export function buildAssetAlignmentContext(input: AssetAlignmentContextInput): AssetAlignmentContext {
  return {
    project: {
      name: input.project.name.trim(),
      pitch: boundedTrim(input.project.pitch, ALIGNMENT_MAX_PITCH_LENGTH),
      story: boundedTrim(input.project.story, ALIGNMENT_MAX_STORY_LENGTH),
      outline: boundedTrim(input.project.outline, ALIGNMENT_MAX_OUTLINE_LENGTH),
    },
    asset: {
      name: input.asset.name.trim(),
      type: input.asset.type,
      description: input.asset.description,
      notes: input.asset.notes,
      visualIdentity: input.asset.visualIdentity,
      usageRules: input.asset.usageRules,
      forbiddenVariations: input.asset.forbiddenVariations,
    },
    style: {
      worldSegment: input.style.worldSegment,
      visualSegment: input.style.visualSegment,
      rulesSegment: input.style.rulesSegment,
    },
  };
}
