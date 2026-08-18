// ---------------------------------------------------------------------------
// composition/storyboardShot.ts — LLMW.STORYBOARD.COMPOSE.1 (B14a)
//
// The storyboard prompt's composition, per Shot: the six-part formula of
// `docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.5, filled from the ingredients
// that already exist.
//
// **What this exists to fix.** §5.7 read the current path and found that per
// Shot it emits a header and then `compileShotPrompt(...)` — *"only the Shot
// Prompt text"*: *"the storyboard prompt contains no ingredient other than the
// Shot Prompt. No casting, no camera, no framing, no mood, no continuity, no
// project style… the recipe consumes one jar and has no access to the
// pantry."*
//
// And the pantry is **already resolved**: `buildSequenceGenerationPackage`
// builds a full `PromptCompilationContext` for every Shot — cast, asset
// bibles, sequence context, project context, references with their roles —
// and then calls `compileShotPrompt`, which reads none of it. The ingredients
// were never missing; they were computed and thrown away.
//
// **Assembly, not cooking** (§5.3): pure, deterministic, no model, no
// database, therefore never stored. No `server-only` — nothing here reads the
// disk or the database, and a preview must be able to call it.
//
// **Not named "recipe" on purpose.** §5.2 uses that word for E1's saved
// templates (*"listes de course sauvegardées"*); reusing it here would imply a
// kinship that does not exist.
//
// This module composes and inspects. It does not decide where the text goes:
// B14b wires it in as a choice made at generation time, with the existing
// composition remaining the default — the author's decision, 2026-08-18.
// ---------------------------------------------------------------------------

import type {
  PromptCompilationCastAsset,
  PromptCompilationContext,
} from "@/lib/prompts/buildPromptCompilationContext";
import { getConformationProfile, DEFAULT_CONFORMATION_PROFILE_ID } from "../conformation";
import type {
  ConformationFinding,
  ConformationProfileId,
  ConformedReference,
} from "../conformation";

export type StoryboardCompositionPartId =
  | "subject"
  | "action"
  | "environment"
  | "camera"
  // LLMW.STORYBOARD.LIGHTING.1 — §5.5 lists six parts but separately requires
  // "at least one lighting description, which it calls the single
  // highest-leverage element". It is therefore its own part rather than a
  // seventh member of the formula smuggled into Environment.
  | "lighting"
  | "style"
  | "constraints";

export type StoryboardCompositionPart = {
  id: StoryboardCompositionPartId;
  label: string;
  text: string;
};

export type StoryboardShotCompositionInput = {
  /** The already-resolved pantry — exactly what `buildSequenceGenerationPackage` computes per Shot today and discards. */
  context: PromptCompilationContext;
  /** Continuity/camera fields the Prompt Compiler contract does not carry (`SequenceGenerationContinuity`). */
  continuity: {
    framing: string | null;
    cameraMovement: string | null;
  };
  /**
   * The Project Style text.
   *
   * **An input, never a derivation.** `PromptCompilationContext.projectContext`
   * carries name / pitch / story, which is *not* style; treating the pitch as
   * style would be a confusion that outlives this ticket. The caller (B14b)
   * resolves it — the workspace already has `PROJECT.STYLE` for that.
   */
  projectStyle: string | null;
  /**
   * The lighting rig, at the three levels it is built at — **not a fallback
   * chain where the most specific value wins.**
   *
   * The author's own craft model (2026-08-19, as a former lighting supervisor
   * in animation): *"le plus malin c'est de travailler ton rig d'éclairage en
   * upstream et d'affiner jusqu'au shot"* — the environment carries the
   * ambiance, the Sequence adjusts that rig globally against the narration and
   * its master camera axes, and the Shot fine-tunes it to serve its characters
   * or its narrative sense.
   *
   * So the three levels **accumulate**. A Shot saying "rim-light the lead from
   * behind" is a refinement of its environment's cold ambiance, not a
   * replacement for it, and a prompt that carried only the Shot's line would
   * throw away the ambiance the whole scene is lit by.
   *
   * Any level may be absent. All three absent renders no lighting at all —
   * the author is explicit that an undefined rig must never block generation
   * (see `buildLighting` below).
   */
  lighting: {
    /** The environment Assets' ambiance, in the order they were resolved. The upstream rig. */
    environment: Array<{ name: string; lighting: string }>;
    /** The Sequence's own field: the global adjustment on that rig. */
    sequence: string | null;
    /** The Shot's own field: the fine tune. */
    shot: string | null;
  };
  profileId?: ConformationProfileId;
};

export type StoryboardShotComposition = {
  /** The non-empty parts, joined. */
  text: string;
  /** Only the parts that actually contributed — never a fabricated empty one. */
  parts: StoryboardCompositionPart[];
  references: ConformedReference[];
  findings: ConformationFinding[];
};

const PART_SEPARATOR = "\n\n";

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** `["a", null, "b"]` -> `"a — b"`, dropping blanks. */
function joinFragments(fragments: Array<string | null>, separator: string): string | null {
  const kept = fragments.filter((f): f is string => Boolean(f && f.trim().length > 0));
  return kept.length > 0 ? kept.join(separator) : null;
}

/**
 * Subject — who is in the shot. The cast in its stored order (never re-sorted:
 * that order is the user's), each with what distinguishes it. `visualIdentity`
 * from the Asset Bible is included when present because it is the Bible's
 * answer to exactly this question; `description` carries the rest.
 */
function buildSubject(cast: PromptCompilationCastAsset[]): string | null {
  const lines = cast
    .map((asset) =>
      joinFragments(
        [
          nonEmpty(asset.assetName),
          nonEmpty(asset.assetType),
          nonEmpty(asset.assetBible?.visualIdentity ?? null),
          nonEmpty(asset.description),
        ],
        " — "
      )
    )
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : null;
}

