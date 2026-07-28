"use client";

// ---------------------------------------------------------------------------
// AssetAlignmentPanel.tsx — STYLE.1.F.UI (Retake Round 1)
//
// Client review workflow for the frozen STYLE.1.F.CORE contract:
//   status -> generate temporary proposal -> inspect/edit five Asset fields
//   -> explicitly apply or discard -> refresh durable status.
//
// Consumes generateAssetAlignmentProposalAction / applyAssetAlignmentAction
// / getAssetAlignmentStatusAction and their exported types exactly as
// written — no wrapper Server Action, no change to prompts, parsers,
// fingerprint logic, normalization, transactions, schema or migration.
//
// The temporary proposal and every local edit live ONLY in this component's
// React state — never a URL parameter, localStorage, sessionStorage or a
// new DB table.
//
// Codex Round 1 findings fixed here:
//   - Generate and Apply are now guarded by a synchronous `useRef` latch,
//     acquired before the first `await` — a React state check alone cannot
//     prevent two same-tick events from both passing the guard, since state
//     updates are scheduled, not synchronous.
//   - Every action that would replace a successful proposal's edits now
//     routes through one shared `requestGenerate` confirmation gate — no
//     button bypasses it while a "success" proposal with local edits exists.
//   - A committed Apply no longer pretends `window.location.href` is an
//     observable operation. It reconciles local status to the exact
//     committed version, requests a Next.js App Router refresh (which keeps
//     this component mounted so a recovery command is always reachable),
//     and never calls Apply again for this mounted proposal — the mutation
//     latch stays permanently closed after success.
// ---------------------------------------------------------------------------

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  generateAssetAlignmentProposalAction,
  applyAssetAlignmentAction,
  type AssetAlignmentStatus,
  type GetAssetAlignmentStatusResult,
} from "@/actions/assetAlignment";
import { ASSET_ALIGNMENT_EDITABLE_FIELDS, type AssetAlignmentEditableField, type AssetAlignmentFieldValues, type AssetAlignmentOutcome, type AssetAlignmentProposal } from "@/lib/projectStyle/assetAlignment/contracts";
import { hasAlignmentFieldChanges } from "@/lib/projectStyle/assetAlignment/compareFields";

const FIELD_LABELS: Record<AssetAlignmentEditableField, string> = {
  description: "Description",
  notes: "Notes",
  visualIdentity: "Visual Identity",
  usageRules: "Usage / Performance Rules",
  forbiddenVariations: "Forbidden Variations",
};

type GenerateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "stale"; message: string }
  | { status: "error"; message: string }
  | {
      status: "success";
      proposal: AssetAlignmentProposal;
      styleVersion: { id: number; versionNumber: number };
      baselineFingerprint: string;
      baseline: AssetAlignmentFieldValues;
      fields: AssetAlignmentFieldValues;
    };

/** `committed` is permanent for the lifetime of this mounted instance — Apply must never be called again once reached (Codex Round 1 P1). */
type ApplyPhase = "idle" | "committed";

type Props = {
  projectId: number;
  assetId: number;
  initialStatus: GetAssetAlignmentStatusResult;
};

// ── Shared visual primitives (this panel only) ──────────────────────────

const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2.5 py-1.5 text-xs text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const linkButtonClass =
  "text-xs text-[#6e767d] hover:text-[#a4abb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const textareaClass =
  "w-full rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-y focus:outline-none focus:border-[#3a4046] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors leading-relaxed";
const labelClass = "text-[10px] font-medium uppercase tracking-wider text-[#4b5158]";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed min-h-[1.5rem]">
        {value || <span className="text-[#4b5158]">(empty)</span>}
      </p>
    </div>
  );
}

/** Exported alongside the default component so its exact user-visible copy can be proven directly, without needing a browser to expand the collapsed panel (this file's own `"use client"` directive is a Next.js bundling marker only — a plain module import sees ordinary named exports). */
export function statusMessage(status: AssetAlignmentStatus): string {
  switch (status.kind) {
    case "no-active-style":
      return "No active published Project Style.";
    case "not-reviewed":
      return `Not reviewed against Project Style v${status.activeStyleVersionNumber}.`;
    case "aligned":
      return `Aligned with Project Style v${status.styleVersionNumber}.`;
    case "style-changed":
      return `Project Style changed from v${status.reviewedStyleVersionNumber} to v${status.activeStyleVersionNumber} since the last review.`;
    case "asset-changed":
      return `This Asset changed since its Project Style v${status.styleVersionNumber} review.`;
  }
}

