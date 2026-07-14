// ---------------------------------------------------------------------------
// assetBibleDraft.ts — pure parsing/cleanup for "Enhance Asset Bible"
// (AI.ASSET.BIBLE.1).
//
// Kept in a plain module (no "use server") so it can be unit tested
// directly and imported by src/actions/llm/assetBible.ts — a "use server"
// file may only export async Server Actions, so this parsing logic can't
// live there as a directly-testable synchronous export.
// ---------------------------------------------------------------------------

import type { GeneratedAssetBibleDraft } from "@/types/llm";

// Defensive cap in case the model ignores the "max 3 sentences" instruction.
// A simple cut, not a rewrite.
export const MAX_ASSET_BIBLE_FIELD_LENGTH = 800;

export function extractAssetBibleCodeFence(raw: string): string {
  const fence = raw.trim().match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fence ? fence[1].trim() : raw.trim();
}

function cleanAssetBibleField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_ASSET_BIBLE_FIELD_LENGTH);
}

/**
 * Parses and cleans the model's raw JSON response into the three Asset
 * Bible fields. Throws a user-facing English Error on any structurally
 * invalid or empty response — never fabricates a field, never silently
 * returns partial nonsense.
 */
export function parseAssetBibleDraft(raw: string): GeneratedAssetBibleDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractAssetBibleCodeFence(raw));
  } catch {
    throw new Error("The model returned an unexpected format. Try again.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The model returned an unexpected format. Try again.");
  }

  const obj = parsed as Record<string, unknown>;
  const visualIdentity = cleanAssetBibleField(obj.visual_identity);
  const usageRules = cleanAssetBibleField(obj.usage_rules);
  const forbiddenVariations = cleanAssetBibleField(obj.forbidden_variations);

  if (!visualIdentity && !usageRules && !forbiddenVariations) {
    throw new Error("The model returned an empty draft. Try again.");
  }

  return { visualIdentity, usageRules, forbiddenVariations };
}

/**
 * Preserves an existing Asset Bible field when the applied value is empty
 * (partial draft, or a user-cleared textarea) — an empty applied value must
 * never overwrite an existing value with null. There is no explicit "clear
 * this field" action in this flow, so empty always means "keep the current
 * value."
 */
export function preserveAssetBibleField(existingValue: string, appliedValue: string): string {
  const trimmed = appliedValue.trim();
  return trimmed ? trimmed : existingValue;
}
