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
    shotSize: string | null;
    cameraPosition: string | null;
    cameraMovement: string | null;
    movementSpeed: string | null;
    cameraSubject: string | null;
    /** Secondary by design: the guide says focal length supplements, never replaces, the observable result. Printed last. */
    cameraLens: string | null;
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
   * The effective lighting for this Shot — **one value, already resolved by
   * precedence** (`resolveStoryboardLighting`), not three levels to
   * concatenate.
   *
   * The author refines his rig by copying a level down and editing the text,
   * the way `sequence_style_overrides` copies a Project Style snapshot and
   * replaces it whole. So the value arriving here already contains whatever it
   * inherited, as he rewrote it; rendering the levels separately would print
   * the same ambiance twice.
   *
   * `null` renders no lighting at all and never refuses — he generates without
   * a lighting direction on purpose, as a proof of concept of action and
   * framing, while the environment is still unlocked.
   */
  lighting: string | null;
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

  // B19e — the camera line follows the Seedance 2.5 template's own order,
  // `shot size + camera position + camera movement`, with the speed attached
  // to the movement it qualifies and the subject last, since it is the prose
  // that names what the move targets.
  const movement = joinFragments(
    [nonEmpty(continuity.movementSpeed), nonEmpty(continuity.cameraMovement)],
    " "
  );
  // Precedence, not accumulation: the Shot's own axis wins, and the legacy
  // free-text field stands in only while that axis is empty. The instruction
  // that filled 88 shots asked for "camera angle, lens, position" in
  // `cameraPitch`, so it is their only angle until B19f converts them — and
  // this fallback disables itself, shot by shot, as the axis fills. Adding
  // both would state the angle twice, in two vocabularies.
  const position = nonEmpty(continuity.cameraPosition) ?? nonEmpty(shot.cameraPitch);
  const cameraPhrases = [
    nonEmpty(continuity.shotSize),
    position,
    movement,
    nonEmpty(continuity.cameraSubject),
    nonEmpty(continuity.cameraLens),
  ].filter((phrase): phrase is string => phrase !== null && phrase.length > 0);

  /**
   * What the guide's "one move per shot" is actually about. Counting filled
   * camera *fields* — which is what the profile received until now — warned on
   * a shot that named a size and a movement, which is exactly correct usage,
   * and would have warned on every shot once four axes existed.
   */
  const cameraMovements = [nonEmpty(continuity.cameraMovement)].filter(
    (m): m is string => m !== null
  );

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
    { id: "lighting", label: "Lighting", text: nonEmpty(input.lighting) },
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
    camera: { phrases: cameraPhrases, movements: cameraMovements },
  });

  const findings = profile.inspect({
    references: conformationReferences,
    camera: { phrases: cameraPhrases, movements: cameraMovements },
    body: text,
    // `lightingMissing` fires only when nothing resolved at any level — the
    // one case the author called "no lighting direction yet". Advisory, never
    // a gate.
    lighting: nonEmpty(input.lighting),
    // Images only for now: video carries no role column and audio has no
    // entity at all (§5.6), so there is no second family to count yet.
    fileTagCount: conformationReferences.length,
  });

  return { text, parts, references, findings };
}
