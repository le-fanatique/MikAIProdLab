"use client";

// ---------------------------------------------------------------------------
// RunHistoryPanel.tsx — STYLE.1.B.ANALYSIS.UI (retake 4)
//
// F4: parseReferenceSnapshot directly, corruption shown inline.
// F5: namespaced pending keys (obs:${id} / cr:${id}).
// F6: single controlled openRunId via onOpenRunChange callback.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";
import { parseReferenceSnapshot } from "@/lib/projectStyle/referenceAnalysis/snapshotParser";
import type {
  ProjectStyleReferenceAnalysisRun,
  ProjectStyleReferenceAnalysisRunReference,
  ProjectStyleReferenceAnalysisObservation,
  ProjectStyleReferenceAnalysisCandidateRule,
  ProjectStyleReferenceAnalysisCandidateRuleReference,
} from "@/db/schema";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import ObservationCard from "./ObservationCard";
import CandidateRuleCard from "./CandidateRuleCard";

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// F5: namespaced pending key helpers
function obsKey(id: number): string { return `obs:${id}`; }
function crKey(id: number): string { return `cr:${id}`; }

// ── Single Run card ───────────────────────────────────────────────────────

function RunCard({
  run,
  runRefs,
  observations,
  candidateRules,
  candidateRuleRefs,
  refById,
  isOpen,
  onToggle,
  projectId,
  draftRevision,
  onObservationMutated,
  onCandidateRuleMutated,
  onRuleApproved,
  pendingMutations,
  allReferences,
}: {
  run: ProjectStyleReferenceAnalysisRun;
  runRefs: ProjectStyleReferenceAnalysisRunReference[];
  observations: ProjectStyleReferenceAnalysisObservation[];
  candidateRules: ProjectStyleReferenceAnalysisCandidateRule[];
  candidateRuleRefs: ProjectStyleReferenceAnalysisCandidateRuleReference[];
  refById: Map<number, ProjectStyleReferenceView>;
  isOpen: boolean;
  onToggle: () => void;
  projectId: number;
  draftRevision: number | null;
  onObservationMutated: (observationId: number, patch: { domain?: string | null; observation?: string; rationale?: string | null; status?: "proposed" | "accepted" | "rejected"; revision: number }) => Promise<void>;
  onCandidateRuleMutated: (ruleId: number, patch: { instruction?: string; pillar?: string | null; section?: string | null; category?: string | null; strength?: string | null; applicability?: string | null; status?: "proposed" | "rejected" | "approved"; revision?: number }) => Promise<void>;
  onRuleApproved: (ruleId: number, patch: { status: "approved"; draftRevision: number }) => Promise<void>;
  pendingMutations: Set<string>;
  allReferences: ProjectStyleReferenceView[];
}) {
  const runRefByRefId = useMemo(() => new Map(runRefs.map((rr) => [rr.referenceId, rr])), [runRefs]);

  return (
    <div className={`rounded border p-3 flex flex-col gap-2 ${isOpen ? "border-[#5b93d6] bg-[#101a26]" : "border-[#2c3035] bg-[#141618]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={run.status === "completed" ? "ok" : run.status === "failed" ? "error" : "warn"}>
            {run.status}
          </Badge>
          <span className="text-xs text-[#6e767d]">{run.provider} / {run.model}</span>
          <span className="text-[10px] text-[#4b5158]">{formatDate(run.createdAt)}</span>
        </div>
        <button
          type="button"
          className={smallButtonClass}
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          {isOpen ? "Close" : "Open"}
        </button>
      </div>

      {run.summary && <p className="text-xs text-[#a4abb2] whitespace-pre-wrap">{run.summary}</p>}
      {run.status === "failed" && run.errorMessage && <p className="text-xs text-[#cf7b6b]">{run.errorMessage}</p>}

      {/* Frozen provenance: R1..Rn — F4: parseReferenceSnapshot directly */}
      <div className="flex flex-wrap gap-2">
        {runRefs.map((rr) => {
          const parsed = parseReferenceSnapshot(rr.referenceSnapshot);
          const currentRef = refById.get(rr.referenceId);
          const snapshotLabel = parsed.ok ? parsed.label : null;
          const snapshotError = parsed.ok ? null : parsed.error;
          const displayLabel = snapshotLabel ?? currentRef?.reference.sourceFilename ?? `Ref ${rr.referenceId}`;
          const imageSrc = currentRef?.reference.imagePath ?? "";
          return (
            <div key={rr.id} className="flex items-center gap-1.5 rounded border border-[#2c3035] px-2 py-1">
              {imageSrc ? (
                <ThumbnailHoverPreview src={refImageUrl(imageSrc)} alt={displayLabel} previewSize={320}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refImageUrl(imageSrc)} alt={displayLabel} className="w-8 h-8 object-cover rounded" />
                </ThumbnailHoverPreview>
              ) : (
                <div className="w-8 h-8 rounded bg-[#0d0e10] flex items-center justify-center text-[9px] text-[#4b5158]" aria-label="Reference image unavailable">
                  N/A
                </div>
              )}
              <span className="text-[10px] font-mono text-[#5b93d6]">{rr.referenceKey}</span>
              <span className="text-[10px] text-[#a4abb2] truncate max-w-[120px]">{displayLabel}</span>
              {snapshotError && <span className="text-[9px] text-[#c9a24b]" title={snapshotError}>⚠ snapshot</span>}
            </div>
          );
        })}
      </div>

      {/* Expanded review: observations + candidate rules */}
      {isOpen && (
        <div className="flex flex-col gap-3 border-t border-[#2c3035] pt-3 mt-1">
          {observations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
                Observations ({observations.length})
              </h4>
              {observations.map((obs) => {
                const rr = runRefByRefId.get(obs.referenceId);
                let snapshotLabel: string | null = null;
                let snapshotError: string | null = null;
                if (rr) {
                  const parsed = parseReferenceSnapshot(rr.referenceSnapshot);
                  if (parsed.ok) {
                    snapshotLabel = parsed.label;
                  } else {
                    snapshotError = parsed.error;
                  }
                }
                const refView = refById.get(obs.referenceId);
                return (
                  <div key={obs.id} className="flex flex-col gap-1">
                    {snapshotError && (
                      <p className="text-[9px] text-[#c9a24b]">⚠ Corrupt snapshot: {snapshotError}</p>
                    )}
                    <ObservationCard
                      observation={obs}
                      isPending={pendingMutations.has(obsKey(obs.id))}
                      refInfo={{
                        referenceKey: rr?.referenceKey ?? `Ref ${obs.referenceId}`,
                        label: snapshotLabel ?? refView?.reference.label ?? null,
                        imagePath: refView?.reference.imagePath ?? null,
                      }}
                      projectId={projectId}
                      onMutated={onObservationMutated}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {candidateRules.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
                Candidate Rules ({candidateRules.length})
              </h4>
              {candidateRules.map((rule) => {
                const ruleRefLinks = candidateRuleRefs.filter((r) => r.candidateRuleId === rule.id);
                return (
                  <CandidateRuleCard
                    key={rule.id}
                    rule={rule}
                    isPending={pendingMutations.has(crKey(rule.id))}
                    ruleRefs={ruleRefLinks}
                    runRefByRefId={runRefByRefId}
                    allReferences={allReferences}
                    projectId={projectId}
                    draftRevision={draftRevision}
                    onMutated={onCandidateRuleMutated}
                    onApproved={onRuleApproved}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────

export default function RunHistoryPanel({
  runs,
  runReferences,
  observations,
  candidateRules,
  candidateRuleReferences,
  references,
  projectId,
  draftRevision,
  onObservationMutated,
  onCandidateRuleMutated,
  onRuleApproved,
  pendingMutations,
  openRunId,
  onOpenRunChange,
}: {
  runs: ProjectStyleReferenceAnalysisRun[];
  runReferences: ProjectStyleReferenceAnalysisRunReference[];
  observations: ProjectStyleReferenceAnalysisObservation[];
  candidateRules: ProjectStyleReferenceAnalysisCandidateRule[];
  candidateRuleReferences: ProjectStyleReferenceAnalysisCandidateRuleReference[];
  references: ProjectStyleReferenceView[];
  projectId: number;
  draftRevision: number | null;
  onObservationMutated: (observationId: number, patch: { domain?: string | null; observation?: string; rationale?: string | null; status?: "proposed" | "accepted" | "rejected"; revision: number }) => Promise<void>;
  onCandidateRuleMutated: (ruleId: number, patch: { instruction?: string; pillar?: string | null; section?: string | null; category?: string | null; strength?: string | null; applicability?: string | null; status?: "proposed" | "rejected" | "approved"; revision?: number }) => Promise<void>;
  onRuleApproved: (ruleId: number, patch: { status: "approved"; draftRevision: number }) => Promise<void>;
  pendingMutations: Set<string>;
  openRunId: number | null;
  onOpenRunChange: (runId: number | null) => void;
}) {
  // F6: single controlled state via workspace callback
  const effectiveOpenRunId = openRunId;

  const refById = useMemo(() => {
    const m = new Map<number, ProjectStyleReferenceView>();
    for (const v of references) m.set(v.reference.id, v);
    return m;
  }, [references]);

  if (runs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
        Analysis History ({runs.length})
      </h4>
      {runs.map((run) => {
        const runRefs = runReferences.filter((rr) => rr.runId === run.id).sort((a, b) => a.ordinal - b.ordinal);
        const runObs = observations.filter((o) => o.runId === run.id).sort((a, b) => a.orderIndex - b.orderIndex);
        const runCandidateRules = candidateRules.filter((r) => r.runId === run.id);
        const runCandidateRuleIds = new Set(runCandidateRules.map((r) => r.id));
        const runCandidateRuleRefs = candidateRuleReferences.filter((r) => runCandidateRuleIds.has(r.candidateRuleId));
        const isOpen = effectiveOpenRunId === run.id;
        return (
          <RunCard
            key={run.id}
            run={run}
            runRefs={runRefs}
            observations={runObs}
            candidateRules={runCandidateRules}
            candidateRuleRefs={runCandidateRuleRefs}
            refById={refById}
            isOpen={isOpen}
            onToggle={() => onOpenRunChange(isOpen ? null : run.id)}
            projectId={projectId}
            draftRevision={draftRevision}
            onObservationMutated={onObservationMutated}
            onCandidateRuleMutated={onCandidateRuleMutated}
            onRuleApproved={onRuleApproved}
            pendingMutations={pendingMutations}
            allReferences={references}
          />
        );
      })}
    </div>
  );
}
