// ---------------------------------------------------------------------------
// assetAlignmentBatch.ts — STYLE.ALIGN.BATCH.1
//
// Pure, DB/network-free decision extracted from AssetAlignmentBatchPanel.tsx
// per `.claude/rules/frontend.md` ("keep business logic out of Client
// Components"): given an Asset's current alignment status (read via the
// FROZEN `getAssetAlignmentStatusAction`, untouched by this ticket), which
// Assets count as out of date relative to the active Project Style version
// — the set the batch panel's "Select Needing Review" quick-pick offers.
//
// "no-active-style" is deliberately NOT stale: there is nothing to review an
// Asset against, so pre-selecting it would only route straight into the
// generate action's own "no active published Project Style" refusal.
// "aligned" is deliberately NOT stale: the Asset already matches the active
// version's own fingerprint check.
// ---------------------------------------------------------------------------

import type { AssetAlignmentStatus } from "@/actions/assetAlignment";

/**
 * True when the Asset's Style alignment review is out of date relative to
 * the active Project Style version — never reviewed, reviewed against a
 * since-superseded version, or reviewed against fields that later changed.
 * `null` (status failed to load, or could not be resolved) is never stale —
 * the caller has no basis to claim it needs review.
 */
export function isAssetAlignmentStatusStale(status: AssetAlignmentStatus | null): boolean {
  if (!status) return false;
  return status.kind === "not-reviewed" || status.kind === "style-changed" || status.kind === "asset-changed";
}
