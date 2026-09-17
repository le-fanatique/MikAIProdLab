"use client";

// ---------------------------------------------------------------------------
// AssetPromptCardBatchPanel.tsx — ASSET.PROMPTCARD.BATCH.1
//
// Batch entry point for the existing "Propose Prompt Card" flow
// (`AssetPromptCardPanel.tsx`, ASSET.PROMPTCARD.2), on a selection of Assets
// instead of one at a time. Consumes `runWorkspaceOperation` and
// `buildAssetPromptCardCommitArgs` / `ACTION_BINDINGS.updateAssetPromptCardInline`
// exactly as written — no new descriptor, no wrapper Server Action, no change
// to the prompt, the parser, the variables or the action registry.
//
// The governing rule (ticket, quoting §6.1 of
// docs/LLM_WORKSPACE_PRODUCT_VISION.md): nothing is written before approval.
// A batch propose is NOT an automatic apply on N Assets. It is: generate a
// Prompt Card proposal for each selected Asset, review it one card per Asset,
// then approve — per Asset, or all at once via "Apply All" once every
// proposal has been rendered to the screen (ASSET.PROMPTCARD.BATCH.2, §6.1's
// dated paragraph on `docs/LLM_WORKSPACE_PRODUCT_VISION.md`: reviewed-then-
// applied-in-bulk is still an explicit human approval, not an autonomous or
// silent write). `AssetAlignmentBatchPanel.tsx` (STYLE.ALIGN.BATCH.1) stays
// without one — that operation writes five fields per Asset, not one, and
// the author never asked for it there.
//
// "Who Apply All touches" is decided by the pure
// `selectApplyAllTargets` (`assetPromptCardBatch.ts`), never refiltered here:
// a successfully generated Asset not yet applied in this pass, in review
// order, flagged when it would overwrite an existing Prompt Card.
//
// Generation is sequential (one Asset after another), with a readable
// progress count. A failure on one Asset does not stop the others — each
// Asset carries its own result or its own error.
//
// Review is read-only here, with a link to the Asset's detail page. Making it
// editable in place would require moving `AssetPromptCardPanel`'s own
// generate/edit state into this file, which the ticket explicitly forbids
// touching — same fallback `AssetAlignmentBatchPanel` took for the same
// reason, so this stays read-only.
//
// Every generated proposal and every Apply outcome lives ONLY in this
// component's React state — never a URL parameter, localStorage,
// sessionStorage or a new DB table, same discipline as the two neighboring
// panels this ticket must not touch.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runWorkspaceOperation } from "@/actions/llmWorkspace/runOperationAction";
import { buildAssetPromptCardCommitArgs } from "@/lib/llmWorkspace/actions/proposalCommit";
import { ACTION_BINDINGS } from "@/lib/llmWorkspace/actions/bindings";
import { isPromptCardMissing, selectApplyAllTargets, type ApplyAllTarget } from "@/lib/llmWorkspace/assetPromptCardBatch";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import { LLM_APPLY_ACTION_CLASS } from "@/lib/uiClasses";

export type BatchPromptCardAssetItem = {
  id: number;
  name: string;
  type: string;
  promptCard: string | null;
};

type Props = {
  projectId: number;
  assets: BatchPromptCardAssetItem[];
  isConfigured: boolean;
};

type ItemGenState =
  | { kind: "pending" }
  | { kind: "generating" }
  | { kind: "success"; promptCard: string }
  | { kind: "error"; message: string };

type ItemApplyState =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "applied" }
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

