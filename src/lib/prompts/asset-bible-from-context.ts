import type { LLMPrompt } from "@/types/llm";

// ---------------------------------------------------------------------------
// asset-bible-from-context.ts — prompt builder for "Enhance Asset Bible"
// (AI.ASSET.BIBLE.1).
//
// Mirrors asset-description-from-context.ts's conventions (pure function,
// LLMPrompt shape, English system prompt, strict JSON contract) but uses
// Description/Notes as the primary source, with the asset's existing Bible
// values (if any) supplied only as improvement context — never as facts
// to invent further canon from.
// ---------------------------------------------------------------------------

export type AssetBibleFromContextInput = {
  asset: {
    name: string;
    type: string;
    description: string | null;
    notes: string | null;
    visualIdentity: string | null;
    usageRules: string | null;
    forbiddenVariations: string | null;
  };
};

const JSON_CONSTRAINT = `Always respond with a valid JSON object matching exactly this schema:
{ "visual_identity": "<defining silhouette, colors, materials, proportions>", "usage_rules": "<how this asset should behave or be framed/used across shots>", "forbidden_variations": "<colors, props, poses or traits that must never appear>" }
No markdown. No explanation. Only the JSON object.`;

export function buildAssetBibleFromContextPrompt(input: AssetBibleFromContextInput): LLMPrompt {
  const lines: string[] = [];

  lines.push(`Asset: ${input.asset.name}`);
  lines.push(`Type: ${input.asset.type}`);

  if (input.asset.description?.trim()) {
    lines.push(`Description: ${input.asset.description.trim()}`);
  } else {
    lines.push(`Description: (none)`);
  }

  if (input.asset.notes?.trim()) {
    lines.push(`Notes: ${input.asset.notes.trim()}`);
  } else {
    lines.push(`Notes: (none)`);
  }

  const hasExistingBible =
    input.asset.visualIdentity?.trim() ||
    input.asset.usageRules?.trim() ||
    input.asset.forbiddenVariations?.trim();

  if (hasExistingBible) {
    lines.push(`\nExisting Asset Bible (improve/complete, do not contradict without reason):`);
    if (input.asset.visualIdentity?.trim()) {
      lines.push(`Current Visual Identity: ${input.asset.visualIdentity.trim()}`);
    }
    if (input.asset.usageRules?.trim()) {
      lines.push(`Current Usage Rules: ${input.asset.usageRules.trim()}`);
    }
    if (input.asset.forbiddenVariations?.trim()) {
      lines.push(`Current Forbidden Variations: ${input.asset.forbiddenVariations.trim()}`);
    }
  }

  return {
    system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the "Asset Bible" — three short, factual guidance fields used to keep this asset visually and behaviorally consistent across AI-assisted image and video generation.

Rules:
- Use only the provided Description and Notes as your source of truth. Do not invent story facts, events, or canon not present in the input.
- If an existing Asset Bible value is provided, treat it as context to improve or complete — never discard useful existing content without reason, and never contradict it without a clear basis in Description/Notes.
- visual_identity: defining silhouette, colors, materials, proportions, distinguishing visual traits. Max 3 concise sentences. Write in English.
- usage_rules: how this asset should behave, be framed, or be used consistently across shots (performance, camera, staging constraints). Max 3 concise sentences. Write in English.
- forbidden_variations: colors, props, poses, or traits that must never appear on this asset, to preserve consistency. Max 3 concise sentences. Write in English.
- If Description and Notes are too limited to support a field, return an empty string for that field rather than inventing content.
${JSON_CONSTRAINT}`,
    user: `${lines.join("\n")}\n\nWrite or enrich the Asset Bible (Visual Identity, Usage Rules, Forbidden Variations) for "${input.asset.name}".`,
  };
}
