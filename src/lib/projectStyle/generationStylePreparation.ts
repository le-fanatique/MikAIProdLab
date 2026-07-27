import "server-only";

// ---------------------------------------------------------------------------
// generationStylePreparation.ts — STYLE.1.E.SURFACES.1
//
// One shared, consumer-aware preparation step reused by every preview
// surface (AssetGenerationPanel, ShotGenerationPanel, both dedicated
// workflow generate pages) AND every generation action (runAssetGeneration,
// the Shot generation core). Resolving here and composing once means the
// preview shown to the user and the prompt actually queued can never
// structurally diverge — both call this exact function with the exact same
// (consumer, target, basePrompt).
//
// Never imports client state; never forks buildGenerationPayload. Building
// block only — no generation action, payload, queue or ComfyUI call happens
// here.
// ---------------------------------------------------------------------------

import { resolveGenerationStyle } from "./generationStyleResolver";
import {
  composeAndAccountGenerationPrompt,
  composeGenerationPrompt,
  type GenerationConsumer,
  type GenerationStyleTarget,
  type GenerationStyleProvenance,
  type ComposedGenerationPrompt,
} from "./generationStyleSource";

export type PreparedGenerationStyleSource =
  | {
      ok: true;
      consumer: GenerationConsumer;
      /** `""` when there is no effective Style, or it was entirely filtered out for this consumer. */
      compiledSegment: string;
      hasEffectiveStyle: boolean;
      /** The suggested/base prompt already composed with `compiledSegment` — the exact string a caller should pass as `suggestedText` to `buildGenerationPayload`. */
      composedSuggestedPrompt: ComposedGenerationPrompt;
      /** Present only when `compiledSegment !== ""` — never a placeholder for an empty contribution. */
      provenanceCandidate: GenerationStyleProvenance | null;
      /** Composes one explicit text-node override value with the exact same `compiledSegment` — never applied to scalar/image/video/Dynamic Batch inputs. */
      composeTextOverride: (rawOverrideValue: string) => string;
    }
  | { ok: false; error: string };

export async function prepareGenerationStyleSource(
  consumer: GenerationConsumer,
  target: GenerationStyleTarget,
  basePrompt: string
): Promise<PreparedGenerationStyleSource> {
  const resolved = await resolveGenerationStyle(consumer, target);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const { compiledSegment, provenance } = resolved.effective;
  const composedSuggestedPrompt = composeAndAccountGenerationPrompt(basePrompt, compiledSegment);

  return {
    ok: true,
    consumer,
    compiledSegment,
    hasEffectiveStyle: compiledSegment !== "",
    composedSuggestedPrompt,
    provenanceCandidate: provenance,
    composeTextOverride: (rawOverrideValue: string) => composeGenerationPrompt(rawOverrideValue, compiledSegment),
  };
}
