// ---------------------------------------------------------------------------
// applyProposedRules.ts — STYLE.LLM.LOOKFEEDBACK.UI.1 (ticket 4b of
// "L'assistant de Project Style", 2026-08-23)
//
// The one sequencing step for approving a batch of proposed Style Rules
// through a caller-supplied "add one rule" function: it calls that function
// strictly in sequence — never `Promise.all`, never concurrently — and
// restarts every call from the revision the PREVIOUS call actually returned,
// never from a value captured once before the loop started. That is the
// concurrency trap this file exists to close: two sequential calls sharing
// the same `expectedRevision` make the server refuse the second as stale
// (`STYLE.LLM.ADJUST.UI.1`'s own vigilance point, restated in this ticket).
//
// Pure in the sense this repository means it: no `@/db` import, no
// `"use server"`, no React. It knows nothing about Server Actions, HTTP, or
// components — only about a rule list and an injected async function. Both
// `StyleAdjustAssistPanel.tsx` and `StyleFeedbackPanel.tsx` approve rules
// through this single implementation; this is the only place in the chantier
// this sequencing logic exists.
//
// Stops at the first failure and reports exactly what happened: how many
// rules were actually added, which one failed and why, and which ones were
// never attempted. An empty rule list is a normal case (0 added, nothing
// failed, nothing remaining) — never an error.
// ---------------------------------------------------------------------------

/** The outcome of adding exactly one rule. `TRevision` is left generic
 * because callers differ in what they track as "revision": a Server Action
 * that owns concurrency control directly (`addRuleAction`) returns and
 * consumes the real `project_style_drafts.revision`; a caller that delegates
 * to an already-existing handler with its own internal revision tracking
 * (`ProjectStyleWorkspace.tsx`'s `handleAddRule`) has nothing meaningful of
 * its own to thread and may use `TRevision = null` throughout — this helper
 * does not interpret the value, it only carries whatever the caller's own
 * add function returns forward into that same function's next call. */
export type AddRuleOutcome<TRevision> = { ok: true; revision: TRevision } | { ok: false; error: string };

/** Adds exactly one rule, using `expectedRevision` as this attempt's
 * optimistic-concurrency token. Called strictly one at a time, in the order
 * `applyProposedRules` was given its rules — never in parallel. */
export type AddRuleFn<TRule, TRevision> = (rule: TRule, expectedRevision: TRevision) => Promise<AddRuleOutcome<TRevision>>;

export type ApplyProposedRulesResult<TRule, TRevision> = {
  /** How many rules were actually added, in order, before either finishing
   * the list or hitting a failure. */
  addedCount: number;
  /** The rule whose `addRule` call returned `ok: false`, and its message —
   * `null` when every rule was added, or when `rules` was empty. */
  failed: { rule: TRule; message: string } | null;
  /** Rules never attempted: everything after the failed one, or the whole
   * list unattempted if the very first call failed. Always `[]` when
   * `failed` is `null`. */
  remaining: TRule[];
  /** The last revision known to be correct: the value returned by the last
   * successful `addRule` call, or `initialRevision` unchanged if none
   * succeeded. */
  revision: TRevision;
};

/**
 * Applies `rules` one at a time through `addRule`, starting from
 * `initialRevision`. Stops at the first failure rather than continuing past
 * it — a partially-applied batch is reported precisely, never silently
 * skipped over or retried.
 */
export async function applyProposedRules<TRule, TRevision>(
  rules: readonly TRule[],
  initialRevision: TRevision,
  addRule: AddRuleFn<TRule, TRevision>
): Promise<ApplyProposedRulesResult<TRule, TRevision>> {
  let revision = initialRevision;
  let addedCount = 0;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const outcome = await addRule(rule, revision);
    if (!outcome.ok) {
      return {
        addedCount,
        failed: { rule, message: outcome.error },
        remaining: rules.slice(i + 1),
        revision,
      };
    }
    revision = outcome.revision;
    addedCount += 1;
  }

  return { addedCount, failed: null, remaining: [], revision };
}
