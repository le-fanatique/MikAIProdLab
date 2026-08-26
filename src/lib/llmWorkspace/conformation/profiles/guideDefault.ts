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

import { normalizeReferenceImageRoleValue, getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";
import type {
  ConformationFinding,
  ConformationInspectionRequest,
  ConformationProfile,
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
 * SHOTPROMPT.HEADER.1 — the guide's named mode for a raw stored role, used by
 * `buildSequenceStoryboardPrompt.ts`'s `Subject Definition:` line.
 *
 * SHOTPROMPT.CONFORM.1 removed this table's other reader, `conformReferences`
 * — a second, wrong implementation of `@ImageN` numbering that duplicated
 * `orderStoryboardReferences.ts` (`docs/WHERE_THE_RULES_LIVE.md`) and was dead
 * on every consumed path. `ROLE_TO_GUIDE_MODE` itself, and this function,
 * stay: `inspect` below does not use them, but the header does.
 *
 * A role with no named mode (or no role at all) returns `null` — never an
 * invented mode.
 */
export function getGuideModeForRole(role: string | null): string | null {
  const normalized = normalizeReferenceImageRoleValue(role);
  return normalized ? ROLE_TO_GUIDE_MODE[normalized] ?? null : null;
}

/**
 * REFROLE.INTENT.1 — the roles a caller may offer as a job-level override
 * for `getGuideModeForRole`, i.e. exactly the ones with a named mode. Reads
 * `ROLE_TO_GUIDE_MODE`'s own keys rather than a second, hand-copied list, so
 * a role added to that table later is offered automatically. The catalogue
 * label (`src/lib/referenceImageRoles.ts`) is reused for display; a key
 * missing from the catalogue (should not happen — every key above is a
 * catalogue value) falls back to the raw role string rather than throwing.
 */
export function getRolesWithNamedGuideMode(): { value: string; label: string }[] {
  return Object.keys(ROLE_TO_GUIDE_MODE).map((value) => ({
    value,
    label: getReferenceImageRoleLabel(value) ?? value,
  }));
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
/**
 * The engine's hard limits, 2.5: 30 images, 10 videos, 10 audios, 50 assets
 * total (SHOTPROMPT.CONFORM.1, ajustement #5). Video and audio are not
 * composed into a prompt yet (see `fileTagCount`'s own comment in
 * `../types.ts`), so only the image and total caps have a check today.
 */
export const IMAGE_TAG_CAP = 30;
export const FILE_TAG_CAP = 50;

/**
 * Splits on whitespace after trimming and drops empty strings. Not a smarter
 * tokenizer on purpose — the guide gives a range, not a precise measure, and
 * an exact word count does not exist.
 */
function countWords(body: string): number {
  return body.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Non-blank statements only — a blank entry does not count as an instruction.
 *
 * B19e feeds this `camera.movements`, not every camera phrase. The guide asks
 * for one *move* per shot; it does not ask that only one camera field be
 * filled. Counting fields warned on a shot that named a size and a movement —
 * correct usage — and would have warned on every shot once four axes existed.
 */
function countCameraPhrases(cameraPhrases: string[]): number {
  return cameraPhrases.filter((phrase) => phrase.trim().length > 0).length;
}

function inspect(request: ConformationInspectionRequest): ConformationFinding[] {
  const findings: ConformationFinding[] = [];

  // SHOTPROMPT.CONFORM.1 (ajustement #3c), renamed by PROMPT.DOCTOR.2: the
  // guide's 60-100 word budget targets its own **mono-plan formula**, never
  // any other composition — `composeStoryboardShot`'s seven-part template is
  // not that formula and never will be (`docs/WHERE_THE_RULES_LIVE.md`).
  // `inspect` cannot tell which formula produced `body` on its own, so the
  // caller states it via `isGuideMonoPlanFormula` — only counted when true.
  if (request.isGuideMonoPlanFormula) {
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
  }

  const cameraPhraseCount = countCameraPhrases(request.camera.movements);
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
  inspect,
};
