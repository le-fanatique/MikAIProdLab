"use client";

// ---------------------------------------------------------------------------
// ReferenceAnalysisWorkspace.tsx — STYLE.1.B.ANALYSIS.UI (retake 5)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  runReferenceAnalysisAction,
  getReferenceAnalysisState,
  type ReferenceAnalysisReadModel,
} from "@/actions/projectStyleReferenceAnalysis";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import type { ReferenceAnalysisProfile } from "@/lib/projectStyle/referenceAnalysis/contracts";
import { REFERENCE_ANALYSIS_LIMITS } from "@/lib/projectStyle/referenceAnalysis/contracts";
import { resolvePendingSync, retrySync, type SyncNeed } from "@/lib/projectStyle/referenceAnalysis/syncPhase";
import RunHistoryPanel from "./RunHistoryPanel";

// ── Shared style tokens ──────────────────────────────────────────────────

const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function Badge({ tone, children }: { tone: "muted" | "ok" | "warn" | "error" | "info"; children: React.ReactNode }) {
  const toneClass = {
    muted: "border-[#2c3035] text-[#6e767d]",
    ok: "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]",
    warn: "border-[#4a3a1f] text-[#c9a24b] bg-[#1f1a10]",
    error: "border-[#3d2323] text-[#cf7b6b] bg-[#1a1212]",
    info: "border-[#243449] text-[#5b93d6] bg-[#101a26]",
  }[tone];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${toneClass}`}>
      {children}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

type ReadModel = ReferenceAnalysisReadModel;

type AnalysisPhase =
  | { kind: "idle" }
  | { kind: "confirming"; profile: ReferenceAnalysisProfile; requestKey: string; frozenSelectedIds: number[]; attemptId: number }
  | { kind: "analyzing"; attemptId: number; frozenSelectedIds: number[] }
  | { kind: "completed"; runId: number }
  | { kind: "pending-sync"; syncNeed: SyncNeed; message: string };

type Props = {
  projectId: number;
  references: ProjectStyleReferenceView[];
  draftRevision: number | null;
  // F2: full draft reconciliation callback (rules + revision), not revision-only
  onDraftRulesReconciled: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

export default function ReferenceAnalysisWorkspace({
  projectId,
  references,
  draftRevision,
  onDraftRulesReconciled,
}: Props) {
  // ── Read model ──────────────────────────────────────────────────────
  const [readModel, setReadModel] = useState<ReadModel | null>(null);
  const [readModelError, setReadModelError] = useState<string | null>(null);
  const [readModelLoading, setReadModelLoading] = useState(false);

  // ── Selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ── Analysis phase ──────────────────────────────────────────────────
  const [phase, setPhase] = useState<AnalysisPhase>({ kind: "idle" });
  const [launchError, setLaunchError] = useState<string | null>(null);
  // P1: useRef lock — acquired synchronously before any await
  const launchLockRef = useRef(false);
  const [launchBusy, setLaunchBusy] = useState(false);
  // Monotone attempt id — stale gate responses are ignored.
  // F2: also incremented on selection change so stale confirmations bail.
  const attemptCounterRef = useRef(0);

  // ── Auto-open run after success (P2) ────────────────────────────────
  const [openRunId, setOpenRunId] = useState<number | null>(null);

  // F5: namespaced pending keys (obs:${id} / cr:${id}) — no collision
  const [pendingMutations, setPendingMutations] = useState<Set<string>>(new Set());

  // ── Refetch read model ──────────────────────────────────────────────
  const fetchReadModel = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    setReadModelLoading(true);
    setReadModelError(null);
    try {
      const result = await getReferenceAnalysisState(projectId);
      if ("runs" in result) {
        setReadModel(result);
        return { ok: true };
      }
      setReadModelError(result.error);
      return { ok: false, error: result.error };
    } catch {
      const msg = "Failed to load analysis state.";
      setReadModelError(msg);
      return { ok: false, error: msg };
    } finally {
      setReadModelLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void fetchReadModel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  // ── Reconcile selection on reference change ─────────────────────────
  // Full deps [references, selectedIds] — the length-change guard below
  // is what prevents a loop (the setter only fires when the filtered
  // result actually differs), so no exhaustive-deps suppression is needed.
  useEffect(() => {
    const approvedIds = new Set(references.filter((v) => v.reference.approvedForAnalysis).map((v) => v.reference.id));
    const filtered = selectedIds.filter((id) => approvedIds.has(id));
    if (filtered.length !== selectedIds.length) {
      attemptCounterRef.current++;
      setSelectedIds(filtered); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [references, selectedIds]);

  const selectedRefs = useMemo(
    () => selectedIds.map((id) => references.find((v) => v.reference.id === id)).filter(Boolean) as ProjectStyleReferenceView[],
    [selectedIds, references]
  );

  // F2: Invalidate confirmation on selection change.
  // Gate already bumped by handleToggleSelect or reconciliation effect;
  // this effect only closes the confirming panel.
  useEffect(() => {
    setPhase((prev) => { // eslint-disable-line react-hooks/set-state-in-effect
      if (prev.kind === "confirming") {
        setLaunchError(null);
        return { kind: "idle" };
      }
      return prev;
    });
  }, [selectedIds]);

  // ── Toggle select ───────────────────────────────────────────────────
  // Pure handler: reads selectedIds from closure, bumps counter
  // synchronously in handler body, then sets pure value.
  const handleToggleSelect = useCallback((referenceId: number, approved: boolean) => {
    if (!approved) return;
    if (selectedIds.includes(referenceId)) {
      attemptCounterRef.current++;
      setSelectedIds(selectedIds.filter((id) => id !== referenceId));
      return;
    }
    if (selectedIds.length >= REFERENCE_ANALYSIS_LIMITS.maxReferences) {
      // Refused by limit — no-op, no bump, no setter
      return;
    }
    attemptCounterRef.current++;
    setSelectedIds([...selectedIds, referenceId]);
  }, [selectedIds]);

  // ── Analysis launch ─────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (launchLockRef.current) return;
    launchLockRef.current = true;
    setLaunchBusy(true);
    setLaunchError(null);
    const attemptId = ++attemptCounterRef.current;

    try {
      const requestKey = crypto.randomUUID();
      const result = await runReferenceAnalysisAction({
        projectId,
        referenceIds: selectedIds,
        requestKey,
      });

      if (attemptCounterRef.current !== attemptId) return;

      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }

      if (result.requiresConfirmation) {
        setPhase({
          kind: "confirming",
          profile: {
            provider: result.provider,
            model: result.model,
            fingerprint: result.fingerprint,
            configurationError: null,
          },
          requestKey,
          frozenSelectedIds: [...selectedIds],
          attemptId,
        });
        return;
      }

      setPhase({ kind: "completed", runId: result.runId });
      setOpenRunId(result.runId);
      const refresh = await fetchReadModel();
      if (attemptCounterRef.current !== attemptId) return;
      const pending = resolvePendingSync("analysisLaunched", { analysis: refresh.ok });
      if (pending) {
        setPhase({ kind: "pending-sync", ...pending });
      }
    } catch {
      if (attemptCounterRef.current === attemptId) {
        setLaunchError("Unexpected transport error. The analysis was not started.");
      }
    } finally {
      launchLockRef.current = false;
      setLaunchBusy(false);
    }
  }, [selectedIds, projectId, fetchReadModel]);

  const handleConfirmAndLaunch = useCallback(async () => {
    if (phase.kind !== "confirming") return;
    // Early stale check: if attemptCounter has been bumped since this
    // confirmation was created, the selection or approval state changed.
    // Bail immediately — no lock, no provider call.
    if (attemptCounterRef.current !== phase.attemptId) {
      setPhase({ kind: "idle" });
      setLaunchError(null);
      return;
    }
    // Structural check: frozen selection must match current selection
    // exactly AS ORDERED ARRAYS — order defines the R1..Rn provenance sent
    // to the analysis, so the same ids in a different order must still be
    // treated as a mismatch, not silently accepted.
    const selectionMismatch =
      phase.frozenSelectedIds.length !== selectedIds.length ||
      phase.frozenSelectedIds.some((id, index) => id !== selectedIds[index]);
    if (selectionMismatch) {
      attemptCounterRef.current++;
      setPhase({ kind: "idle" });
      setLaunchError(null);
      return;
    }
    const approvedIds = new Set(references.filter((v) => v.reference.approvedForAnalysis).map((v) => v.reference.id));
    const hasUnapproved = phase.frozenSelectedIds.some((id) => !approvedIds.has(id));
    if (hasUnapproved) {
      attemptCounterRef.current++;
      setPhase({ kind: "idle" });
      setLaunchError("One or more selected references are no longer approved for analysis.");
      return;
    }
    if (launchLockRef.current) return;
    launchLockRef.current = true;
    setLaunchBusy(true);
    setLaunchError(null);
    const attemptId = phase.attemptId;
    setPhase({ kind: "analyzing", attemptId, frozenSelectedIds: phase.frozenSelectedIds });

    try {
      const result = await runReferenceAnalysisAction({
        projectId,
        referenceIds: phase.frozenSelectedIds,
        requestKey: phase.requestKey,
        confirmedProvider: phase.profile.provider,
        confirmedModel: phase.profile.model,
        confirmedFingerprint: phase.profile.fingerprint,
      });

      if (attemptCounterRef.current !== attemptId) return;

      if (!result.ok) {
        setLaunchError(result.error);
        setPhase({ kind: "idle" });
        return;
      }

      if (result.requiresConfirmation) {
        setPhase({
          kind: "confirming",
          profile: {
            provider: result.provider,
            model: result.model,
            fingerprint: result.fingerprint,
            configurationError: null,
          },
          requestKey: phase.requestKey,
          frozenSelectedIds: phase.frozenSelectedIds,
          attemptId,
        });
        return;
      }

      setPhase({ kind: "completed", runId: result.runId });
      setOpenRunId(result.runId);
      const refresh = await fetchReadModel();
      if (attemptCounterRef.current !== attemptId) return;
      const pending = resolvePendingSync("analysisConfirmed", { analysis: refresh.ok });
      if (pending) {
        setPhase({ kind: "pending-sync", ...pending });
      }
    } catch {
      if (attemptCounterRef.current === attemptId) {
        setLaunchError("Unexpected transport error. The analysis was not started.");
        setPhase({ kind: "idle" });
      }
    } finally {
      launchLockRef.current = false;
      setLaunchBusy(false);
    }
  }, [phase, projectId, fetchReadModel, selectedIds, references]);

  const handleCancelConfirmation = useCallback(() => {
    setPhase({ kind: "idle" });
    setLaunchError(null);
  }, []);

  // ── Retry sync: re-read exactly what failed (never replays Approve) ─
  const handleRetrySync = useCallback(async () => {
    const currentSyncNeed: SyncNeed = phase.kind === "pending-sync" ? phase.syncNeed : "both";
    const pending = await retrySync(currentSyncNeed, {
      readAnalysis: fetchReadModel,
      readDraft: onDraftRulesReconciled,
    });
    setPhase(pending ? { kind: "pending-sync", ...pending } : { kind: "idle" });
  }, [phase, fetchReadModel, onDraftRulesReconciled]);

  // ── Mutation callbacks from cards ───────────────────────────────────
  const handleObservationMutated = useCallback(async (observationId: number, patch: { domain?: string | null; observation?: string; rationale?: string | null; status?: "proposed" | "accepted" | "rejected"; revision: number }) => {
    setPendingMutations((prev) => new Set(prev).add(`obs:${observationId}`));
    setReadModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        observations: prev.observations.map((o) =>
          o.id === observationId ? { ...o, ...patch } : o
        ),
      };
    });
    const refresh = await fetchReadModel();
    setPendingMutations((prev) => { const n = new Set(prev); n.delete(`obs:${observationId}`); return n; });
    const pending = resolvePendingSync("observationMutated", { analysis: refresh.ok });
    if (pending) {
      setPhase({ kind: "pending-sync", ...pending });
    }
  }, [fetchReadModel]);

  const handleCandidateRuleMutated = useCallback(async (ruleId: number, patch: { instruction?: string; pillar?: string | null; section?: string | null; category?: string | null; strength?: string | null; applicability?: string | null; status?: "proposed" | "rejected" | "approved"; revision?: number }) => {
    setPendingMutations((prev) => new Set(prev).add(`cr:${ruleId}`));
    setReadModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidateRules: prev.candidateRules.map((r) =>
          r.id === ruleId
            ? {
                ...r,
                ...(patch.instruction !== undefined && { instruction: patch.instruction }),
                ...(patch.pillar !== undefined && { pillar: patch.pillar as "world" | "visual" | null }),
                ...(patch.section !== undefined && { section: patch.section }),
                ...(patch.category !== undefined && { category: patch.category }),
                ...(patch.strength !== undefined && { strength: patch.strength as "Required" | "Preferred" | "Avoid" | null }),
                ...(patch.applicability !== undefined && { applicability: patch.applicability }),
                ...(patch.status !== undefined && { status: patch.status }),
                ...(patch.revision !== undefined && { revision: patch.revision }),
              }
            : r
        ),
      };
    });
    const refresh = await fetchReadModel();
    setPendingMutations((prev) => { const n = new Set(prev); n.delete(`cr:${ruleId}`); return n; });
    const pending = resolvePendingSync("candidateRuleMutated", { analysis: refresh.ok });
    if (pending) {
      setPhase({ kind: "pending-sync", ...pending });
    }
  }, [fetchReadModel]);

  // F2+F3: Full reconciliation after approval — re-read Analysis + full Draft rules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- patch available for future use; reconciliation uses onDraftRulesReconciled
  const handleRuleApproved = useCallback(async (ruleId: number, _patch: { status: "approved"; draftRevision: number }) => {
    setPendingMutations((prev) => new Set(prev).add(`cr:${ruleId}`));
    setReadModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidateRules: prev.candidateRules.map((r) =>
          r.id === ruleId ? { ...r, status: "approved" as const } : r
        ),
      };
    });
    // Re-read both Analysis and full Draft reconciliation in parallel
    const [analysisRefresh, draftRefresh] = await Promise.all([
      fetchReadModel(),
      onDraftRulesReconciled(),
    ]);
    setPendingMutations((prev) => { const n = new Set(prev); n.delete(`cr:${ruleId}`); return n; });

    const pending = resolvePendingSync("ruleApproved", { analysis: analysisRefresh.ok, draft: draftRefresh.ok });
    if (pending) {
      setPhase({ kind: "pending-sync", ...pending });
    }
  }, [fetchReadModel, onDraftRulesReconciled]);

  // F6: openRunId managed by workspace
  const handleOpenRunChange = useCallback((runId: number | null) => {
    setOpenRunId(runId);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <section className="rounded border border-[#232629] p-4 flex flex-col gap-4 [background-color:var(--mikros-border,#2c3035)]">
      <h3 className="text-xs font-medium uppercase tracking-wider [color:var(--mikros-text-primary,#e7e9ec)]">
        Reference Analysis
      </h3>

      {/* Lot A: Selection UI */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[#6e767d]">
          Select {REFERENCE_ANALYSIS_LIMITS.minReferences} to {REFERENCE_ANALYSIS_LIMITS.maxReferences} references approved for analysis.
        </p>

        {selectedIds.length >= REFERENCE_ANALYSIS_LIMITS.maxReferences && (
          <p className="text-[10px] text-[#c9a24b]">
            Maximum {REFERENCE_ANALYSIS_LIMITS.maxReferences} references selected. Deselect one to change your selection.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {references.map((v) => {
            const isSelected = selectedIds.includes(v.reference.id);
            const approved = v.reference.approvedForAnalysis;
            const r = v.reference;
            const displayLabel = r.label || r.sourceFilename || "Untitled";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleToggleSelect(r.id, approved)}
                disabled={!approved}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${
                  !approved
                    ? "border-[#2c3035] bg-[#0d0e10] text-[#4b5158] opacity-50 cursor-not-allowed"
                    : isSelected
                    ? "border-[#5b93d6] bg-[#101a26] text-[#e7e9ec]"
                    : "border-[#2c3035] bg-[#141618] text-[#6e767d] hover:border-[#3a4046]"
                }`}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Deselect" : approved ? "Select" : "Not approved for analysis: "}${displayLabel}`}
              >
                <ThumbnailHoverPreview src={refImageUrl(r.imagePath)} alt={displayLabel}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refImageUrl(r.imagePath)} alt={displayLabel} className="w-8 h-8 object-cover rounded" />
                </ThumbnailHoverPreview>
                <span className="text-[10px] truncate max-w-[100px]">{displayLabel}</span>
                {isSelected && <Badge tone="ok">R{selectedIds.indexOf(r.id) + 1}</Badge>}
                {!approved && <Badge tone="muted">Not approved</Badge>}
              </button>
            );
          })}
        </div>

        {selectedRefs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRefs.map((v, idx) => {
              const r = v.reference;
              const displayLabel = r.label || r.sourceFilename || "Untitled";
              return (
                <div key={r.id} className="flex items-center gap-1.5 rounded border border-[#5b93d6] px-2 py-1">
                  <span className="text-[10px] font-mono text-[#5b93d6]">R{idx + 1}</span>
                  <ThumbnailHoverPreview src={refImageUrl(r.imagePath)} alt={displayLabel} focusable>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImageUrl(r.imagePath)} alt={displayLabel} className="w-5 h-5 object-cover rounded" />
                  </ThumbnailHoverPreview>
                  <span className="text-[10px] text-[#a4abb2] truncate max-w-[80px]">{displayLabel}</span>
                  {v.domains.length > 0 && (
                    <span className="text-[9px] text-[#4b5158]">({v.domains.join(", ")})</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lot B: Confirmation + Launch */}
      {selectedRefs.length > 0 && (
        <div className="flex flex-col gap-2">
          {launchError && (
            <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]" role="alert">
              {launchError}
            </p>
          )}

          {phase.kind === "idle" && (
            <button
              type="button"
              className={buttonClass}
              onClick={handleAnalyze}
              disabled={launchBusy || selectedIds.length === 0}
            >
              {launchBusy ? "Preparing\u2026" : `Analyze ${selectedRefs.length} Reference${selectedRefs.length > 1 ? "s" : ""}`}
            </button>
          )}

          {phase.kind === "confirming" && (
            <div className="rounded border border-[#4a3a1f] bg-[#1f1a10] p-3 flex flex-col gap-2">
              <p className="text-xs text-[#c9a24b] font-medium">Confirm analysis</p>
              <div className="flex flex-col gap-1 text-xs text-[#a4abb2]">
                <p>Provider: <span className="font-mono text-[#e7e9ec]">{phase.profile.provider}</span></p>
                <p>Model: <span className="font-mono text-[#e7e9ec]">{phase.profile.model}</span></p>
                <p>Images: {phase.frozenSelectedIds.length} selected reference{phase.frozenSelectedIds.length > 1 ? "s" : ""} will be sent to this provider.</p>
              </div>
              <p className="text-[10px] text-[#6e767d]">
                Analysis is optional and explicit. Sending images to an external provider may incur cost.
              </p>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} onClick={handleConfirmAndLaunch} disabled={launchBusy}>
                  {launchBusy ? "Launching\u2026" : "Confirm and Analyze"}
                </button>
                <button type="button" className={smallButtonClass} onClick={handleCancelConfirmation} disabled={launchBusy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {phase.kind === "analyzing" && (
            <div className="rounded border border-[#243449] bg-[#101a26] p-3 flex items-center gap-2">
              <span className="text-xs text-[#5b93d6]">Analyzing\u2026</span>
              <span className="text-[10px] text-[#6e767d]">This may take a moment. Do not close this page.</span>
            </div>
          )}

          {phase.kind === "completed" && (
            <div className="rounded border border-[#2c6142] bg-[#12241a] p-3 flex items-center gap-2">
              <span className="text-xs text-[#8fc9a0]">Analysis completed.</span>
              <button type="button" className={smallButtonClass} onClick={() => { setPhase({ kind: "idle" }); setOpenRunId(null); }}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending-sync banner — always visible */}
      {phase.kind === "pending-sync" && (
        <div className="rounded border border-[#4a3a1f] bg-[#1f1a10] p-3 flex flex-col gap-2">
          <p className="text-xs text-[#c9a24b]">{phase.message}</p>
          <p className="text-[10px] text-[#6e767d]">Needs: {phase.syncNeed === "both" ? "analysis + draft" : phase.syncNeed}</p>
          <button type="button" className={smallButtonClass} onClick={handleRetrySync}>
            Retry sync
          </button>
        </div>
      )}

      {/* Lot C: Run History */}
      {readModel && (
        <RunHistoryPanel
          runs={readModel.runs}
          runReferences={readModel.runReferences}
          observations={readModel.observations}
          candidateRules={readModel.candidateRules}
          candidateRuleReferences={readModel.candidateRuleReferences}
          references={references}
          projectId={projectId}
          draftRevision={draftRevision}
          onObservationMutated={handleObservationMutated}
          onCandidateRuleMutated={handleCandidateRuleMutated}
          onRuleApproved={handleRuleApproved}
          pendingMutations={pendingMutations}
          openRunId={openRunId}
          onOpenRunChange={handleOpenRunChange}
        />
      )}

      {readModelError && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-[#cf7b6b]">{readModelError}</p>
          <button type="button" className={smallButtonClass} onClick={() => void fetchReadModel()}>
            Retry
          </button>
        </div>
      )}

      {readModelLoading && <p className="text-xs text-[#6e767d]">Loading analysis history\u2026</p>}
    </section>
  );
}
