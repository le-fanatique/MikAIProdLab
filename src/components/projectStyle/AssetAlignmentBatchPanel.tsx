"use client";

// ---------------------------------------------------------------------------
// AssetAlignmentBatchPanel.tsx — STYLE.ALIGN.BATCH.1
//
// Batch entry point for the existing "Align with Project Style" flow
// (`AssetAlignmentPanel.tsx`, STYLE.1.F), on a selection of Assets instead of
// one at a time. Consumes `generateAssetAlignmentProposalAction` and
// `applyAssetAlignmentAction` exactly as written — no wrapper Server Action,
// no change to prompts, parsers, fingerprint logic, normalization,
// transactions, schema or migration.
//
// The governing rule (ticket, quoting §6.1 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md): nothing is written before approval.
// A batch align is NOT an automatic apply on N Assets. It is: generate
// proposals for the selected Assets, review them one card per Asset, then
// approve PER ASSET, explicitly. There is no "Apply All" here — deliberately
// absent, per the ticket.
//
// Generation is sequential (one Asset after another), with a readable
// progress count. A failure on one Asset does not stop the others — unlike
// a rules list, these calls are independent: each Asset carries its own
// result or its own error.
//
// Review is read-only here, with a link to the Asset's detail page. Making
// it editable in place, like the detail page's AssetAlignmentPanel, would
// require moving that panel's own generate/edit state into this file (it has
// no "controlled proposal" mode) — which the ticket allows only "if reusable
// without moving state". It is not, so this stays read-only by the ticket's
// own fallback.
//
// Every generated proposal and every Apply outcome lives ONLY in this
// component's React state — never a URL parameter, localStorage,
// sessionStorage or a new DB table, same discipline as AssetAlignmentPanel.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import Link from "next/link";
import {
  generateAssetAlignmentProposalAction,
  applyAssetAlignmentAction,
  type AssetAlignmentStatus,
} from "@/actions/assetAlignment";
import {
  ASSET_ALIGNMENT_EDITABLE_FIELDS,
  type AssetAlignmentEditableField,
  type AssetAlignmentFieldValues,
  type AssetAlignmentOutcome,
  type AssetAlignmentProposal,
} from "@/lib/projectStyle/assetAlignment/contracts";
import { hasAlignmentFieldChanges } from "@/lib/projectStyle/assetAlignment/compareFields";
import { isAssetAlignmentStatusStale } from "@/lib/projectStyle/assetAlignmentBatch";
import { statusMessage } from "@/components/projectStyle/AssetAlignmentPanel";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import { LLM_APPLY_ACTION_CLASS } from "@/lib/uiClasses";

export type BatchAlignmentAssetItem = {
  id: number;
  name: string;
  type: string;
  /** Read via the frozen `getAssetAlignmentStatusAction`, resolved server-side by the page that mounts this panel. `null` when that read failed for this Asset — `statusError` then carries the reason. */
  status: AssetAlignmentStatus | null;
  statusError: string | null;
};

type Props = {
  projectId: number;
  assets: BatchAlignmentAssetItem[];
};

// Local display copy only — duplicated from AssetAlignmentPanel.tsx's own
// (unexported) FIELD_LABELS rather than importing it, since that file is a
// frozen panel of the previous chantier this ticket must not modify (e.g. to
// export it).
const FIELD_LABELS: Record<AssetAlignmentEditableField, string> = {
  description: "Description",
  notes: "Notes",
  visualIdentity: "Visual Identity",
  usageRules: "Usage / Performance Rules",
  forbiddenVariations: "Forbidden Variations",
};

type ItemGenState =
  | { kind: "pending" }
  | { kind: "generating" }
  | {
      kind: "success";
      proposal: AssetAlignmentProposal;
      styleVersion: { id: number; versionNumber: number };
      baselineFingerprint: string;
      baseline: AssetAlignmentFieldValues;
    }
  | { kind: "error"; message: string; stale?: boolean };

type ItemApplyState =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "applied"; styleVersionNumber: number }
  | { kind: "error"; message: string };

type BatchState = "idle" | "running" | "done";

const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const linkButtonClass =
  "text-xs text-[#6e767d] hover:text-[#a4abb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const applySubmitButtonClass = `px-2.5 py-1 text-xs font-medium ${LLM_APPLY_ACTION_CLASS}`;
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

