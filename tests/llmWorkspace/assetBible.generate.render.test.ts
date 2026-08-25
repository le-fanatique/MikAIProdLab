import { describe, expect, it } from "vitest";
import { assetBibleGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetBible";
import {
  renderAssetCoreBibleLines,
  renderAssetBibleExistingLines,
  renderProjectStyleBibleBlock,
  renderProjectStyleBibleFinalRule,
  renderAssetCoreClosingBible,
  type AssetCoreData,
  type AssetBibleData,
  type ProjectStyleData,
} from "@/lib/llmWorkspace/variables/registry";
import { assembleDescriptorMessages } from "@/lib/llmWorkspace/assembleDescriptorMessages";

// ---------------------------------------------------------------------------
// Proof required by the ticket: assembling {system, user} from
// `assetBibleGenerateDescriptor`'s blocks must equal, byte-for-byte, what
// `buildAssetBibleFromContextPrompt` produces for the same input — the
// second known divergence to close mechanically (B1b-2's paraphrased
// `systemPrompt`, see the descriptor's header comment).
// ---------------------------------------------------------------------------

type Fixture = {
  core: AssetCoreData;
  bible: AssetBibleData;
  style: ProjectStyleData;
};

function assemble(fixture: Fixture) {
  return assembleDescriptorMessages(assetBibleGenerateDescriptor, (variableId, render) => {
    switch (`${variableId}::${render}`) {
      case "ASSET.CORE::assetBible.coreLines":
        return renderAssetCoreBibleLines(fixture.core);
      case "ASSET.BIBLE::assetBible.existingBibleLines":
        return renderAssetBibleExistingLines(fixture.bible);
      case "PROJECT.STYLE::assetBible.styleBlock":
        return renderProjectStyleBibleBlock(fixture.style);
      case "PROJECT.STYLE::assetBible.finalRuleLine":
        return renderProjectStyleBibleFinalRule(fixture.style);
      case "ASSET.CORE::assetBible.closingLine":
        return renderAssetCoreClosingBible(fixture.core);
      default:
        throw new Error(`unexpected block ${variableId}::${render}`);
    }
  });
}

describe("assetBible.generate descriptor — strict prompt equality", () => {
  it("matches buildAssetBibleFromContextPrompt for a complete Asset (existing Bible, active Style)", () => {
    const fixture: Fixture = {
      core: {
        name: "Hero Robot",
        type: "character",
        description: "A weathered combat robot.",
        notes: "Appears throughout Act 2.",
      },
      bible: {
        visualIdentity: "Matte grey chassis, one glowing blue optic.",
        usageRules: "Always framed from a low angle in combat.",
        forbiddenVariations: "Never shown with bright colors.",
      },
      style: {
        mode: "active",
        worldSegment: "A rain-soaked megacity.",
        visualSegment: "Neon and chrome.",
        rulesSegment: "Never show daylight.",
        rulesPositiveSegment: "Never show daylight.",
        rulesAvoidSegment: "",
        rulesPositiveBulletsOnly: "Never show daylight.",
        rulesAvoidBulletsOnly: "",
      },
    };
    const expected = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the "Asset Bible" — three short, factual guidance fields used to keep this asset visually and behaviorally consistent across AI-assisted image and video generation.

Rules:
- Use only the provided Description and Notes as your source of truth. Do not invent story facts, events, or canon not present in the input.
- If an existing Asset Bible value is provided, treat it as context to improve or complete — never discard useful existing content without reason, and never contradict it without a clear basis in Description/Notes.
- visual_identity: defining silhouette, colors, materials, proportions, distinguishing visual traits. Max 3 concise sentences. Write in English.
- usage_rules: how this asset should behave, be framed, or be used consistently across shots (performance, camera, staging constraints). Max 3 concise sentences. Write in English.
- forbidden_variations: colors, props, poses, or traits that must never appear on this asset, to preserve consistency. Max 3 concise sentences. Write in English.
- If Description and Notes are too limited to support a field, return an empty string for that field rather than inventing content.
- A Project Style is provided below. Respect its World & Design Language, Visual Treatment and any listed rules; never contradict them.
Always respond with a valid JSON object matching exactly this schema:
{ "visual_identity": "<defining silhouette, colors, materials, proportions>", "usage_rules": "<how this asset should behave or be framed/used across shots>", "forbidden_variations": "<colors, props, poses or traits that must never appear>" }
No markdown. No explanation. Only the JSON object.`, user: `Asset: Hero Robot
Type: character
Description: A weathered combat robot.
Notes: Appears throughout Act 2.

Existing Asset Bible (improve/complete, do not contradict without reason):
Current Visual Identity: Matte grey chassis, one glowing blue optic.
Current Usage Rules: Always framed from a low angle in combat.
Current Forbidden Variations: Never shown with bright colors.

Project Style:
A rain-soaked megacity.

Neon and chrome.

Never show daylight.

Write or enrich the Asset Bible (Visual Identity, Usage Rules, Forbidden Variations) for "Hero Robot".` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });

  it("matches buildAssetBibleFromContextPrompt for a minimal Asset (no existing Bible, no Style)", () => {
    const fixture: Fixture = {
      core: { name: "Placeholder Prop", type: "prop", description: null, notes: null },
      bible: { visualIdentity: null, usageRules: null, forbiddenVariations: null },
      style: { mode: "none" },
    };
    const expected = { system: `You are a production asset supervisor for a film or animation project.
Your task is to write or enrich the "Asset Bible" — three short, factual guidance fields used to keep this asset visually and behaviorally consistent across AI-assisted image and video generation.

Rules:
- Use only the provided Description and Notes as your source of truth. Do not invent story facts, events, or canon not present in the input.
- If an existing Asset Bible value is provided, treat it as context to improve or complete — never discard useful existing content without reason, and never contradict it without a clear basis in Description/Notes.
- visual_identity: defining silhouette, colors, materials, proportions, distinguishing visual traits. Max 3 concise sentences. Write in English.
- usage_rules: how this asset should behave, be framed, or be used consistently across shots (performance, camera, staging constraints). Max 3 concise sentences. Write in English.
- forbidden_variations: colors, props, poses, or traits that must never appear on this asset, to preserve consistency. Max 3 concise sentences. Write in English.
- If Description and Notes are too limited to support a field, return an empty string for that field rather than inventing content.
Always respond with a valid JSON object matching exactly this schema:
{ "visual_identity": "<defining silhouette, colors, materials, proportions>", "usage_rules": "<how this asset should behave or be framed/used across shots>", "forbidden_variations": "<colors, props, poses or traits that must never appear>" }
No markdown. No explanation. Only the JSON object.`, user: `Asset: Placeholder Prop
Type: prop
Description: (none)
Notes: (none)

Write or enrich the Asset Bible (Visual Identity, Usage Rules, Forbidden Variations) for "Placeholder Prop".` };
    const assembled = assemble(fixture);
    expect(assembled.system).toBe(expected.system);
    expect(assembled.user).toBe(expected.user);
  });
});
