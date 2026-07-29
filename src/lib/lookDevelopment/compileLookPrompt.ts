// ---------------------------------------------------------------------------
// compileLookPrompt.ts — STYLE.1.G.CORE.1 (Scope C)
//
// Pure, deterministic: test subject/action + an explicitly selected Style
// snapshot + ordered selected references + the actual workflow's
// requirements -> the exact Look Development prompt. No DB, no clock, no
// randomness — same input always yields the exact same output.
//
// The test segment and the Style segment stay separately inspectable
// (returned as distinct fields, never only pre-merged) — reuses the
// canonical `compileStyleSnapshot` output verbatim as the Style segment,
// never a second Style compiler. References are appended as their own
// segment, in the exact given order, each rendered only from non-empty
// fields (no fabricated empty heading — mirrors compileStyleSnapshot's own
// omission rule).
// ---------------------------------------------------------------------------

import type { ResolvedLookReference } from "./resolveLookReferences";

export type CompileLookPromptInput = {
  subject: string;
  action: string;
  /** Exact output of compileStyleSnapshot(snapshot) for the explicitly resolved Style source — never recomputed here. */
  styleCompiledText: string;
  /** Already ordered, deduplicated, Project-confined — see resolveLookReferences.ts. */
  references: ResolvedLookReference[];
};

export type CompiledLookPrompt = {
  /** Subject + action only — never includes Style or reference content. */
  testSegment: string;
  /** Exactly `styleCompiledText`, byte-identical, or "" when empty. */
  styleSegment: string;
  /** Compiled reference lines, or "" when no references were selected. */
  referencesSegment: string;
  /** testSegment + styleSegment + referencesSegment, each separated by a blank line, empty segments omitted. */
  prompt: string;
};

function compileReferenceLine(ref: ResolvedLookReference): string | null {
  const label = ref.label?.trim();
  const interest = ref.whatInterestsMe?.trim();
  const avoid = ref.whatToAvoid?.trim();
  const parts: string[] = [];
  if (interest) parts.push(interest);
  if (avoid) parts.push(`Avoid: ${avoid}`);
  if (parts.length === 0) return null;
  const prefix = label ? `${label} — ` : "";
  return `- ${prefix}${parts.join("; ")}`;
}

/** Pure. Same input always yields the exact same output — no DB, no clock, no randomness. */
export function compileLookPrompt(input: CompileLookPromptInput): CompiledLookPrompt {
  const subject = input.subject.trim();
  const action = input.action.trim();
  const testParts: string[] = [];
  if (subject) testParts.push(subject);
  if (action) testParts.push(action);
  const testSegment = testParts.join(", ");

  const styleSegment = input.styleCompiledText.trim();

  const referenceLines = input.references.map(compileReferenceLine).filter((line): line is string => line !== null);
  const referencesSegment = referenceLines.length > 0 ? `References:\n${referenceLines.join("\n")}` : "";

  const promptParts = [testSegment, styleSegment, referencesSegment].filter((part) => part.length > 0);

  return { testSegment, styleSegment, referencesSegment, prompt: promptParts.join("\n\n") };
}
