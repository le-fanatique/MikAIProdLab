// ---------------------------------------------------------------------------
// compileStyleSnapshot.ts — STYLE.1.A
//
// Pure compiler: a StyleSnapshot in, the exact compiled prompt text out.
// No DB, no clock, no network, no randomness — same snapshot always yields
// the exact same string. This module is not wired into any prompt or
// generation payload yet (explicitly out of scope for this ticket); it only
// powers the workspace's "compiled preview" and each published version's
// stored `compiledText`.
//
// Format decision (documented here, and in claude_report.md):
//   - Direction Brief, then "World & Design Language", then
//     "Visual Treatment", then "Style Rules" — fixed section order, every
//     block omitted entirely when it has no content.
//   - A pillar block is: its trimmed general direction, then (if present)
//     an "Avoid:" block for its negative constraints, then each specialized
//     section as "<heading>:\n<content>", in the exact order given.
//   - Atomic rules compile by POLARITY, not into one undifferentiated list:
//     a rule with `strength: "Avoid"` never enters "Style Rules:" — it
//     renders in its own top-level "Avoid:" block, in the same
//     "- <instruction>" bullet form the compiler already uses there.
//     `Required` and `Preferred` rules (and a rule with no `strength` at
//     all, since it is optional) stay in "Style Rules:", `Required` first,
//     each group keeping its relative order otherwise. This is a polarity
//     split, never an inline label: no "[Required]"/"[Avoid]" marker is
//     ever written into a rule line — deliberately NO inline metadata
//     (category/section/applicability/provenance/strength-as-text). This
//     follows the already-accepted product decision in
//     docs/PROJECT_STYLE_MVP_DECISIONS.md §3: "internal metadata is not
//     literal prompt content" — clarified there on 2026-08-24: `strength`
//     is the one field that decision does not cover, because it is polarity,
//     not metadata. The remaining metadata (category/section/applicability/
//     provenance) stays queryable on the rule row for future
//     filtering/display; it is never injected as compiled text.
//   - Every text value is trimmed before being tested for emptiness or
//     placed in the output — a whitespace-only field is treated as empty.
//   - A completely empty Style compiles to the empty string "".
// ---------------------------------------------------------------------------

import type { StylePillarSnapshot, StyleSnapshot } from "./styleSnapshot";

function compilePillarBlock(heading: string, pillar: StylePillarSnapshot): string | null {
  const parts: string[] = [];

  const general = pillar.generalDirection?.trim();
  if (general) parts.push(general);

  const negative = pillar.negativeConstraints?.trim();
  if (negative) parts.push(`Avoid:\n${negative}`);

  for (const section of pillar.sections) {
    const sectionHeading = section.heading?.trim();
    const sectionContent = section.content?.trim();
    if (sectionHeading && sectionContent) {
      parts.push(`${sectionHeading}:\n${sectionContent}`);
    }
  }

  if (parts.length === 0) return null;
  return `${heading}:\n${parts.join("\n\n")}`;
}

export function compileStyleSnapshot(snapshot: StyleSnapshot): string {
  const blocks: string[] = [];

  const brief = snapshot.directionBrief?.trim();
  if (brief) blocks.push(`Direction Brief:\n${brief}`);

  const worldBlock = compilePillarBlock("World & Design Language", snapshot.world);
  if (worldBlock) blocks.push(worldBlock);

  const visualBlock = compilePillarBlock("Visual Treatment", snapshot.visual);
  if (visualBlock) blocks.push(visualBlock);

  const activeRules = snapshot.rules
    .filter((rule) => rule.status !== "disabled")
    .map((rule) => ({ strength: rule.strength, instruction: rule.instruction.trim() }))
    .filter((rule) => rule.instruction.length > 0);

  // Polarity split, not an inline label: `Avoid` rules never enter
  // "Style Rules:" — they get their own block. `Required`, `Preferred` and
  // undeclared-strength rules stay in "Style Rules:", `Required` first,
  // each group keeping its relative order otherwise.
  const requiredLines = activeRules.filter((rule) => rule.strength === "Required").map((rule) => rule.instruction);
  const otherStyleRuleLines = activeRules
    .filter((rule) => rule.strength !== "Required" && rule.strength !== "Avoid")
    .map((rule) => rule.instruction);
  const avoidRuleLines = activeRules.filter((rule) => rule.strength === "Avoid").map((rule) => rule.instruction);

  const styleRuleLines = [...requiredLines, ...otherStyleRuleLines];
  if (styleRuleLines.length > 0) {
    blocks.push(`Style Rules:\n${styleRuleLines.map((line) => `- ${line}`).join("\n")}`);
  }
  if (avoidRuleLines.length > 0) {
    blocks.push(`Avoid:\n${avoidRuleLines.map((line) => `- ${line}`).join("\n")}`);
  }

  return blocks.join("\n\n");
}

/** True when a snapshot would compile to "" — used to refuse publishing an entirely empty Style without duplicating the compiler's own emptiness logic. */
export function isStyleSnapshotEmpty(snapshot: StyleSnapshot): boolean {
  return compileStyleSnapshot(snapshot).length === 0;
}
