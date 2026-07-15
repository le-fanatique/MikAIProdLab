// ---------------------------------------------------------------------------
// buildSequenceGenerationPackage.ts — Sequence-level Seedance prompt package
// (SEQGEN.1).
//
// Pure function: no DB, no browser, no network, no Date.now()/Math.random(),
// no reliance on Map/object iteration order beyond what the caller's own
// ordered `shots` array already defines. Composes the two existing
// deterministic compilers per Shot — buildPromptCompilationContext
// (PROMPT.COMPILER.1-FIX) and compileShotPrompt (PROMPT.COMPILER.1) — rather
// than reimplementing prompt/context assembly. Neither of those two
// functions' contracts is modified here.
//
// This is the first brick of the chain described in
// docs/SEQUENCE_LEVEL_SEEDANCE_DRAFT.md: it only compiles and packages
// existing data. It never calls ComfyUI, never produces a video, never
// writes to a Shot, and never decides splits or push targets — that is
// SEQGEN.SPLIT.1 and SEQGEN.PUSH.1's job, consuming this package's shape
// (see "Contract for future tickets" at the bottom of this file).
// ---------------------------------------------------------------------------

import {
  buildPromptCompilationContext,
  type BuildPromptCompilationContextInput,
  type PromptCompilationContext,
} from "./buildPromptCompilationContext";
import { compileShotPrompt, type CompiledShotPrompt } from "./compileShotPrompt";

export const SEQUENCE_GENERATION_PACKAGE_KIND = "sequence-generation-package" as const;
export const SEQUENCE_GENERATION_PACKAGE_VERSION = 1 as const;

/** Continuity/sequencing fields the Prompt Compiler contract does not carry — kept separate so this ticket never touches that contract. */
export type SequenceGenerationContinuityInput = {
  framing?: string | null;
  cameraMovement?: string | null;
  continuityIn?: string | null;
  continuityOut?: string | null;
  continuityNotes?: string | null;
};

export type SequenceGenerationContinuity = {
  framing: string | null;
  cameraMovement: string | null;
  continuityIn: string | null;
  continuityOut: string | null;
  continuityNotes: string | null;
};

export type SequenceGenerationPackageShotInput = {
  shotId: number;
  shotCode: string | null;
  title: string;
  /** Position among this Sequence's Shots — the caller's own Sequence Structure/Storyboard order, never re-sorted here. */
  orderIndex: number;
  durationSeconds: number | null;
  /** Whether this Shot has an approved video already — the package's own "media absent" warning is based on this plus the compiled references, never fabricated. */
  hasApprovedVideo: boolean;
  continuity: SequenceGenerationContinuityInput;
  /** Fed straight into buildPromptCompilationContext — same contract, same function. */
  promptContext: BuildPromptCompilationContextInput;
};

export type SequenceGenerationPackageShot = {
  shotId: number;
  shotCode: string | null;
  title: string;
  orderIndex: number;
  durationSeconds: number | null;
  hasApprovedVideo: boolean;
  continuity: SequenceGenerationContinuity;
  compiledPrompt: CompiledShotPrompt;
  context: PromptCompilationContext;
  /** This Shot's own warnings only — compiledPrompt + context warnings, plus duration/media, deduplicated. */
  warnings: string[];
};

export type SequenceGenerationPackageMeta = {
  projectId: number;
  sequenceId: number;
  sequenceTitle: string | null;
  sequenceCode: string | null;
};