export function generateCtaLabel(status: GetAssetAlignmentStatusResult): string {
  if (!status.ok) return "Review against Project Style";
  switch (status.status.kind) {
    case "not-reviewed":
      return "Review against Project Style";
    case "aligned":
      return "Review Again";
    case "style-changed":
    case "asset-changed":
      return "Review Current Style";
    case "no-active-style":
      return "Review against Project Style";
  }
}

export default function AssetAlignmentPanel({ projectId, assetId, initialStatus }: Props) {
  const router = useRouter();
  const [statusOverride, setStatusOverride] = useState<AssetAlignmentStatus | null>(null);
  const [generateState, setGenerateState] = useState<GenerateState>({ status: "idle" });
  const [regenerateConfirming, setRegenerateConfirming] = useState(false);
  const [discardConfirming, setDiscardConfirming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle");

  // Synchronous single-flight latches — checked and set BEFORE the first
  // `await`, so two events delivered in the same tick (double click, Enter
  // held down) cannot both pass the guard. The React state above
  // (`generateState.status`, `isApplying`) drives disabled labels for
  // accessibility/UX only; it is never the concurrency lock, since a state
  // update is scheduled and not yet visible to a second synchronous event
  // handler call (Codex Round 1 P1).
  const generateInFlightRef = useRef(false);
  // Acquired before Apply's first await; released ONLY on a pre-commit
  // refusal or thrown error. Once Apply succeeds it is never reset — Apply
  // must never be called again for this mounted proposal.
  const applyLatchRef = useRef(false);

  // Codex Round 2 P2 — `initialStatus` must stay a LIVE prop, never frozen
  // in a one-time `useState` initializer: after Apply commits and calls
  // `router.refresh()`, page.tsx re-renders with a fresh `initialStatus`
  // (or the same still-mounted component keeps observing whatever prop
  // value it is given). A confirmed `statusOverride` from a successful
  // Apply always takes precedence over the initial read — including over
  // an initial LOAD ERROR — since it is known-current, server-confirmed
  // state, never stale by construction.
  const status: GetAssetAlignmentStatusResult = statusOverride ? { ok: true, status: statusOverride } : initialStatus;
  const displayedStatus: AssetAlignmentStatus | null = status.ok ? status.status : null;
  const noActiveStyle = displayedStatus?.kind === "no-active-style";
  const locked = isApplying || applyPhase === "committed";

  function hasLocalEdits(): boolean {
    if (generateState.status !== "success") return false;
    return ASSET_ALIGNMENT_EDITABLE_FIELDS.some((field) => generateState.fields[field] !== generateState.proposal.fields[field]);
  }

  async function runGenerate() {
    if (generateInFlightRef.current) return;
    generateInFlightRef.current = true;
    try {
      setGenerateState({ status: "loading" });
      setApplyError(null);
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("assetId", String(assetId));
      const result = await generateAssetAlignmentProposalAction(fd);
      if (!result.ok) {
        setGenerateState(result.stale ? { status: "stale", message: result.error } : { status: "error", message: result.error });
        return;
      }
      setGenerateState({
        status: "success",
        proposal: result.proposal,
        styleVersion: result.styleVersion,
        baselineFingerprint: result.baselineFingerprint,
        baseline: result.baseline,
        fields: { ...result.proposal.fields },
      });
    } catch (err) {
      setGenerateState({ status: "error", message: err instanceof Error ? err.message : "Unexpected error. Please try again." });
    } finally {
      generateInFlightRef.current = false;
    }
  }

  /**
   * The ONE path every generate-triggering control routes through — initial
   * review, Regenerate, and "Generate Fresh Proposal" shown after a stale
   * result or an Apply refusal. A "stale" generate result has no successful
   * proposal to protect and may retry directly; any "success" proposal with
   * local edits requires explicit confirmation first, regardless of which
   * button triggered the request (Codex Round 1 P1 — Generate Fresh
   * Proposal previously bypassed this).
   */
  function requestGenerate() {
    if (locked || generateInFlightRef.current) return;
    if (generateState.status === "success" && hasLocalEdits() && !regenerateConfirming) {
      setRegenerateConfirming(true);
      return;
    }
    setRegenerateConfirming(false);
    setDiscardConfirming(false);
    void runGenerate();
  }

  function handleGenerateSubmit(e: FormEvent) {
    e.preventDefault();
    requestGenerate();
  }

  function handleDiscardClick() {
    if (locked) return;
    if (hasLocalEdits() && !discardConfirming) {
      setDiscardConfirming(true);
      return;
    }
    setDiscardConfirming(false);
    setRegenerateConfirming(false);
    setApplyError(null);
    setGenerateState({ status: "idle" });
  }

  function setField(field: AssetAlignmentEditableField, value: string) {
    if (generateState.status !== "success") return;
    setGenerateState({ ...generateState, fields: { ...generateState.fields, [field]: value } });
  }

  async function handleApplySubmit(e: FormEvent) {
    e.preventDefault();
    if (generateState.status !== "success") return;
    if (applyLatchRef.current) return;
    applyLatchRef.current = true;

    setIsApplying(true);
    setApplyError(null);

    const fieldsChanged = hasAlignmentFieldChanges(generateState.baseline, generateState.fields);
    const outcome: AssetAlignmentOutcome = fieldsChanged ? "changes-proposed" : "already-aligned";

    try {
      const result = await applyAssetAlignmentAction({
        projectId,
        assetId,
        expectedStyleVersionId: generateState.styleVersion.id,
        expectedStyleVersionNumber: generateState.styleVersion.versionNumber,
        baselineFingerprint: generateState.baselineFingerprint,
        outcome,
        fields: generateState.fields,
      });

      if (!result.ok) {
        // Pre-commit refusal — release the latch, this is a legitimate
        // retry point (edit fields, or Generate Fresh Proposal).
        applyLatchRef.current = false;
        setIsApplying(false);
        setApplyError(result.error);
        return;
      }

      // Committed. The latch stays permanently closed from here — Apply is
      // never called again for this mounted proposal, regardless of what
      // happens below. Reconcile the visible status immediately from the
      // exact version CORE just confirmed (never re-derived or guessed),
      // and request an App Router refresh so the server-rendered Details
      // form picks up the committed fields — this keeps the component
      // mounted (unlike a full navigation), so a manual recovery command
      // stays reachable if the background refresh is silently lost.
      setIsApplying(false);
      setApplyPhase("committed");
      setStatusOverride({ kind: "aligned", styleVersionNumber: result.styleVersionNumber });
      router.refresh();
    } catch (err) {
      applyLatchRef.current = false;
      setIsApplying(false);
      setApplyError(err instanceof Error ? err.message : "Unexpected error. Please try again.");
    }
  }

  const fieldsChangedNow = generateState.status === "success" ? hasAlignmentFieldChanges(generateState.baseline, generateState.fields) : false;
  const applySubmitLabel = fieldsChangedNow ? "Apply to Asset" : "Confirm Alignment";

  return (
    <div className="flex flex-col gap-4">
      {status.ok ? (
        <p className="text-sm text-[#a4abb2]">{displayedStatus ? statusMessage(displayedStatus) : null}</p>
      ) : (
        <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
          {status.error}
        </p>
      )}

      {noActiveStyle && (
        <p className="text-xs text-[#6e767d]">
          <a
            href={`/projects/${projectId}/style`}
            className="text-[#5b93d6] hover:text-[#8fbbe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors"
          >
            Open Project Style ↗
          </a>
        </p>
      )}

      {applyPhase === "committed" && (
        <div className="text-xs text-[#6b9e72] border border-[#1f2e22] bg-[#0f1a12] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>Applied — Asset updated and aligned with Project Style v{statusOverride?.kind === "aligned" ? statusOverride.styleVersionNumber : ""}.</span>
          <button type="button" onClick={() => window.location.reload()} className={smallButtonClass}>
            Reload page
          </button>
        </div>
      )}

      {generateState.status === "idle" && applyPhase === "idle" && (
        <form onSubmit={handleGenerateSubmit}>
          <button type="submit" disabled={noActiveStyle} className={buttonClass}>
            {generateCtaLabel(status)}
          </button>
        </form>
      )}

      {generateState.status === "loading" && (
        <p className="text-xs text-[#6e767d] animate-pulse">Reviewing against Project Style…</p>
      )}

      {generateState.status === "stale" && (
        <div className="text-xs text-[#c9a24b] border border-[#4a3a1f] bg-[#1f1a10] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>{generateState.message}</span>
          <button type="button" onClick={requestGenerate} disabled={locked} className={smallButtonClass}>
            Generate Fresh Proposal
          </button>
        </div>
      )}

      {generateState.status === "error" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
            {generateState.message}
          </p>
          <button type="button" onClick={requestGenerate} disabled={locked || noActiveStyle} className={smallButtonClass}>
            Try Again
          </button>
        </div>
      )}

      {generateState.status === "success" && (
        <form onSubmit={handleApplySubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 border-b border-[#1e2124] pb-4">
            <p className="text-xs text-[#6e767d]">
              Reviewed against Project Style v{generateState.styleVersion.versionNumber}. Preview only — nothing is saved until you apply.
            </p>
            <ReadOnlyField label="Assessment" value={generateState.proposal.assessment} />
          </div>

          {generateState.proposal.outcome === "changes-proposed" && generateState.proposal.designChanges.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className={labelClass}>Structured Design Changes</span>
              <div className="flex flex-col gap-3">
                {generateState.proposal.designChanges.map((change, i) => (
                  <div key={`${change.field}-${i}`} className="rounded border border-[#1e2124] bg-[#141618] p-3 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-[#a4abb2]">{FIELD_LABELS[change.field]}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ReadOnlyField label="Current Basis" value={change.currentBasis} />
                      <ReadOnlyField label="Proposed Decision" value={change.proposedDecision} />
                      <ReadOnlyField label="Style Basis" value={change.styleBasis} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {ASSET_ALIGNMENT_EDITABLE_FIELDS.map((field) => (
              <div key={field} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ReadOnlyField label={`${FIELD_LABELS[field]} — Baseline`} value={generateState.baseline[field]} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`alignment-${field}`} className={labelClass}>
                    {FIELD_LABELS[field]} — Proposed
                  </label>
                  <textarea
                    id={`alignment-${field}`}
                    value={generateState.fields[field]}
                    onChange={(e) => setField(field, e.target.value)}
                    rows={3}
                    disabled={locked}
                    className={textareaClass}
                  />
                </div>
              </div>
            ))}
          </div>

          {applyError && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
                {applyError}
              </p>
              <button type="button" onClick={requestGenerate} disabled={locked} className={smallButtonClass}>
                Generate Fresh Proposal
              </button>
            </div>
          )}

          {regenerateConfirming && (
            <div className="text-xs text-[#c9a24b] border border-[#4a3a1f] bg-[#1f1a10] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <span>Regenerating will discard your edits to this proposal. Continue?</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={requestGenerate} className={smallButtonClass}>
                  Confirm Regenerate
                </button>
                <button type="button" onClick={() => setRegenerateConfirming(false)} className={linkButtonClass}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {discardConfirming && (
            <div className="text-xs text-[#c9a24b] border border-[#4a3a1f] bg-[#1f1a10] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <span>Discarding will lose your edits to this proposal. Continue?</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleDiscardClick} className={smallButtonClass}>
                  Confirm Discard
                </button>
                <button type="button" onClick={() => setDiscardConfirming(false)} className={linkButtonClass}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-3 flex-wrap">
            <button type="submit" disabled={locked} className={buttonClass}>
              {isApplying ? "Applying…" : applySubmitLabel}
            </button>
            <button type="button" onClick={handleDiscardClick} disabled={locked} className={linkButtonClass}>
              Discard Proposal
            </button>
            <button type="button" onClick={requestGenerate} disabled={locked} className={linkButtonClass}>
              Regenerate
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
