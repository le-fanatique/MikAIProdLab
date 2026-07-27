import "server-only";

// ---------------------------------------------------------------------------
// generationStyleResolver.ts — STYLE.1.E.CORE.1 (retake Round 1)
//
// The DB-backed half of the canonical generation Style source, split out of
// generationStyleSource.ts (codex_review.md Round 1, P1 "Pure contracts are
// coupled to the database/server graph"). `import "server-only"` makes any
// accidental Client Component import of this file a build-time error — the
// pure consumer/applicability/compiler/composition/accounting/provenance
// contracts a Client Component might legitimately need (e.g. a live
// compiled-Style preview) stay in generationStyleSource.ts, which has zero
// DB/filesystem/network import.
//
// This module adds no ownership, corruption or inheritance logic of its
// own: every resolution decision is delegated to the already-accepted
// `resolveActiveProjectStyle` / `resolveSequenceStyle` / `resolveShotStyle`
// (src/lib/projectStyle/resolveSequenceStyle.ts).
//
// Still touches no generation action, payload, queue or ComfyUI call — this
// is a library function future surfaces will call, not a Server Action
// (STYLE.1.E.SURFACES.1 owns that rollout).
// ---------------------------------------------------------------------------

import {
  parseGenerationConsumer,
  requiredGenerationStyleTargetKind,
  compileGenerationStyleSegment,
  measurePromptText,
  type GenerationConsumer,
  type GenerationStyleTarget,
  type GenerationStyleProvenance,
} from "./generationStyleSource";
import { resolveActiveProjectStyle, resolveSequenceStyle, resolveShotStyle, type ResolvedSequenceStyle } from "./resolveSequenceStyle";

export type EffectiveGenerationStyle = {
  /** `""` when there is no effective Style, or the consumer-filtered Style has no content — the caller composes exactly this into the prompt. */
  compiledSegment: string;
  /** `null` exactly when `compiledSegment === ""` — provenance is never recorded for an empty/no-op Style contribution. */
  provenance: GenerationStyleProvenance | null;
};

export type ResolveGenerationStyleResult = { ok: true; effective: EffectiveGenerationStyle } | { ok: false; error: string };

const EMPTY_EFFECTIVE: EffectiveGenerationStyle = { compiledSegment: "", provenance: null };

function provenanceFromSegment(consumer: GenerationConsumer, compiledSegment: string): { characterCount: number; utf8ByteCount: number } {
  const measured = measurePromptText(compiledSegment);
  return { characterCount: measured.characters, utf8ByteCount: measured.utf8Bytes };
}

/**
 * The single entry point future generation surfaces will call.
 *
 * Retake Round 1 (P2 "Runtime consumer/target validation is incomplete"):
 * `consumer` is runtime-validated with `parseGenerationConsumer` as the
 * very first step — a compile-time `GenerationConsumer` type on the
 * caller's variable is never trusted on its own. The required target kind
 * for that consumer (`asset` -> project; `shot-image`/`shot-video`/
 * `shot-storyboard` -> shot; `sequence-storyboard`/`sequence-video` ->
 * sequence) is then checked BEFORE any resolver call, so an invalid
 * consumer or an invalid consumer/target pairing performs zero DB reads.
 */
export async function resolveGenerationStyle(consumer: GenerationConsumer, target: GenerationStyleTarget): Promise<ResolveGenerationStyleResult> {
  const parsedConsumer = parseGenerationConsumer(consumer);
  if (!parsedConsumer.ok) return { ok: false, error: parsedConsumer.error };
  const validConsumer = parsedConsumer.consumer;

  const requiredKind = requiredGenerationStyleTargetKind(validConsumer);
  if (target.kind !== requiredKind) {
    return { ok: false, error: `Consumer '${validConsumer}' requires a ${requiredKind} target.` };
  }

  if (target.kind === "project") {
    const core = await resolveActiveProjectStyle(target.projectId);
    if (!core.ok) return { ok: false, error: core.error };
    if (core.result.mode === "none") return { ok: true, effective: EMPTY_EFFECTIVE };

    const compiledSegment = compileGenerationStyleSegment(core.result.snapshot, validConsumer);
    if (!compiledSegment) return { ok: true, effective: EMPTY_EFFECTIVE };

    return {
      ok: true,
      effective: {
        compiledSegment,
        provenance: {
          consumer: validConsumer,
          resolutionMode: "project-version",
          compiledSegment,
          projectStyleVersionId: core.result.versionId,
          projectStyleVersionNumber: core.result.versionNumber,
          ...provenanceFromSegment(validConsumer, compiledSegment),
        },
      },
    };
  }

  const core: { ok: true; result: ResolvedSequenceStyle } | { ok: false; error: string } =
    target.kind === "sequence" ? await resolveSequenceStyle(target.projectId, target.sequenceId) : await resolveShotStyle(target.projectId, target.sequenceId, target.shotId);
  if (!core.ok) return { ok: false, error: core.error };

  const resolved = core.result;
  if (resolved.mode === "none") return { ok: true, effective: EMPTY_EFFECTIVE };

  const compiledSegment = compileGenerationStyleSegment(resolved.snapshot, validConsumer);
  if (!compiledSegment) return { ok: true, effective: EMPTY_EFFECTIVE };

  if (resolved.mode === "inherited") {
    return {
      ok: true,
      effective: {
        compiledSegment,
        provenance: {
          consumer: validConsumer,
          resolutionMode: "inherited-project-version",
          compiledSegment,
          projectStyleVersionId: resolved.projectVersionId,
          projectStyleVersionNumber: resolved.projectVersionNumber,
          ...provenanceFromSegment(validConsumer, compiledSegment),
        },
      },
    };
  }

  return {
    ok: true,
    effective: {
      compiledSegment,
      provenance: {
        consumer: validConsumer,
        resolutionMode: "sequence-override",
        compiledSegment,
        sequenceOverrideId: resolved.overrideId,
        sequenceOverrideRevision: resolved.revision,
        sourceProjectStyleVersionId: resolved.sourceProjectVersionId,
        sourceProjectStyleVersionNumber: resolved.sourceProjectVersionNumber,
        ...provenanceFromSegment(validConsumer, compiledSegment),
      },
    },
  };
}