export default function AssetAlignmentBatchPanel({ projectId, assets }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchState, setBatchState] = useState<BatchState>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [genResults, setGenResults] = useState<Record<number, ItemGenState>>({});
  const [applyResults, setApplyResults] = useState<Record<number, ItemApplyState>>({});

  // Synchronous single-flight latch per Asset, acquired before Apply's first
  // `await` — a React state check alone cannot prevent two same-tick events
  // (double click) from both passing the guard, since state updates are
  // scheduled, not synchronous. Same idiom as AssetAlignmentPanel.tsx's
  // `applyLatchRef`. Once an Asset's Apply succeeds its id stays in this set
  // forever — Apply is never called again for that mounted proposal.
  const applyLocksRef = useRef<Set<number>>(new Set());
  // Synchronous single-flight latch for the whole generate run.
  const generateInFlightRef = useRef(false);

  const noActiveStyle = assets.length > 0 && assets.every((a) => a.status?.kind === "no-active-style");

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectNeedingReview() {
    setSelected(new Set(assets.filter((a) => isAssetAlignmentStatusStale(a.status)).map((a) => a.id)));
  }

  function selectAll() {
    setSelected(new Set(assets.map((a) => a.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleGenerate() {
    if (selected.size === 0 || generateInFlightRef.current) return;
    generateInFlightRef.current = true;

    const ids = assets.filter((a) => selected.has(a.id)).map((a) => a.id);
    const initial: Record<number, ItemGenState> = {};
    for (const id of ids) initial[id] = { kind: "pending" };

    setGenResults(initial);
    setApplyResults({});
    applyLocksRef.current = new Set();
    setBatchState("running");
    setProgress({ done: 0, total: ids.length });

    for (const id of ids) {
      setGenResults((prev) => ({ ...prev, [id]: { kind: "generating" } }));
      try {
        const fd = new FormData();
        fd.set("projectId", String(projectId));
        fd.set("assetId", String(id));
        const result = await generateAssetAlignmentProposalAction(fd);
        if (!result.ok) {
          setGenResults((prev) => ({ ...prev, [id]: { kind: "error", message: result.error, stale: result.stale } }));
        } else {
          setGenResults((prev) => ({
            ...prev,
            [id]: {
              kind: "success",
              proposal: result.proposal,
              styleVersion: result.styleVersion,
              baselineFingerprint: result.baselineFingerprint,
              baseline: result.baseline,
            },
          }));
        }
      } catch (err) {
        setGenResults((prev) => ({
          ...prev,
          [id]: { kind: "error", message: err instanceof Error ? err.message : "Unexpected error. Please try again." },
        }));
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    generateInFlightRef.current = false;
    setBatchState("done");
  }

  function handleApply(id: number, gen: Extract<ItemGenState, { kind: "success" }>) {
    if (applyLocksRef.current.has(id)) return;
    applyLocksRef.current.add(id);
    setApplyResults((prev) => ({ ...prev, [id]: { kind: "applying" } }));

    const fieldsChanged = hasAlignmentFieldChanges(gen.baseline, gen.proposal.fields);
    const outcome: AssetAlignmentOutcome = fieldsChanged ? "changes-proposed" : "already-aligned";

    void (async () => {
      try {
        const result = await applyAssetAlignmentAction({
          projectId,
          assetId: id,
          expectedStyleVersionId: gen.styleVersion.id,
          expectedStyleVersionNumber: gen.styleVersion.versionNumber,
          baselineFingerprint: gen.baselineFingerprint,
          outcome,
          fields: gen.proposal.fields,
        });

        if (!result.ok) {
          // Pre-commit refusal (e.g. content modified elsewhere) — release
          // the latch, this is a legitimate retry point after reviewing the
          // Asset's detail page.
          applyLocksRef.current.delete(id);
          setApplyResults((prev) => ({ ...prev, [id]: { kind: "error", message: result.error } }));
          return;
        }

        setApplyResults((prev) => ({ ...prev, [id]: { kind: "applied", styleVersionNumber: result.styleVersionNumber } }));
      } catch (err) {
        applyLocksRef.current.delete(id);
        setApplyResults((prev) => ({
          ...prev,
          [id]: { kind: "error", message: err instanceof Error ? err.message : "Unexpected error. Please try again." },
        }));
      }
    })();
  }

  function handleStartOver() {
    setSelected(new Set());
    setGenResults({});
    setApplyResults({});
    applyLocksRef.current = new Set();
    setBatchState("idle");
    setProgress(null);
  }

  const selectedIds = assets.filter((a) => selected.has(a.id)).map((a) => a.id);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Select assets and generate Style alignment proposals from the active Project Style. Nothing is
        saved until you apply each Asset individually.
      </p>

      {noActiveStyle && (
        <p className="text-xs text-[#6e767d]">
          There is no active published Project Style to align Assets against.{" "}
          <Link
            href={`/projects/${projectId}/style`}
            className="text-[#5b93d6] hover:text-[#8fbbe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors"
          >
            Open Project Style ↗
          </Link>
        </p>
      )}

      {(batchState === "idle") && (
        <div className="flex flex-col gap-3">
          {assets.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No assets in this project yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={selectNeedingReview}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors">
                  Select Needing Review
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button type="button" onClick={selectAll}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors">
                  Select All
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button type="button" onClick={clearSelection}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors">
                  Clear
                </button>
              </div>

              <div className="flex flex-col divide-y divide-[#1a1d20]">
                {assets.map((asset) => (
                  <label key={asset.id} className="flex items-center gap-3 py-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selected.has(asset.id)}
                      onChange={() => toggle(asset.id)}
                      className="accent-[#5b93d6] shrink-0"
                      disabled={noActiveStyle}
                    />
                    <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors truncate">
                        {asset.name}
                      </span>
                      <AssetTypeBadge type={asset.type} />
                      {asset.statusError ? (
                        <span className="text-[10px] text-[#cf7b6b]">{asset.statusError}</span>
                      ) : asset.status ? (
                        <span className="text-[10px] text-[#4b5158]">{statusMessage(asset.status)}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={selected.size === 0 || noActiveStyle}
                  className={buttonClass}
                >
                  Align Selected Assets{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
                {selected.size > 0 && (
                  <p className="mt-1.5 text-[10px] text-[#4b5158]">
                    One model call per Asset, run one after another.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {batchState === "running" && (
        <p className="text-xs text-[#6e767d] animate-pulse">
          Reviewing selected assets against Project Style{progress ? ` (${progress.done}/${progress.total})` : ""}…
        </p>
      )}

      {batchState === "done" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5">
            {selectedIds.map((id) => {
              const asset = assets.find((a) => a.id === id);
              if (!asset) return null;
              const gen = genResults[id] ?? { kind: "pending" };
              const apply = applyResults[id] ?? { kind: "idle" };

              return (
                <div key={id} className="flex flex-col gap-3 border-t border-[#1e2124] pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e7e9ec]">{asset.name}</span>
                    <AssetTypeBadge type={asset.type} />
                    {apply.kind === "applied" && (
                      <span className="text-[10px] border border-[#6b9e72]/30 text-[#6b9e72] px-1.5 py-0.5 rounded">
                        Aligned with Project Style v{apply.styleVersionNumber}
                      </span>
                    )}
                    <Link
                      href={`/projects/${projectId}/assets/${id}`}
                      className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors ml-auto shrink-0"
                    >
                      Open Asset →
                    </Link>
                  </div>

                  {gen.kind === "generating" && (
                    <p className="text-xs text-[#6e767d] animate-pulse">Reviewing…</p>
                  )}

                  {gen.kind === "error" && (
                    <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
                      {gen.message}
                    </p>
                  )}

                  {gen.kind === "success" && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-[#6e767d]">
                        Reviewed against Project Style v{gen.styleVersion.versionNumber}. Preview only —
                        nothing is saved until applied.
                      </p>
                      <ReadOnlyField label="Assessment" value={gen.proposal.assessment} />

                      {gen.proposal.outcome === "changes-proposed" && gen.proposal.designChanges.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className={labelClass}>Structured Design Changes</span>
                          {gen.proposal.designChanges.map((change, i) => (
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
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ASSET_ALIGNMENT_EDITABLE_FIELDS.map((field) => (
                          <ReadOnlyField key={field} label={FIELD_LABELS[field]} value={gen.proposal.fields[field]} />
                        ))}
                      </div>

                      {apply.kind === "error" && (
                        <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
                          {apply.message}
                        </p>
                      )}

                      {apply.kind !== "applied" && (
                        <div>
                          <button
                            type="button"
                            disabled={apply.kind === "applying"}
                            onClick={() => handleApply(id, gen)}
                            className={applySubmitButtonClass}
                          >
                            {apply.kind === "applying" ? "Applying…" : "Apply to Asset"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-3">
            <button type="button" onClick={handleStartOver} className={linkButtonClass}>
              Back to Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
