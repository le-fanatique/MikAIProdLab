/**
 * Canonical LLM Apply action visual contract (FB-20260716-034 / FB-20260716-037).
 * Matches the Save Changes treatment in OllamaSettingsForm.tsx byte for byte
 * (bg/border/text, hover, disabled) so every LLM-generated-content Apply
 * control shares one implementation instead of a copied color string per
 * component. Callers keep their own padding/text-size/font-weight; this
 * class only carries the shared color/interaction contract and expects a
 * native `disabled` attribute on the button to drive the `disabled:`
 * variants below — it never changes when a button is enabled/disabled,
 * only what that state looks like.
 *
 * FB-20260716-037 retake — the `focus-visible:*` ring reuses the exact
 * token/values already established for keyboard focus elsewhere in the app
 * (e.g. AssetAlignmentPanel.tsx's buttonClass/smallButtonClass/
 * linkButtonClass), so Apply controls gain visible keyboard focus without
 * inventing a new focus treatment. OllamaSettingsForm.tsx's Save Changes
 * button was updated to carry the same ring, keeping the canonical
 * reference aligned with every button that now shares this contract.
 */
export const LLM_APPLY_ACTION_CLASS =
  "rounded border border-[#2c3035] bg-[#2c3035] text-[#e7e9ec] hover:bg-[#3a4046] hover:border-[#3a4046] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:bg-[#1a1d20] disabled:border-[#1a1d20] disabled:text-[#4b5158] disabled:cursor-not-allowed disabled:hover:bg-[#1a1d20] disabled:hover:border-[#1a1d20]";