/**
 * Lighting — the rig, rendered upstream to downstream so the model reads it the
 * way it was built: ambiance first, then the sequence's adjustment, then the
 * shot's fine tune. Each line says which level it comes from, because "cold
 * blue glow" and "rim-light the lead" are not competing descriptions — one is
 * the room, the other is what was done to the subject inside it.
 *
 * **Absent when nothing is set, at any level, and never a refusal.** The
 * author's arbitration, 2026-08-19: *"je ne veux pas bloquer la machine si je
 * n'ai pas encore défini les ambiances lumineuses, surtout si mon environment
 * n'est pas encore locké… j'ai sûrement envie de pouvoir générer du contenu
 * sans ligne directrice de lighting, comme proof of concept de l'action et du
 * cadrage."* Nothing here gates; the conformation stage's own
 * `lightingMissing` finding stays `info`, which is exactly what it already is.
 */
function buildLighting(lighting: StoryboardShotCompositionInput["lighting"]): string | null {
  const lines: string[] = [];
  for (const environment of lighting.environment) {
    const value = nonEmpty(environment.lighting);
    if (value) lines.push(`- Environment (${environment.name}): ${value}`);
  }
  const sequence = nonEmpty(lighting.sequence);
  if (sequence) lines.push(`- Sequence: ${sequence}`);
  const shot = nonEmpty(lighting.shot);
  if (shot) lines.push(`- Shot: ${shot}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Constraints — what to avoid.
 *
 * Only `forbiddenVariations`, per asset, because that is the only negative
 * constraint the product actually stores. §5.6 is explicit that shot- and
 * project-level negative constraints have **no field at all**, that the author
 * named it a real gap in his own work, and that it is **explicitly not MVP**
 * (B18, after Chantier 2). This renders what exists and invents nothing.
 */
function buildConstraints(cast: PromptCompilationCastAsset[]): string | null {
  const lines = cast
    .map((asset) => {
      const forbidden = nonEmpty(asset.assetBible?.forbiddenVariations ?? null);
      if (!forbidden) return null;
      return `- ${asset.assetName}: ${forbidden}`;
    })
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Composes one Shot's storyboard prompt from the resolved pantry, and reports
 * what the conformation profile makes of the result.
 *
 * **A part with no ingredient is absent, never rendered empty.** The same rule
 * `compileShotPrompt` already states for its own sections ("never a fabricated
 * empty section") and the descriptor format applies to its blocks. A Shot with
 * no cast does not emit an orphan `Subject:` heading.
 *
 * **The camera reaches conformation as opaque phrases.** They are rendered
 * into the text here, but handed to `inspect` as strings it counts and never
 * reads — B13a's constraint, which exists because §5.6 forbids this stage from
 * freezing today's camera shape while B19 is scheduled to redesign it.
 */
export function composeStoryboardShot(
  input: StoryboardShotCompositionInput
): StoryboardShotComposition {
  const { context, continuity } = input;
  const shot = context.shot;

  const cameraPhrases = [shot.cameraPitch, continuity.framing, continuity.cameraMovement]
    .map((phrase) => nonEmpty(phrase))
    .filter((phrase): phrase is string => phrase !== null);

  const candidates: Array<{ id: StoryboardCompositionPartId; label: string; text: string | null }> = [
    { id: "subject", label: "Subject", text: buildSubject(context.castAssets) },
    {
      id: "action",
      // The jar is still an ingredient — it simply stops being the only one.
      label: "Action",
      text: joinFragments([nonEmpty(shot.actionPitch), nonEmpty(shot.shotPrompt)], "\n"),
    },
    {
      id: "environment",
      label: "Environment",
      text: joinFragments(
        [nonEmpty(context.sequenceContext?.locationHint ?? null), nonEmpty(context.sequenceContext?.mood ?? null)],
        " — "
      ),
    },
    { id: "camera", label: "Camera", text: cameraPhrases.length > 0 ? cameraPhrases.join(" — ") : null },
    // Placed after Camera and before Style, because the Sequence's own
    // adjustment is made "par rapport à la narration et les caméras axe master
    // de la séquence" — the rig is read against the camera, not against the
    // look.
    { id: "lighting", label: "Lighting", text: buildLighting(input.lighting) },
    { id: "style", label: "Style", text: nonEmpty(input.projectStyle) },
    { id: "constraints", label: "Constraints", text: buildConstraints(context.castAssets) },
  ];

  const parts: StoryboardCompositionPart[] = candidates
    .filter((c): c is { id: StoryboardCompositionPartId; label: string; text: string } => c.text !== null)
    .map(({ id, label, text }) => ({ id, label, text }));

  const text = parts.map((part) => `${part.label}: ${part.text}`).join(PART_SEPARATOR);

  const profile = getConformationProfile(input.profileId ?? DEFAULT_CONFORMATION_PROFILE_ID);
  const conformationReferences = context.references.map((reference) => ({
    role: reference.role,
    label: reference.label,
  }));

  const references = profile.conformReferences({
    references: conformationReferences,
    cameraPhrases,
  });

  const findings = profile.inspect({
    references: conformationReferences,
    cameraPhrases,
    body: text,
    // The whole rig, or nothing. `lightingMissing` therefore fires only when
    // no level is set at all — which is the one case the author called "no
    // lighting direction yet", and it stays an advisory, never a gate.
    lighting: buildLighting(input.lighting),
    // Images only for now: video carries no role column and audio has no
    // entity at all (§5.6), so there is no second family to count yet.
    fileTagCount: conformationReferences.length,
  });

  return { text, parts, references, findings };
}
