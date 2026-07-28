import type { LLMPrompt } from "@/types/llm";
import type { AssetAlignmentContext } from "@/lib/projectStyle/assetAlignment/alignmentContext";

// ---------------------------------------------------------------------------
// asset-alignment-from-context.ts — STYLE.1.F.CORE
//
// Pure prompt builder for the explicit "Align with Project Style" proposal.
// Mirrors asset-description-from-context.ts / asset-bible-from-context.ts's
// conventions (pure function, LLMPrompt shape, English system prompt,
// strict JSON contract, empty sections omitted) but is NOT Style-aware in
// the conditional sense those two are — this action refuses before it is
// ever called if there is no active Style (see the orchestration layer), so
// the Style section here is always populated.
//
// The JSON schema uses snake_case field names, matching the raw LLM JSON
// convention used by every other prompt builder in this directory. The
// strict parser (validateProposal.ts) maps them back onto the camelCase
// AssetAlignmentEditableField enum.
// ---------------------------------------------------------------------------

const JSON_CONSTRAINT = `Always respond with a valid JSON object matching exactly one of these two shapes — no other shape, no markdown, no explanation, only the JSON object:

Shape A — the Asset needs changes to align with the Project Style:
{
  "outcome": "changes-proposed",
  "fields": {
    "description": "<full proposed description, or the unchanged current value for a field you are not changing>",
    "notes": "<full proposed notes, or the unchanged current value>",
    "visual_identity": "<full proposed visual identity, or the unchanged current value>",
    "usage_rules": "<full proposed usage rules, or the unchanged current value>",
    "forbidden_variations": "<full proposed forbidden variations, or the unchanged current value>"
  },
  "assessment": "<one concise paragraph summarizing what changed and why>",
  "design_changes": [
    {
      "field": "description" | "notes" | "visual_identity" | "usage_rules" | "forbidden_variations",
      "current_basis": "<the specific current design detail this change replaces or refines>",
      "proposed_decision": "<the specific new design decision — a concrete change to silhouette, material, function, construction, iconography or behavioral constraint; NEVER a purely descriptive/rendering word like cinematic, painterly, high-contrast or warm lighting with no underlying design change>",
      "style_basis": "<the specific Project Style content (World & Design Language, Visual Treatment or an approved rule) this decision is grounded in>"
    }
  ]
}
At least one field in "fields" must differ from its current value, and "design_changes" must contain at least one entry for each field you actually changed (and no entry for a field you left unchanged).

Shape B — the Asset already reflects the Project Style, nothing to change:
{
  "outcome": "already-aligned",
  "fields": {
    "description": "<the exact current value, unchanged>",
    "notes": "<the exact current value, unchanged>",
    "visual_identity": "<the exact current value, unchanged>",
    "usage_rules": "<the exact current value, unchanged>",
    "forbidden_variations": "<the exact current value, unchanged>"
  },
  "assessment": "<one concise paragraph explaining why the Asset already fits>"
}
Every value in "fields" must be byte-identical to the Asset's current value. Do not include "design_changes" in this shape.`;

export function buildAssetAlignmentPrompt(context: AssetAlignmentContext): LLMPrompt {
  const lines: string[] = [];

  lines.push(`Project: ${context.project.name}`);
  if (context.project.pitch) lines.push(`Pitch: ${context.project.pitch}`);
  if (context.project.story) lines.push(`Story: ${context.project.story}`);
  if (context.project.outline) lines.push(`Outline: ${context.project.outline}`);

  lines.push(`\nAsset: ${context.asset.name}`);
  lines.push(`Type: ${context.asset.type}`);
  lines.push(`Current description: ${context.asset.description || "(none)"}`);
  lines.push(`Current notes: ${context.asset.notes || "(none)"}`);
  lines.push(`Current visual identity: ${context.asset.visualIdentity || "(none)"}`);
  lines.push(`Current usage rules: ${context.asset.usageRules || "(none)"}`);
  lines.push(`Current forbidden variations: ${context.asset.forbiddenVariations || "(none)"}`);

  const styleParts = [context.style.worldSegment, context.style.visualSegment, context.style.rulesSegment].filter(
    (part) => part.length > 0
  );
  if (styleParts.length > 0) {
    lines.push(`\nProject Style:\n${styleParts.join("\n\n")}`);
  }

  return {
    system: `You are a production asset supervisor for a film or animation project, reviewing whether one existing Asset's Description, Notes and Asset Bible (Visual Identity, Usage Rules, Forbidden Variations) already reflect the Project's published Style.

Rules:
- Use only the provided Project Story and Project Style as your source of design/world facts. Do not invent story facts or Style content not present in the input.
- Never contradict or discard an existing story fact recorded in the Asset's current fields — a design change must refine HOW something looks/behaves, never rewrite WHAT it fundamentally is in the story.
- A proposed change must be a substantive, field-level design decision: silhouette, material, function, construction, iconography or a behavioral constraint. Purely descriptive/rendering vocabulary (cinematic, painterly, high-contrast, warm lighting, dramatic, moody, and similar) appended to otherwise unchanged text is NEVER a valid change — if that is all you would produce, use outcome "already-aligned" instead.
- Keep each field concise: 1-3 sentences, matching the field's existing tone and length. Write in English.
${JSON_CONSTRAINT}`,
    user: `${lines.join("\n")}\n\nReview "${context.asset.name}" against the Project Style above and produce exactly one of the two JSON shapes.`,
  };
}
