// ---------------------------------------------------------------------------
// prompt.ts — STYLE.1.B.ANALYSIS.CORE
//
// Deterministic prompt builder for Reference Board multimodal analysis. Pure
// — no DB, no network, no filesystem. The returned text is reproducible for
// identical (already-normalized/bounded) inputs, so `sha256(prompt)` is a
// stable provenance hash. Never receives or embeds pixels/base64 — those are
// attached as separate `ChatMessage` image parts by
// `imageInputs.ts`/`provider.ts`, never inlined as text.
//
// Deliberately never mentions a Reference's `sourceUrl`: the ticket forbids
// any Web/source-URL analysis, and a manually-typed provenance URL is not
// "non-sensitive provenance" in the sense the ticket means — only the
// free-text `provenanceNotes` field (physical/collection provenance the
// user typed) is included.
// ---------------------------------------------------------------------------

import { REFERENCE_ANALYSIS_LIMITS, type ReferenceSnapshotForRun } from "./contracts";

function boundedLine(label: string, value: string | null, maxLength: number): string | null {
  if (value === null) return null;
  const bounded = value.slice(0, maxLength).trim();
  if (bounded.length === 0) return null;
  return `${label}: ${bounded}`;
}

function buildReferenceBlock(ref: ReferenceSnapshotForRun): string {
  const lines: string[] = [`[${ref.referenceKey}]`];
  const label = boundedLine("Label", ref.label, REFERENCE_ANALYSIS_LIMITS.maxLabelLength);
  if (label) lines.push(label);
  const provenance = boundedLine("Provenance", ref.provenanceNotes, REFERENCE_ANALYSIS_LIMITS.maxProvenanceLength);
  if (provenance) lines.push(provenance);
  const interests = boundedLine("What interests me", ref.whatInterestsMe, REFERENCE_ANALYSIS_LIMITS.maxLongTextLength);
  if (interests) lines.push(interests);
  const avoid = boundedLine("What to avoid", ref.whatToAvoid, REFERENCE_ANALYSIS_LIMITS.maxLongTextLength);
  if (avoid) lines.push(avoid);
  if (ref.domains.length > 0) lines.push(`Analysis domains: ${ref.domains.join(", ")}`);
  return lines.join("\n");
}

const OUTPUT_SCHEMA_BLOCK = [
  "{",
  '  "schemaVersion": 1,',
  '  "summary": "string — a short factual summary of what was visually observed across the images",',
  '  "observations": [',
  "    {",
  '      "referenceKey": "R1",',
  '      "domain": "string or null",',
  '      "observation": "string — one factual, verifiable visual observation about THIS image",',
  '      "rationale": "string or null",',
  '      "confidence": "high|medium|low",',
  '      "uncertainty": "string or null"',
  "    }",
  "  ],",
  '  "candidateRules": [',
  "    {",
  '      "instruction": "string — an actionable style instruction",',
  '      "pillar": "visual" + " or " + "world" + " or null",',
  '      "section": "string or null",',
  '      "category": "string or null",',
  '      "strength": "Required|Preferred|Avoid or null",',
  '      "applicability": "string or null",',
  '      "rationale": "string — why this instruction follows from the images cited below",',
  '      "confidence": "high|medium|low",',
  '      "uncertainty": "string or null",',
  '      "referenceKeys": ["R1"]',
  "    }",
  "  ]",
  "}",
].join("\n");

/**
 * Builds the exact deterministic text sent to the provider alongside the
 * attached images. `references` must already be in `R1..Rn` order (the
 * caller — `imageInputs.ts`/the orchestration action — is responsible for
 * that ordering; this function trusts `ref.referenceKey` as given).
 */
export function buildReferenceAnalysisPrompt(references: ReferenceSnapshotForRun[]): string {
  const blocks = references.map(buildReferenceBlock);

  return [
    "You are a film/art production style analyst. You are given " + references.length + " reference image(s), labeled " + references.map((r) => r.referenceKey).join(", ") + ", attached to this message in that exact order.",
    "",
    "For each image, look ONLY at the pixels — do not guess or assume anything about its source, author, or origin. Never attempt to identify a real person, a specific named character, or a specific copyrighted work. Never propose copying a recognizable character, logo, or visible text verbatim.",
    "",
    "Reference context (guides what to look for, but your observations must describe what is actually visible — never a paraphrase of this context):",
    ...blocks,
    "",
    "Produce factual, verifiable visual observations for EACH image individually (composition, lighting, color, texture, framing, material, silhouette, etc.), then identify convergences and divergences ACROSS the group as shared candidate style rules. Every observation must cite exactly one referenceKey. Every candidate rule must cite every referenceKey whose image supports it.",
    "",
    "Respond with a single JSON object matching EXACTLY this schema (no markdown fences, no extra text before or after):",
    OUTPUT_SCHEMA_BLOCK,
  ].join("\n");
}
