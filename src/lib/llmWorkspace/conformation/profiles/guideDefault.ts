// ---------------------------------------------------------------------------
// conformation/profiles/guideDefault.ts — LLMW.CONFORMATION.1 (B13a)
//
// The default conformation profile: the *Seedance 2.0 Complete Prompting
// Guide*'s rules, applied as a norm rather than adopted as a target
// (`docs/LLM_WORKSPACE_PRODUCT_VISION.md` §5.5 — *"l idee n etait pas de
// bloquer l app autour de seedance, mais tablé sur le fait que cette logique
// de prompt et workflow de prompt etait plutot commune entre les model"*).
//
// **This file is the only place engine knowledge lives.**
// `src/lib/referenceImageRoles.ts` is the *app's* vocabulary — twenty roles
// with their aliases, categories and display order — and it is untouched by
// this ticket. That `first_frame` should be rendered to a model as
// `as first frame` is the *guide's* way of using that role, not a property of
// the role. A second engine declares a second profile with its own table; the
// catalogue never learns either exists.
//
// This is what makes §5.5's "replaceable per engine, nothing named after
// Seedance" true rather than merely written down.
// ---------------------------------------------------------------------------

import { normalizeReferenceImageRoleValue } from "@/lib/referenceImageRoles";
import type {
  ConformationFinding,
  ConformationInspectionRequest,
  ConformationProfile,
  ConformationRequest,
  ConformedReference,
} from "../types";

/**
 * The guide's five named image modes, keyed by the catalogue role that carries
 * each. §5.5 lists exactly these five: `as first frame`, `as last frame`,
 * `as character reference`, `as style reference`, `as background environment`.
 *
 * **`keyframe` is deliberately absent, and that is a decision, not an
 * oversight.** The catalogue offers `first_frame` and `keyframe` as two
 * separate roles, and the user picked one of them. Folding `keyframe` into
 * `as first frame` would be choosing on their behalf — the same reason
 * `docs/LLM_WORKSPACE_ARCHITECTURE.md` §11.3 gives for not inventing an
 * election rule when several environments carry lighting. If the author later
 * says the two mean the same thing to him, that is a one-line change here,
 * made on his word rather than on a guess.
 *
 * The other fourteen catalogue roles are absent for the same reason: the guide
 * names five modes, so five roles have one.
 */
const ROLE_TO_GUIDE_MODE: Readonly<Record<string, string>> = {
  first_frame: "as first frame",
  last_frame: "as last frame",
  character: "as character reference",
  style: "as style reference",
  environment: "as background environment",
};

/**
 * Renders each stored reference into its `@ImageN` tag and, when its role has
 * one, the guide's named mode for it.
 *
 * **Order.** The ordinal follows the request's own order — which is the stored
 * order, which is the order the user arranged — and never the role. §5.6's
 * whole point is that this information *"is already in the database"*; a
 * re-sort here would throw away the one thing the Prompt Compiler used to make
 * the user restate by hand.
 *
 * **A role with no named mode keeps its tag and gets `mode: null`.** Three
 * options existed and two are wrong: dropping the reference loses an image the
 * user deliberately filed, and inventing a mode lies to the engine. Tagging it
 * without a mode is the only one that neither loses data nor fabricates any —
 * the caller can still name `@Image3` in the prose, which is exactly what an
 * untyped reference is for.
 *
 * **An unrecognized or absent role is treated as a role with no mode**, not as
 * an error. `normalizeReferenceImageRoleValue` returns `null` for anything the
 * catalogue does not know, including a legacy value written before a rename;
 * refusing there would make a stale row unrenderable rather than merely
 * unlabelled.
 */
function conformReferences(request: ConformationRequest): ConformedReference[] {
  return request.references.map((reference, index) => {
    const role = normalizeReferenceImageRoleValue(reference.role);
    return {
      tag: `@Image${index + 1}`,
      mode: role ? ROLE_TO_GUIDE_MODE[role] ?? null : null,
      role,
      label: reference.label,
    };
  });
}

