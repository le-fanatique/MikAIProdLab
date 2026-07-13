// ---------------------------------------------------------------------------
// compileShotPrompt.ts — Canonical, deterministic Shot Prompt compiler
// (PROMPT.COMPILER.1).
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random(),
// no reliance on iteration order beyond what its own inputs already define.
// Turns the Shot Prompt (+ already-compiled Prompt Segments text, for video)
// into the exact final text sent to generation, alongside a structured
// breakdown (sections actually used, sources actually used, warnings) so
// every surface that needs this text — Shot Detail, ShotGenerationPanel,
// the /map page, and the generation action itself — can call this one
// function and always agree on both the text and why it looks the way it
// does.
//
// This never parses the free-text Shot Prompt or the already-compiled
// segments text to "discover" fields — every section/warning below reflects
// only the caller-supplied booleans/strings (hasPromptSegments,
// hasMissingTiming, etc.), which the caller already computed from real data
// (compilePromptSegments' own output), never re-derived by string-sniffing.
// ---------------------------------------------------------------------------

export type ShotPromptCompileKind = "image" | "video";

export type CompileShotPromptInput = {
  kind: ShotPromptCompileKind;
  shotPrompt?: string | null;
  /** Already-compiled Prompt Segments text (compilePromptSegments(...).text), never re-parsed here. */
  compiledPromptSegments?: string | null;
  /** Whether this shot has any Prompt Segments rows at all (independent of whether they produced text). */
  hasPromptSegments?: boolean;
  /** Forwarded verbatim from compilePromptSegments(...).hasMissingTiming — never recomputed by parsing text. */
  hasMissingTiming?: boolean;
};

export type ShotPromptSectionId = "shotPrompt" | "timeline";

export type ShotPromptSection = {
  id: ShotPromptSectionId;
  label: string;
  text: string;
};

export type CompiledShotPrompt = {
  /** The exact final text — identical value used for preview and for generation. */
  text: string;
  kind: ShotPromptCompileKind;
  /** Only sections that actually have content — never a fabricated empty section. */
  sections: ShotPromptSection[];
  /** Input identifiers that actually contributed non-empty text to `text` (e.g. ["shotPrompt"], ["shotPrompt", "promptSegments"], or []). */
  sourcesUsed: string[];
  hasShotPrompt: boolean;
  hasPromptSegments: boolean;
  usedTimeline: boolean;
  /** English diagnostics, deduplicated, original order preserved. */
  warnings: string[];
};

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function compileShotPrompt(input: CompileShotPromptInput): CompiledShotPrompt {
  const shotPrompt = input.shotPrompt?.trim() ?? "";
  const compiledPromptSegments = input.compiledPromptSegments?.trim() ?? "";
  const hasPromptSegments = Boolean(input.hasPromptSegments);
  const hasMissingTiming = Boolean(input.hasMissingTiming);
  const hasShotPrompt = shotPrompt.length > 0;

  const warnings: string[] = [];
  if (!hasShotPrompt) {
    warnings.push("Shot Prompt is empty.");
  }

  // For video: include the timeline only when segments exist AND actually
  // produced compiled text. Never inject the timeline for image, even if
  // this shot happens to have Prompt Segments defined.
  const shouldUseTimeline =
    input.kind === "video" && hasPromptSegments && compiledPromptSegments.length > 0;

  if (input.kind === "video") {
    if (!hasPromptSegments) {
      warnings.push("No Prompt Segments defined for this video shot. Only the Shot Prompt is used.");
    } else if (compiledPromptSegments.length === 0) {
      warnings.push("Prompt Segments exist but produced no compiled text.");
    } else if (hasMissingTiming) {
      warnings.push("Some Prompt Segments have partial or missing timing.");
    }
  } else if (hasPromptSegments) {
    // Purely informational — explains why segments the shot does have are
    // absent from an image preview, instead of leaving that silent.
    warnings.push("This shot has Prompt Segments, but they are not used for image workflows.");
  }

  const sections: ShotPromptSection[] = [];
  const sourcesUsed: string[] = [];

  if (hasShotPrompt) {
    sections.push({ id: "shotPrompt", label: "Shot Prompt", text: shotPrompt });
    sourcesUsed.push("shotPrompt");
  }
  if (shouldUseTimeline) {
    sections.push({ id: "timeline", label: "Timeline", text: compiledPromptSegments });
    sourcesUsed.push("promptSegments");
  }

  const text = sections
    .map((s) => (s.id === "timeline" ? `Timeline:\n${s.text}` : s.text))
    .join("\n\n");

  return {
    text,
    kind: input.kind,
    sections,
    sourcesUsed,
    hasShotPrompt,
    hasPromptSegments,
    usedTimeline: shouldUseTimeline,
    warnings: dedupePreservingOrder(warnings),
  };
}