export default function AssetPromptCardBatchPanel({ projectId, assets, isConfigured }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [batchState, setBatchState] = useState<BatchState>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [genResults, setGenResults] = useState<Record<number, ItemGenState>>({});
  const [applyResults, setApplyResults] = useState<Record<number, ItemApplyState>>({});
  // ASSET.PROMPTCARD.BATCH.2 — "Apply All" state: whether the in-place
  // overwrite confirmation is showing, and progress while the pass runs.
  const [applyAllConfirming, setApplyAllConfirming] = useState(false);
  const [applyAllProgress, setApplyAllProgress] = useState<{ done: number; total: number } | null>(null);

  // Synchronous single-flight latch per Asset, acquired before Apply's first
  // `await` — a React state check alone cannot prevent two same-tick events
  // (double click) from both passing the guard, since state updates are
  // scheduled, not synchronous. Same idiom as
  // `AssetAlignmentBatchPanel.tsx`'s `applyLocksRef`. Once an Asset's Apply
  // succeeds its id stays in this set forever — Apply is never called again
  // for that mounted proposal.
  const applyLocksRef = useRef<Set<number>>(new Set());
  // Synchronous single-flight latch for the whole generate run.
  const generateInFlightRef = useRef(false);
  // Synchronous single-flight latch for the whole "Apply All" pass, same
  // idiom as `generateInFlightRef` above.
  const applyAllInFlightRef = useRef(false);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectMissing() {
    setSelected(new Set(assets.filter((a) => isPromptCardMissing(a.promptCard)).map((a) => a.id)));
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
        const result = await runWorkspaceOperation({
          descriptorId: "asset.promptCard",
          ids: { projectId, assetId: id },
          intent: { freeText: freeText || undefined },
        });
        if (!result.ok) {
          setGenResults((prev) => ({ ...prev, [id]: { kind: "error", message: result.error } }));
        } else if (result.kind !== "object" || typeof result.values.promptCard !== "string") {
          setGenResults((prev) => ({
            ...prev,
            [id]: { kind: "error", message: "Unexpected non-text value for the prompt card." },
          }));
        } else {
          setGenResults((prev) => ({ ...prev, [id]: { kind: "success", promptCard: result.values.promptCard as string } }));
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

  // Shared write path for a single Asset — the same call `handleApply` used
  // inline before ASSET.PROMPTCARD.BATCH.2, factored out so "Apply All" can
  // run it sequentially without duplicating the try/catch or the
  // `ItemApplyState` transitions. Never calls `router.refresh()` itself —
  // callers decide when: `handleApply` after its own single write,
  // `runApplyAll` once after the whole loop (§3.c.5 of the ticket).
  async function applyOne(id: number, promptCard: string): Promise<boolean> {
    try {
      const args = buildAssetPromptCardCommitArgs({ assetId: id, projectId, promptCard });
      const result = await ACTION_BINDINGS.updateAssetPromptCardInline(...args);

      if (!result.ok) {
        // Pre-commit refusal (e.g. the Asset vanished) — release the
        // latch, this is a legitimate retry point.
        applyLocksRef.current.delete(id);
        setApplyResults((prev) => ({ ...prev, [id]: { kind: "error", message: result.error } }));
        return false;
      }

      setApplyResults((prev) => ({ ...prev, [id]: { kind: "applied" } }));
      return true;
    } catch (err) {
      applyLocksRef.current.delete(id);
      setApplyResults((prev) => ({
        ...prev,
        [id]: { kind: "error", message: err instanceof Error ? err.message : "Unexpected error. Please try again." },
      }));
      return false;
    }
  }

  function handleApply(id: number, promptCard: string) {
    if (applyLocksRef.current.has(id)) return;
    applyLocksRef.current.add(id);
    setApplyResults((prev) => ({ ...prev, [id]: { kind: "applying" } }));

    void (async () => {
      const ok = await applyOne(id, promptCard);
      if (ok) {
        // §3.8 of BATCH.1's ticket: refresh server data so `assets` (this
        // page's own `select()`, re-run by the Server Component) reflects
        // the written Prompt Card. Without this, `assets` stays the initial
        // render's snapshot: after "Back to Selection" the applied Asset
        // still reads as missing, and "Select Missing" re-selects it —
        // repaying a model call for an Asset that already carries its card.
        router.refresh();
      }
    })();
  }

  // ASSET.PROMPTCARD.BATCH.2 — sequential "Apply All", one Asset after
  // another in review order. A failure on one does not stop the pass (§3.c.4
  // of the ticket): `applyOne` already records the per-Asset error and
  // returns, and the loop moves on. Exactly one `router.refresh()`, after the
  // whole loop, never one per Asset (§3.c.5).
  async function runApplyAll(targets: ApplyAllTarget[]) {
    if (applyAllInFlightRef.current) return;
    applyAllInFlightRef.current = true;
    setApplyAllProgress({ done: 0, total: targets.length });

    for (const target of targets) {
      const gen = genResults[target.id];
      if (applyLocksRef.current.has(target.id) || !gen || gen.kind !== "success") {
        // Already applied (individually, mid-pass) or no longer a valid
        // target — skip without touching its state.
        setApplyAllProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
        continue;
      }
      applyLocksRef.current.add(target.id);
      setApplyResults((prev) => ({ ...prev, [target.id]: { kind: "applying" } }));
      await applyOne(target.id, gen.promptCard);
      setApplyAllProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    applyAllInFlightRef.current = false;
    setApplyAllProgress(null);
    router.refresh();
  }

  function handleApplyAllClick() {
    if (applyAllTargets.length === 0 || applyAllInFlightRef.current) return;
    if (applyAllTargets.some((t) => t.overwrites) && !applyAllConfirming) {
      setApplyAllConfirming(true);
      return;
    }
    setApplyAllConfirming(false);
    void runApplyAll(applyAllTargets);
  }

  function handleStartOver() {
    setSelected(new Set());
    setGenResults({});
    setApplyResults({});
    applyLocksRef.current = new Set();
    applyAllInFlightRef.current = false;
    setApplyAllConfirming(false);
    setApplyAllProgress(null);
    setBatchState("idle");
    setProgress(null);
  }

  const selectedIds = assets.filter((a) => selected.has(a.id)).map((a) => a.id);

  // ASSET.PROMPTCARD.BATCH.2 — the "who Apply All touches" decision lives
  // entirely in `selectApplyAllTargets`; this component only assembles the
  // three sets it asks for and reads the result, never refilters it.
  const generatedIds = new Set(selectedIds.filter((id) => genResults[id]?.kind === "success"));
  const appliedIds = new Set(selectedIds.filter((id) => applyResults[id]?.kind === "applied"));
  const existingCardIds = new Set(assets.filter((a) => !isPromptCardMissing(a.promptCard)).map((a) => a.id));
  const applyAllTargets = selectApplyAllTargets(selectedIds, generatedIds, appliedIds, existingCardIds);
  const applyAllOverwriteCount = applyAllTargets.filter((t) => t.overwrites).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Select assets and propose a short Prompt Card for each, read from its Asset Bible. Nothing is saved
        until you apply each Asset individually.
      </p>

      {!isConfigured && (
        <p className="text-xs text-[#6e767d]">
          LLM is not configured.{" "}
          <Link
            href="/settings"
            className="text-[#5b93d6] hover:text-[#8fbbe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors"
          >
            Configure it in Settings ↗
          </Link>{" "}
          to propose Prompt Cards.
        </p>
      )}

      {batchState === "idle" && (
        <div className="flex flex-col gap-3">
          {assets.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No assets in this project yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectMissing}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Select Missing
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
                  Select All
                </button>
                <span className="text-[#2c3035] text-xs">·</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                >
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
                    />
                    <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors truncate">
                        {asset.name}
                      </span>
                      <AssetTypeBadge type={asset.type} />
                      <span className="text-[10px] text-[#4b5158]">
                        {isPromptCardMissing(asset.promptCard) ? "No Prompt Card" : "Has Prompt Card"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="batchPromptCardFreeText"
                  className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]"
                >
                  Director&apos;s note (optional)
                </label>
                <textarea
                  id="batchPromptCardFreeText"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="e.g. insist on the silhouette, keep the mechanical vocabulary"
                  rows={2}
                  className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#a4abb2] resize-y focus:outline-none focus:border-[#3a4046] transition-colors leading-relaxed"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={selected.size === 0 || !isConfigured}
                  className={buttonClass}
                >
                  Propose Prompt Cards{selected.size > 0 ? ` (${selected.size})` : ""}
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
          Proposing Prompt Cards{progress ? ` (${progress.done}/${progress.total})` : ""}…
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
                        Prompt Card Applied
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
                    <p className="text-xs text-[#6e767d] animate-pulse">Reading the Asset Bible…</p>
                  )}

                  {gen.kind === "error" && (
                    <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
                      {gen.message}
                    </p>
                  )}

                  {gen.kind === "success" && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-[#6e767d]">
                        Preview only — nothing is saved until applied.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ReadOnlyField label="Proposed Prompt Card" value={gen.promptCard} />
                        {asset.promptCard && (
                          <ReadOnlyField label="Current Prompt Card" value={asset.promptCard} />
                        )}
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
                            disabled={apply.kind === "applying" || applyAllProgress !== null}
                            onClick={() => handleApply(id, gen.promptCard)}
                            className={applySubmitButtonClass}
                          >
                            {apply.kind === "applying" ? "Applying…" : "Apply Prompt Card"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-[#1e2124] pt-3 flex-wrap">
            {applyAllProgress ? (
              <button type="button" disabled className={buttonClass}>
                {`Applying… (${applyAllProgress.done}/${applyAllProgress.total})`}
              </button>
            ) : applyAllConfirming ? (
              <div className="text-xs text-[#c9a24b] border border-[#4a3a1f] bg-[#1f1a10] rounded px-3 py-2 flex items-center gap-3 flex-wrap">
                <span>
                  {applyAllOverwriteCount === 1
                    ? "1 of these will overwrite an existing Prompt Card. Continue?"
                    : `${applyAllOverwriteCount} of these will overwrite an existing Prompt Card. Continue?`}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleApplyAllClick} className={buttonClass}>
                    Confirm
                  </button>
                  <button type="button" onClick={() => setApplyAllConfirming(false)} className={linkButtonClass}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              applyAllTargets.length > 0 && (
                <button type="button" onClick={handleApplyAllClick} className={buttonClass}>
                  {`Apply All Prompt Cards (${applyAllTargets.length})`}
                </button>
              )
            )}
            <button type="button" onClick={handleStartOver} className={linkButtonClass}>
              Back to Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