// ---------------------------------------------------------------------------
// Output discipline — LLMW.CONFORMATION.2 (B13b)
//
// §5.6, "Missing output discipline": nothing counted words against the
// budget, enforced the one-primary-camera rule, or capped tags at the
// engine's limits. This is that check, expressed as `inspect`.
//
// **Findings, never exceptions.** §5.4 is categorical: formatting is a
// technical stage the app owns, never a rule the user obeys. A prompt over
// budget is still a prompt — `inspect` reports what is off, it never throws
// and never refuses.
//
// The guide's numbers live here as named constants, because — like the
// image-mode table above — they are the guide's own knowledge, and nowhere
// else in the codebase should know them (B13a's decision, carried forward).
// ---------------------------------------------------------------------------

/** The guide's word budget: 60–100 words is the target range. */
const WORD_BUDGET_MIN = 60;
const WORD_BUDGET_MAX = 100;
/** The guide's hard cap, past which the prompt is well outside its intended shape. */
const WORD_HARD_CAP = 150;
/** The guide's per-engine tag caps: 9 images, 12 files total. */
const IMAGE_TAG_CAP = 9;
const FILE_TAG_CAP = 12;

/**
 * Splits on whitespace after trimming and drops empty strings. Not a smarter
 * tokenizer on purpose — the guide gives a range, not a precise measure, and
 * an exact word count does not exist.
 */
function countWords(body: string): number {
  return body.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

/** Non-blank camera phrases only — a blank entry does not count as an instruction. */
function countCameraPhrases(cameraPhrases: string[]): number {
  return cameraPhrases.filter((phrase) => phrase.trim().length > 0).length;
}

function inspect(request: ConformationInspectionRequest): ConformationFinding[] {
  const findings: ConformationFinding[] = [];

  const wordCount = countWords(request.body);
  if (wordCount > WORD_HARD_CAP) {
    findings.push({
      code: "wordBudget",
      severity: "warn",
      message: `The prompt body is ${wordCount} words, past the guide's ${WORD_HARD_CAP}-word hard cap.`,
    });
  } else if (wordCount > WORD_BUDGET_MAX) {
    findings.push({
      code: "wordBudget",
      severity: "warn",
      message: `The prompt body is ${wordCount} words, over the guide's ${WORD_BUDGET_MIN}–${WORD_BUDGET_MAX} word budget.`,
    });
  } else if (wordCount < WORD_BUDGET_MIN) {
    findings.push({
      code: "wordBudget",
      severity: "warn",
      message: `The prompt body is ${wordCount} words, under the guide's ${WORD_BUDGET_MIN}–${WORD_BUDGET_MAX} word budget.`,
    });
  }

  const cameraPhraseCount = countCameraPhrases(request.cameraPhrases);
  if (cameraPhraseCount !== 1) {
    findings.push({
      code: "primaryCamera",
      severity: "warn",
      message:
        cameraPhraseCount === 0
          ? "No primary camera instruction is set; the guide wants exactly one."
          : `${cameraPhraseCount} camera instructions are set; the guide wants exactly one primary instruction.`,
    });
  }

  if (request.references.length > IMAGE_TAG_CAP) {
    findings.push({
      code: "imageTagCap",
      severity: "warn",
      message: `${request.references.length} images are referenced, past the engine's ${IMAGE_TAG_CAP}-image cap.`,
    });
  }

  if (request.fileTagCount > FILE_TAG_CAP) {
    findings.push({
      code: "fileTagCap",
      severity: "warn",
      message: `${request.fileTagCount} files are referenced in total, past the engine's ${FILE_TAG_CAP}-file cap.`,
    });
  }

  if (!request.lighting || request.lighting.trim().length === 0) {
    findings.push({
      code: "lightingMissing",
      severity: "info",
      message: "No lighting is set; the guide calls it the highest-leverage single element.",
    });
  }

  return findings;
}

export const guideDefaultProfile: ConformationProfile = {
  id: "guide.default",
  name: "Default conformation guide",
  conformReferences,
  inspect,
};