export type SequenceGenerationPackage = {
  kind: typeof SEQUENCE_GENERATION_PACKAGE_KIND;
  version: typeof SEQUENCE_GENERATION_PACKAGE_VERSION;
  projectId: number;
  sequenceId: number;
  sequenceTitle: string | null;
  sequenceCode: string | null;
  shotCount: number;
  /** Sum of durationSeconds across Shots that have one — never a fabricated estimate for the missing ones. */
  totalKnownDurationSeconds: number;
  knownDurationShotCount: number;
  missingDurationShotCount: number;
  shots: SequenceGenerationPackageShot[];
  /** Package-level diagnostics: one line per Shot warning ("Shot {code}: {warning}"), deduplicated, plus a leading notice when the Sequence has no Shots. Never blocks consultation of the package. */
  warnings: string[];
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

function buildContinuity(input: SequenceGenerationContinuityInput): SequenceGenerationContinuity {
  return {
    framing: trimOrNull(input.framing),
    cameraMovement: trimOrNull(input.cameraMovement),
    continuityIn: trimOrNull(input.continuityIn),
    continuityOut: trimOrNull(input.continuityOut),
    continuityNotes: trimOrNull(input.continuityNotes),
  };
}

function buildShotPackage(input: SequenceGenerationPackageShotInput): SequenceGenerationPackageShot {
  const context = buildPromptCompilationContext(input.promptContext);
  const compiledPrompt = compileShotPrompt({
    kind: "video",
    shotPrompt: input.promptContext.shot.shotPrompt,
    compiledPromptSegments: input.promptContext.shot.compiledPromptSegments,
    hasPromptSegments: input.promptContext.shot.hasPromptSegments,
    hasMissingTiming: input.promptContext.shot.hasMissingTiming,
  });

  const warnings = [...compiledPrompt.warnings, ...context.warnings];

  if (input.durationSeconds === null) {
    warnings.push("Duration is missing.");
  }
  if (!input.hasApprovedVideo && context.references.length === 0) {
    warnings.push("No approved video or reference image for this Shot.");
  }

  return {
    shotId: input.shotId,
    shotCode: input.shotCode,
    title: input.title,
    orderIndex: input.orderIndex,
    durationSeconds: input.durationSeconds,
    hasApprovedVideo: input.hasApprovedVideo,
    continuity: buildContinuity(input.continuity),
    compiledPrompt,
    context,
    warnings: dedupePreservingOrder(warnings),
  };
}

/**
 * Builds a deterministic Sequence Generation Package from already-ordered
 * Shot inputs. `shots` must already be in the exact order to preserve
 * (Sequence Structure/Storyboard order) — this function never sorts them.
 */
export function buildSequenceGenerationPackage(
  meta: SequenceGenerationPackageMeta,
  shots: SequenceGenerationPackageShotInput[]
): SequenceGenerationPackage {
  const shotPackages = shots.map(buildShotPackage);

  let totalKnownDurationSeconds = 0;
  let knownDurationShotCount = 0;
  for (const s of shotPackages) {
    if (s.durationSeconds !== null) {
      totalKnownDurationSeconds += s.durationSeconds;
      knownDurationShotCount += 1;
    }
  }

  const warnings: string[] = [];
  if (shotPackages.length === 0) {
    warnings.push("This Sequence has no Shots yet.");
  }
  for (const s of shotPackages) {
    for (const w of s.warnings) {
      warnings.push(`Shot ${s.shotCode ?? s.title}: ${w}`);
    }
  }

  return {
    kind: SEQUENCE_GENERATION_PACKAGE_KIND,
    version: SEQUENCE_GENERATION_PACKAGE_VERSION,
    projectId: meta.projectId,
    sequenceId: meta.sequenceId,
    sequenceTitle: trimOrNull(meta.sequenceTitle),
    sequenceCode: trimOrNull(meta.sequenceCode),
    shotCount: shotPackages.length,
    totalKnownDurationSeconds,
    knownDurationShotCount,
    missingDurationShotCount: shotPackages.length - knownDurationShotCount,
    shots: shotPackages,
    warnings: dedupePreservingOrder(warnings),
  };
}

/**
 * Deterministic, human-readable text form of the package — each Shot's
 * compiled prompt clearly delimited by a header line, never merged into an
 * ambiguous block. Same `compiledPrompt.text` value used everywhere else
 * this compiler's output is shown (Shot Detail, ShotGenerationPanel).
 */
export function formatSequenceGenerationPackageText(pkg: SequenceGenerationPackage): string {
  const header = [
    `Sequence Generation Package v${pkg.version}`,
    `Project ${pkg.projectId} / Sequence ${pkg.sequenceId}${pkg.sequenceCode ? ` (${pkg.sequenceCode})` : ""}${pkg.sequenceTitle ? ` — ${pkg.sequenceTitle}` : ""}`,
    `${pkg.shotCount} shot${pkg.shotCount !== 1 ? "s" : ""} · ${pkg.totalKnownDurationSeconds.toFixed(1)}s known (${pkg.knownDurationShotCount}/${pkg.shotCount} timed)`,
  ].join("\n");

  const shotBlocks = pkg.shots.map((s, i) => {
    const label = `=== Shot ${i + 1}/${pkg.shotCount} — ${s.shotCode ?? s.title}${s.shotCode ? ` — "${s.title}"` : ""}${s.durationSeconds !== null ? ` (${s.durationSeconds.toFixed(1)}s)` : " (no duration)"} ===`;
    const body = s.compiledPrompt.text || "(no compiled prompt)";
    const warningsBlock = s.warnings.length > 0 ? `\nWarnings:\n${s.warnings.map((w) => `- ${w}`).join("\n")}` : "";
    return `${label}\n${body}${warningsBlock}`;
  });

  return [header, ...shotBlocks].join("\n\n");
}

// ---------------------------------------------------------------------------
// Contract for future tickets (SEQGEN.SPLIT.1, SEQGEN.PUSH.1) — documented
// here, not implemented:
//
// - `shots` is already in final Sequence order — SEQGEN.SPLIT.1's expected
//   segment count is `pkg.shotCount`, and its Nth detected segment maps by
//   position to `pkg.shots[N]` unless the user overrides the mapping.
// - `shots[i].shotId` is the stable target for SEQGEN.PUSH.1 — never the
//   array index alone, since Shots can be reordered/inserted between a
//   package being generated and a push actually happening.
// - `shots[i].warnings` (and the top-level `warnings`) are informational at
//   this stage; SEQGEN.SPLIT.1/PUSH.1 will decide whether any of them
//   should block a push (e.g. a Shot with no duration has no target length
//   to trim a split segment to) — no such policy exists yet.
// - `totalKnownDurationSeconds`/`missingDurationShotCount` tell a future
//   generation step whether the requested Sequence duration is fully known
//   before it ever calls a workflow.
// ---------------------------------------------------------------------------
