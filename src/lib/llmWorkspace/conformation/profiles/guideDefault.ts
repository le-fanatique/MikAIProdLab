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
import type { ConformationProfile, ConformationRequest, ConformedReference } from "../types";

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

export const guideDefaultProfile: ConformationProfile = {
  id: "guide.default",
  name: "Default conformation guide",
  conformReferences,
};
