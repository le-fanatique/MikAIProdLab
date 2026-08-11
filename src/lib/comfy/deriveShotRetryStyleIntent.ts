// ---------------------------------------------------------------------------
// deriveShotRetryStyleIntent.ts — GEN.PROJECT_STYLE.APPEND.TOGGLE.1
//
// Pure decision extracted from src/actions/generationJobs.ts's
// retryGenerationJob so it can be proven directly against real
// GenerationSnapshot fixtures, without a database or a redirect side effect.
// No DB, filesystem or network import.
// ---------------------------------------------------------------------------

import type { GenerationSnapshot } from "./generationSnapshot";
import { isGenerationConsumer, type GenerationConsumer } from "@/lib/projectStyle/generationStyleSource";
import type { ShotStyleIntent } from "./runShotGeneration";

const SHOT_STYLE_CONSUMERS: ReadonlySet<GenerationConsumer> = new Set(["shot-image", "shot-video", "shot-storyboard"]);

export type ShotRetryStyleDecision =
  | { ok: true; styleIntent: ShotStyleIntent; appendProjectStyleRequested: boolean }
  | { ok: false; error: string };

/**
 * STYLE.1.E.SURFACES.1 (retake) — retry must preserve the EXACT original
 * Style consumer (shot-image, shot-video or shot-storyboard), never collapse
 * it to a re-derived "normal" mode; a snapshot whose consumer is present but
 * not one of the three Shot consumers (corrupt or a foreign consumer such as
 * "asset") refuses the retry outright.
 *
 * GEN.PROJECT_STYLE.APPEND.TOGGLE.1 — `styleProvenance` alone cannot tell an
 * explicit prior opt-out apart from "Style was resolved but had no effective
 * content" (both leave it absent — see `appendProjectStyle`'s own doc
 * comment in generationSnapshot.ts). `appendProjectStyle === false` is
 * checked FIRST and always wins: an intentionally styleless job never gets
 * Style re-injected on retry, regardless of what `styleProvenance` would
 * otherwise imply. A legacy snapshot (queued before this ticket) carries
 * neither field and falls through to the pre-existing "auto" compatibility
 * behavior.
 */
export function deriveShotRetryStyleIntent(priorSnapshot: GenerationSnapshot | null): ShotRetryStyleDecision {
  const priorConsumer = priorSnapshot?.styleProvenance?.consumer;
  const priorAppendProjectStyle = priorSnapshot?.appendProjectStyle;

  let styleIntent: ShotStyleIntent;
  if (priorAppendProjectStyle === false) {
    styleIntent = "none";
  } else if (priorConsumer === undefined) {
    styleIntent = "auto";
  } else if (isGenerationConsumer(priorConsumer) && SHOT_STYLE_CONSUMERS.has(priorConsumer)) {
    styleIntent = priorConsumer as "shot-image" | "shot-video" | "shot-storyboard";
  } else {
    return { ok: false, error: "This job's Style provenance is corrupt or incompatible with Shot retry." };
  }

  return { ok: true, styleIntent, appendProjectStyleRequested: styleIntent !== "none" };
}
