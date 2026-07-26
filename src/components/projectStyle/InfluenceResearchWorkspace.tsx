"use client";

// ---------------------------------------------------------------------------
// InfluenceResearchWorkspace.tsx — STYLE.1.C.UI (retake — Codex REVISE round 1)
//
// Visible review workflow for one Creative Influence's Research domain:
// Search -> review candidates -> saved sources -> synthesize -> review
// candidate rules -> approve into Working Draft.
//
// Owns exactly one `ResearchReadModel` state, replaced wholesale after every
// confirmed CORE mutation (never a competing local store, never a fabricated
// optimistic row). Form drafts and the selected-source set live outside that
// replaceable state so a rejected mutation never erases user input. No
// action here is triggered by mount, tab change or selection — only an
// explicit user submission creates a fresh `crypto.randomUUID()` request key
// and reaches `researchInfluenceAction` / `synthesizeInfluenceResearchAction`.
//
// Retake fixes applied here (see .agents/codex_review.md round 1):
//   - every Server Action read/mutation is exception-safe: a thrown
//     network/transport error is caught, surfaced as a visible English
//     message, and `submitting`/`loading` are always reset in a `finally`
//     block — no handler can leave a button stuck on "Saving…" silently;
//   - Candidate Rule approval is a two-stage, fully-awaited sequence: the
//     CORE approval call itself, then the local read-model refresh, then the
//     parent's Working Draft reconciliation — each stage's failure is
//     reported distinctly, approval is never replayed, and a "Retry sync"
//     action only re-runs the (idempotent, read-only) refresh/reconciliation
//     steps, never `approveResearchCandidateRuleAction` again;
//   - the full read model is rendered: decided Candidate history shows
//     complete evidence, Source domains are visible, every Candidate Rule
//     original field is shown, and every Claim/Rule citation links directly
//     to its Source;
//   - the Discover query is always initialized from the Influence's own
//     subject name and role/discipline, never a stale prior Run's query;
//   - the tabs implement the complete ARIA tabs pattern (roving tabindex,
//     arrow/Home/End navigation, aria-controls/aria-labelledby-linked
//     tabpanels).
// ---------------------------------------------------------------------------

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  getResearchReadModel,
  researchInfluenceAction,
  saveResearchCandidateAction,
  dismissResearchCandidateAction,
  updateResearchSourceAction,
  withdrawResearchSourceAction,
  synthesizeInfluenceResearchAction,
  updateResearchCandidateRuleAction,
  rejectResearchCandidateRuleAction,
  approveResearchCandidateRuleAction,
  type ResearchReadModel,
} from "@/actions/research";
import {
  SOURCE_TYPES,
  SOURCE_TIERS,
  CONFIDENCE_LEVELS,
  RESEARCH_LIMITS,
  RESEARCH_PROVIDER,
  RESEARCH_MODEL,
  type SourceType,
  type SourceTier,
  type ConfidenceLevel,
} from "@/lib/projectStyle/research/contracts";
import type {
  ProjectStyleResearchCandidate,
  ProjectStyleResearchSource,
  ProjectStyleResearchSynthesis,
  ProjectStyleResearchCandidateRule,
} from "@/db/schema";
import Collapsible from "@/components/Collapsible";
import EmptyState from "@/components/EmptyState";
import type { ProjectStyleInfluenceView } from "@/actions/projectStyleInfluences";

// ── Shared style tokens (matching InfluenceSection.tsx) ─────────────────────

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function Badge({ children, tone }: { children: React.ReactNode; tone?: "muted" | "ok" | "warn" | "error" | "info" }) {
  const toneClass = {
    muted: "border-[#2c3035] text-[#6e767d]",
    ok: "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]",
    warn: "border-[#4a3a1f] text-[#c9a24b] bg-[#1f1a10]",
    error: "border-[#3d2323] text-[#cf7b6b] bg-[#1a1212]",
    info: "border-[#243449] text-[#5b93d6] bg-[#101a26]",
  }[tone ?? "muted"];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${toneClass}`}>
      {children}
    </span>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-xs text-[#cf7b6b]" role="alert">
      {error}
    </p>
  );
}

// ---------------------------------------------------------------------------
// runMutation — shared exception-safe wrapper for every Candidate/Source/
// Candidate Rule/Search/Synthesis mutation below. Distinguishes three
// outcomes so a thrown transport error is NEVER indistinguishable from a
// structured CORE refusal, and a mutation that succeeded but whose
// afterSuccess (typically a read-model refresh) failed is reported with its
// own message rather than silently leaving stale data on screen:
//   1. the action call itself threw            -> `messages.actionFailure`
//   2. the action returned `{ ok: false }`      -> `result.error` (CORE's
//      own sanitized English message, never replaced)
//   3. the action succeeded but `afterSuccess`
//      (e.g. a read-model refresh) threw        -> `messages.refreshFailure`
// Callers still wrap this in their own `try { ... } finally { setSubmitting
// (false) }` — this helper never touches a `submitting`/`loading` flag
// itself, only `setError`.
// ---------------------------------------------------------------------------

type ActionResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

async function runMutation<R extends ActionResult>(
  action: () => Promise<R>,
  afterSuccess: (result: Extract<R, { ok: true }>) => Promise<void>,
  setError: (message: string | null) => void,
  messages: { actionFailure: string; refreshFailure: string }
): Promise<void> {
  let result: R;
  try {
    result = await action();
  } catch {
    setError(messages.actionFailure);
    return;
  }
  if (!result.ok) {
    setError(result.error);
    return;
  }
  try {
    await afterSuccess(result as Extract<R, { ok: true }>);
  } catch {
    setError(messages.refreshFailure);
  }
}

// ── Cited-source links — every Claim/Candidate Rule citation and every
//    decided/active Source links directly to its real external URL. ───────

function CitedSources({ sources }: { sources: ProjectStyleResearchSource[] }) {
  if (sources.length === 0) return <>—</>;
  return (
    <>
      {sources.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <a href={s.normalizedUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[#5b93d6] hover:underline">
            {s.title}
          </a>
        </span>
      ))}
    </>
  );
}

// ── Compact domain chip editor for a Candidate's Save form ─────────────────

function DomainChips({
  domains,
  onChange,
  disabled,
  instanceId,
}: {
  domains: string[];
  onChange: (domains: string[]) => void;
  disabled: boolean;
  instanceId: string;
}) {
  const [input, setInput] = useState("");
  const addDomain = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !domains.includes(trimmed) && domains.length < RESEARCH_LIMITS.maxDomainsPerSource) {
      onChange([...domains, trimmed]);
      setInput("");
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[#6e767d]" htmlFor={`${instanceId}-domain-input`}>
        Domains ({domains.length}/{RESEARCH_LIMITS.maxDomainsPerSource})
      </label>
      <div className="flex flex-wrap gap-1">
        {domains.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded border border-[#2c3035] px-1.5 py-0.5 text-[9px] text-[#6e767d]">
            {d}
            {!disabled && (
              <button type="button" aria-label={`Remove domain ${d}`} className="text-[#6e767d] hover:text-[#cf7b6b]" onClick={() => onChange(domains.filter((x) => x !== d))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && domains.length < RESEARCH_LIMITS.maxDomainsPerSource && (
        <div className="flex gap-1">
          <input
            id={`${instanceId}-domain-input`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDomain();
              }
            }}
            className={smallInputClass}
            placeholder="Domain (e.g. lighting)"
          />
          <button type="button" className={smallButtonClass} onClick={addDomain}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Candidate evidence (shared read-only block for pending + decided) ─────

function CandidateEvidence({ candidate }: { candidate: ProjectStyleResearchCandidate }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#a4abb2] break-words">{candidate.title}</p>
          <p className="text-[10px] text-[#6e767d]">
            {candidate.publisherHost}
            {candidate.authorOrPublisher ? ` · ${candidate.authorOrPublisher}` : ""}
          </p>
        </div>
        <a
          href={candidate.normalizedUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-[10px] text-[#5b93d6] hover:underline shrink-0"
        >
          Open source ↗
        </a>
      </div>
      <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{candidate.boundedExcerpt}</p>
      <div className="flex flex-wrap gap-1">
        <Badge>{candidate.sourceType}</Badge>
        <Badge>{candidate.sourceTier}</Badge>
        <Badge>confidence: {candidate.confidence}</Badge>
      </div>
      {candidate.relevanceSummary && (
        <p className="text-[10px] text-[#6e767d]">
          <span className="text-[#4b5158] uppercase">Relevance: </span>
          {candidate.relevanceSummary}
        </p>
      )}
      {candidate.usefulnessRationale && (
        <p className="text-[10px] text-[#6e767d]">
          <span className="text-[#4b5158] uppercase">Usefulness: </span>
          {candidate.usefulnessRationale}
        </p>
      )}
      {candidate.uncertainty && (
        <p className="text-[10px] text-[#c9a24b]">
          <span className="uppercase">Uncertainty: </span>
          {candidate.uncertainty}
        </p>
      )}
    </>
  );
}

// ── Candidate card (Discover tab) ───────────────────────────────────────────

type CandidateAssessment = {
  sourceType: SourceType;
  sourceTier: SourceTier;
  confidence: ConfidenceLevel;
  authorOrPublisher: string;
  relevanceSummary: string;
  usefulnessRationale: string;
  uncertainty: string;
  userNotes: string;
  domains: string[];
};

function assessmentFromCandidate(c: ProjectStyleResearchCandidate): CandidateAssessment {
  return {
    sourceType: c.sourceType as SourceType,
    sourceTier: c.sourceTier as SourceTier,
    confidence: c.confidence as ConfidenceLevel,
    authorOrPublisher: c.authorOrPublisher ?? "",
    relevanceSummary: c.relevanceSummary ?? "",
    usefulnessRationale: c.usefulnessRationale ?? "",
    uncertainty: c.uncertainty ?? "",
    userNotes: "",
    domains: [],
  };
}

function CandidateCard({
  candidate,
  projectId,
  influenceId,
  onDecided,
}: {
  candidate: ProjectStyleResearchCandidate;
  projectId: number;
  influenceId: number;
  onDecided: () => Promise<ResearchReadModel>;
}) {
  const instanceId = useId();
  const [assessment, setAssessment] = useState<CandidateAssessment>(() => assessmentFromCandidate(candidate));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          saveResearchCandidateAction({
            projectId,
            influenceId,
            candidateId: candidate.id,
            expectedDecisionRevision: candidate.decisionRevision,
            sourceType: assessment.sourceType,
            sourceTier: assessment.sourceTier,
            confidence: assessment.confidence,
            authorOrPublisher: assessment.authorOrPublisher.trim() || null,
            relevanceSummary: assessment.relevanceSummary.trim() || null,
            usefulnessRationale: assessment.usefulnessRationale.trim() || null,
            uncertainty: assessment.uncertainty.trim() || null,
            userNotes: assessment.userNotes.trim() || null,
            domains: assessment.domains,
          }),
        async () => {
          await onDecided();
        },
        setError,
        {
          actionFailure: "Unexpected error while saving this source. Please try again.",
          refreshFailure: "Source saved, but the list failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          dismissResearchCandidateAction({
            projectId,
            influenceId,
            candidateId: candidate.id,
            expectedDecisionRevision: candidate.decisionRevision,
          }),
        async () => {
          await onDecided();
        },
        setError,
        {
          actionFailure: "Unexpected error while dismissing this candidate. Please try again.",
          refreshFailure: "Candidate dismissed, but the list failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded border border-[#2c3035] bg-[#141618] p-2.5 flex flex-col gap-1.5">
      <CandidateEvidence candidate={candidate} />

      <ErrorText error={error} />

      <Collapsible label="Edit assessment before saving">
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <label className="text-[10px] text-[#6e767d]">
              Type
              <select
                value={assessment.sourceType}
                onChange={(e) => setAssessment((p) => ({ ...p, sourceType: e.target.value as SourceType }))}
                className={smallInputClass + " mt-0.5"}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-[#6e767d]">
              Tier
              <select
                value={assessment.sourceTier}
                onChange={(e) => setAssessment((p) => ({ ...p, sourceTier: e.target.value as SourceTier }))}
                className={smallInputClass + " mt-0.5"}
              >
                {SOURCE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-[#6e767d]">
              Confidence
              <select
                value={assessment.confidence}
                onChange={(e) => setAssessment((p) => ({ ...p, confidence: e.target.value as ConfidenceLevel }))}
                className={smallInputClass + " mt-0.5"}
              >
                {CONFIDENCE_LEVELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-[10px] text-[#6e767d]">
            Author / publisher
            <input
              value={assessment.authorOrPublisher}
              onChange={(e) => setAssessment((p) => ({ ...p, authorOrPublisher: e.target.value }))}
              maxLength={RESEARCH_LIMITS.maxAuthorPublisherLength}
              className={smallInputClass + " mt-0.5"}
            />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Relevance
            <textarea
              value={assessment.relevanceSummary}
              onChange={(e) => setAssessment((p) => ({ ...p, relevanceSummary: e.target.value }))}
              rows={2}
              maxLength={RESEARCH_LIMITS.maxRelevanceLength}
              className={fieldClass + " mt-0.5"}
            />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Usefulness
            <textarea
              value={assessment.usefulnessRationale}
              onChange={(e) => setAssessment((p) => ({ ...p, usefulnessRationale: e.target.value }))}
              rows={2}
              maxLength={RESEARCH_LIMITS.maxUsefulnessLength}
              className={fieldClass + " mt-0.5"}
            />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Uncertainty
            <textarea
              value={assessment.uncertainty}
              onChange={(e) => setAssessment((p) => ({ ...p, uncertainty: e.target.value }))}
              rows={2}
              maxLength={RESEARCH_LIMITS.maxUncertaintyLength}
              className={fieldClass + " mt-0.5"}
            />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Notes (private, editable after saving too)
            <textarea
              value={assessment.userNotes}
              onChange={(e) => setAssessment((p) => ({ ...p, userNotes: e.target.value }))}
              rows={2}
              maxLength={RESEARCH_LIMITS.maxUserNotesLength}
              className={fieldClass + " mt-0.5"}
            />
          </label>
          <DomainChips
            domains={assessment.domains}
            onChange={(domains) => setAssessment((p) => ({ ...p, domains }))}
            disabled={submitting}
            instanceId={instanceId}
          />
        </div>
      </Collapsible>

      <div className="flex gap-2">
        <button type="button" className={smallButtonClass} disabled={submitting} onClick={handleSave}>
          {submitting ? "Saving…" : "Save source"}
        </button>
        <button type="button" className={smallButtonClass + " text-[#cf7b6b]"} disabled={submitting} onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function DecidedCandidateRow({ candidate }: { candidate: ProjectStyleResearchCandidate }) {
  return (
    <div className="rounded border border-[#2c3035] p-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={candidate.state === "saved" ? "ok" : "muted"}>{candidate.state}</Badge>
        {candidate.decidedAt && <span className="text-[9px] text-[#4b5158]">{candidate.decidedAt}</span>}
      </div>
      <CandidateEvidence candidate={candidate} />
    </div>
  );
}

// ── Discover tab ─────────────────────────────────────────────────────────

function deriveDefaultQuery(influence: ProjectStyleInfluenceView["influence"]): string {
  return [influence.subjectName, influence.roleOrDiscipline].filter(Boolean).join(" — ");
}

function DiscoverTab({
  projectId,
  influence,
  model,
  onRefresh,
}: {
  projectId: number;
  influence: ProjectStyleInfluenceView["influence"];
  model: ResearchReadModel;
  onRefresh: () => Promise<ResearchReadModel>;
}) {
  // The ticket's UX contract (§B) requires the query to start derived from
  // the Influence's own subject name/role, not from a prior Run's query —
  // the user may then replace it freely. This is computed once at mount
  // (this component remounts per opened Influence via the parent's `key`).
  const [query, setQuery] = useState(() => deriveDefaultQuery(influence));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          researchInfluenceAction({
            projectId,
            influenceId: influence.id,
            requestKey: crypto.randomUUID(),
            query: query.trim(),
          }),
        async () => {
          await onRefresh();
        },
        setError,
        {
          actionFailure: "Unexpected error while searching. Please try again.",
          refreshFailure: "Search completed, but refreshing the results failed. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const pending = model.candidates.filter((c) => c.state === "pending_review");
  const decided = model.candidates.filter((c) => c.state !== "pending_review");

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#6e767d]" htmlFor="research-query">
          Search query
        </label>
        <textarea
          id="research-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={2}
          maxLength={RESEARCH_LIMITS.maxQueryLength}
          className={fieldClass}
          disabled={submitting}
          placeholder="What to search the web for"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] text-[#4b5158]">
            Provider: {RESEARCH_PROVIDER} · Model: {RESEARCH_MODEL}
          </p>
          <button type="submit" className={smallButtonClass} disabled={submitting || !query.trim()}>
            {submitting ? "Searching…" : "Search web"}
          </button>
        </div>
      </form>

      <ErrorText error={error} />

      {model.runs.length > 0 && (
        <p className="text-[10px] text-[#4b5158]">
          {model.runs.length} run(s) so far — latest: run #{model.runs[0].runNumber} (&quot;{model.runs[0].query}&quot;)
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d]">Pending candidates ({pending.length})</h4>
        {pending.length === 0 ? (
          <EmptyState title="No pending candidates" description="Run a search to discover new candidates." />
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((c) => (
              <CandidateCard key={c.id} candidate={c} projectId={projectId} influenceId={influence.id} onDecided={onRefresh} />
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <Collapsible label={`Decision history (${decided.length})`}>
          <div className="flex flex-col gap-1.5">
            {decided.map((c) => (
              <DecidedCandidateRow key={c.id} candidate={c} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

// ── Source card (Sources tab) ───────────────────────────────────────────

function SourceCard({
  source,
  domains,
  projectId,
  influenceId,
  selected,
  onToggleSelected,
  onChanged,
}: {
  source: ProjectStyleResearchSource;
  domains: string[];
  projectId: number;
  influenceId: number;
  selected: boolean;
  onToggleSelected: () => void;
  onChanged: () => Promise<ResearchReadModel>;
}) {
  const [notes, setNotes] = useState(source.userNotes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const isActive = source.status === "active";

  const handleSaveNotes = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          updateResearchSourceAction({
            projectId,
            influenceId,
            sourceId: source.id,
            expectedRevision: source.revision,
            userNotes: notes.trim() || null,
          }),
        async () => {
          await onChanged();
        },
        setError,
        {
          actionFailure: "Unexpected error while saving notes. Please try again.",
          refreshFailure: "Notes saved, but the view failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          withdrawResearchSourceAction({
            projectId,
            influenceId,
            sourceId: source.id,
            expectedRevision: source.revision,
          }),
        async () => {
          await onChanged();
        },
        setError,
        {
          actionFailure: "Unexpected error while withdrawing this source. Please try again.",
          refreshFailure: "Source withdrawn, but the view failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
      setConfirmingWithdraw(false);
    }
  };

  return (
    <div className={`rounded border p-2.5 flex flex-col gap-1.5 ${isActive ? "border-[#2c3035] bg-[#141618]" : "border-[#2c3035] bg-[#101214] opacity-70"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {isActive && (
            <input
              type="checkbox"
              aria-label={`Select source: ${source.title}`}
              checked={selected}
              onChange={onToggleSelected}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#a4abb2] break-words">{source.title}</p>
            <p className="text-[10px] text-[#6e767d]">
              {source.publisherHost}
              {source.authorOrPublisher ? ` · ${source.authorOrPublisher}` : ""}
            </p>
          </div>
        </div>
        <a href={source.normalizedUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[10px] text-[#5b93d6] hover:underline shrink-0">
          Open source ↗
        </a>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge tone={isActive ? "ok" : "muted"}>{source.status}</Badge>
        <Badge>{source.sourceType}</Badge>
        <Badge>{source.sourceTier}</Badge>
        <Badge>confidence: {source.confidence}</Badge>
      </div>
      <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{source.boundedExcerpt}</p>
      {domains.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] text-[#4b5158] uppercase">Domains:</span>
          {domains.map((d) => (
            <Badge key={d}>{d}</Badge>
          ))}
        </div>
      )}

      <ErrorText error={error} />

      <label className="text-[10px] text-[#6e767d]">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={RESEARCH_LIMITS.maxUserNotesLength}
          className={fieldClass + " mt-0.5"}
          disabled={submitting}
        />
      </label>

      <div className="flex gap-2 items-center">
        <button type="button" className={smallButtonClass} disabled={submitting || notes === (source.userNotes ?? "")} onClick={handleSaveNotes}>
          {submitting ? "Saving…" : "Save notes"}
        </button>
        {isActive &&
          (confirmingWithdraw ? (
            <>
              <span className="text-[10px] text-[#c9a24b]">Withdraw this source?</span>
              <button type="button" className={smallButtonClass} disabled={submitting} onClick={handleWithdraw}>
                Confirm
              </button>
              <button type="button" className={smallButtonClass} disabled={submitting} onClick={() => setConfirmingWithdraw(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={smallButtonClass + " text-[#cf7b6b]"} disabled={submitting} onClick={() => setConfirmingWithdraw(true)}>
              Withdraw source
            </button>
          ))}
      </div>
    </div>
  );
}

// ── Sources tab ──────────────────────────────────────────────────────────

function SourcesTab({
  projectId,
  influenceId,
  model,
  selectedSourceIds,
  onToggleSource,
  onChanged,
}: {
  projectId: number;
  influenceId: number;
  model: ResearchReadModel;
  selectedSourceIds: number[];
  onToggleSource: (sourceId: number) => void;
  onChanged: () => Promise<ResearchReadModel>;
}) {
  const active = model.sources.filter((s) => s.status === "active");
  const withdrawn = model.sources.filter((s) => s.status === "withdrawn");
  const selectedCount = selectedSourceIds.length;
  const withinBounds = selectedCount >= RESEARCH_LIMITS.minSourcesPerSynthesis && selectedCount <= RESEARCH_LIMITS.maxSourcesPerSynthesis;
  const domainsFor = (sourceId: number) => model.sourceDomains.filter((d) => d.sourceId === sourceId).map((d) => d.domain);

  if (model.sources.length === 0) {
    return <EmptyState title="No saved sources yet" description="Save a candidate from Discover to build your source list." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-[10px] ${withinBounds ? "text-[#8fc9a0]" : "text-[#c9a24b]"}`}>
        {selectedCount} selected — Synthesis needs {RESEARCH_LIMITS.minSourcesPerSynthesis} to {RESEARCH_LIMITS.maxSourcesPerSynthesis} active sources.
      </p>

      <div className="flex flex-col gap-2">
        <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d]">Active ({active.length})</h4>
        {active.length === 0 ? (
          <p className="text-[10px] text-[#4b5158]">No active sources.</p>
        ) : (
          active.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              domains={domainsFor(s.id)}
              projectId={projectId}
              influenceId={influenceId}
              selected={selectedSourceIds.includes(s.id)}
              onToggleSelected={() => onToggleSource(s.id)}
              onChanged={onChanged}
            />
          ))
        )}
      </div>

      {withdrawn.length > 0 && (
        <Collapsible label={`Withdrawn (${withdrawn.length})`}>
          <div className="flex flex-col gap-2">
            {withdrawn.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                domains={domainsFor(s.id)}
                projectId={projectId}
                influenceId={influenceId}
                selected={false}
                onToggleSelected={() => {}}
                onChanged={onChanged}
              />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

// ── Candidate Rule card (Synthesis tab) ─────────────────────────────────

type ReconcileResult = { ok: true } | { ok: false; error: string };

function CandidateRuleCard({
  rule,
  sources,
  projectId,
  influenceId,
  hasWorkingDraft,
  workingDraftRevision,
  onChanged,
  onApproved,
}: {
  rule: ProjectStyleResearchCandidateRule;
  sources: ProjectStyleResearchSource[];
  projectId: number;
  influenceId: number;
  hasWorkingDraft: boolean;
  workingDraftRevision: number | null;
  onChanged: () => Promise<ResearchReadModel>;
  onApproved: (result: { draftRuleId: number; draftRevision: number }) => Promise<ReconcileResult>;
}) {
  const [instruction, setInstruction] = useState(rule.instruction);
  const [pillar, setPillar] = useState<"" | "world" | "visual">((rule.pillar as "world" | "visual" | null) ?? "");
  const [section, setSection] = useState(rule.section ?? "");
  const [category, setCategory] = useState(rule.category ?? "");
  const [strength, setStrength] = useState<"" | "Required" | "Preferred" | "Avoid">((rule.strength as "Required" | "Preferred" | "Avoid" | null) ?? "");
  const [applicability, setApplicability] = useState(rule.applicability ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-approval sync state — separate from `error` above because it
  // guards a durable server-side fact (the CORE approval already
  // succeeded): `syncError` is never cleared by a normal edit/reject
  // attempt, and its "Retry sync" action only re-runs the read-model
  // refresh + parent reconciliation, never `approveResearchCandidateRuleAction`
  // again.
  const [approvedPendingSync, setApprovedPendingSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{ draftRuleId: number; draftRevision: number } | null>(null);

  const isProposed = rule.status === "proposed" && !approvedPendingSync;

  const handleUpdate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          updateResearchCandidateRuleAction({
            projectId,
            influenceId,
            candidateRuleId: rule.id,
            expectedRevision: rule.revision,
            instruction,
            pillar: pillar || null,
            section: section.trim() || null,
            category: category.trim() || null,
            strength: strength || null,
            applicability: applicability.trim() || null,
          }),
        async () => {
          await onChanged();
        },
        setError,
        {
          actionFailure: "Unexpected error while saving edits. Please try again.",
          refreshFailure: "Edits saved, but the view failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          rejectResearchCandidateRuleAction({
            projectId,
            influenceId,
            candidateRuleId: rule.id,
            expectedRevision: rule.revision,
          }),
        async () => {
          await onChanged();
        },
        setError,
        {
          actionFailure: "Unexpected error while rejecting this rule. Please try again.",
          refreshFailure: "Rule rejected, but the view failed to refresh. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Re-runs ONLY the read-model refresh and the parent Working Draft
   * reconciliation for an approval that already succeeded server-side.
   * Never calls `approveResearchCandidateRuleAction` — safe to retry any
   * number of times. */
  const syncAfterApproval = async (approval: { draftRuleId: number; draftRevision: number }) => {
    setSyncError(null);
    let localRefreshOk = true;
    try {
      await onChanged();
    } catch {
      localRefreshOk = false;
    }
    let parentReconcileOk = true;
    let parentMessage: string | undefined;
    try {
      const reconciled = await onApproved(approval);
      if (!reconciled.ok) {
        parentReconcileOk = false;
        parentMessage = reconciled.error;
      }
    } catch {
      parentReconcileOk = false;
    }
    if (localRefreshOk && parentReconcileOk) {
      setApprovedPendingSync(false);
      setPendingApproval(null);
      setSyncError(null);
    } else {
      setSyncError(
        parentMessage ??
          "Approved successfully, but the view failed to refresh. Use Retry sync below — this will not re-approve the rule."
      );
    }
  };

  const handleApprove = async () => {
    if (workingDraftRevision === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await approveResearchCandidateRuleAction({
        projectId,
        influenceId,
        candidateRuleId: rule.id,
        expectedCandidateRevision: rule.revision,
        expectedDraftRevision: workingDraftRevision,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // From this point on, the CORE approval is durable — the Candidate
      // Rule and the new Style Rule are committed. Nothing below may ever
      // call the approval action again.
      const approval = { draftRuleId: result.draftRuleId as number, draftRevision: result.draftRevision as number };
      setApprovedPendingSync(true);
      setPendingApproval(approval);
      await syncAfterApproval(approval);
    } catch {
      setError("Unexpected error while approving. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetrySync = async () => {
    if (!pendingApproval) return;
    setSubmitting(true);
    try {
      await syncAfterApproval(pendingApproval);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`rounded border p-2.5 flex flex-col gap-1.5 ${isProposed ? "border-[#2c3035] bg-[#141618]" : "border-[#2c3035] bg-[#101214] opacity-80"}`}>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={rule.status === "approved" ? "ok" : rule.status === "rejected" ? "error" : "info"}>{rule.status}</Badge>
        <span className="text-[9px] text-[#4b5158]">confidence: {rule.confidence}</span>
      </div>

      {approvedPendingSync && (
        <div className="rounded border border-[#243449] bg-[#101a26] p-2 flex flex-col gap-1">
          <p className="text-[10px] text-[#5b93d6]">
            Approved into the Working Draft.{syncError ? "" : " Refreshing the view…"}
          </p>
          {syncError && (
            <>
              <ErrorText error={syncError} />
              <button type="button" className={smallButtonClass + " self-start"} disabled={submitting} onClick={handleRetrySync}>
                {submitting ? "Retrying…" : "Retry sync"}
              </button>
            </>
          )}
        </div>
      )}

      {isProposed ? (
        <>
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} className={fieldClass} maxLength={RESEARCH_LIMITS.maxRuleInstructionLength} />
          <div className="grid grid-cols-2 gap-1.5">
            <select value={pillar} onChange={(e) => setPillar(e.target.value as "" | "world" | "visual")} className={smallInputClass}>
              <option value="">No pillar</option>
              <option value="world">World & Design Language</option>
              <option value="visual">Visual Treatment</option>
            </select>
            <select value={strength} onChange={(e) => setStrength(e.target.value as "" | "Required" | "Preferred" | "Avoid")} className={smallInputClass}>
              <option value="">No strength</option>
              <option value="Required">Required</option>
              <option value="Preferred">Preferred</option>
              <option value="Avoid">Avoid</option>
            </select>
            <input value={section} onChange={(e) => setSection(e.target.value)} className={smallInputClass} placeholder="Section" maxLength={RESEARCH_LIMITS.maxRuleFieldLength} />
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={smallInputClass} placeholder="Category" maxLength={RESEARCH_LIMITS.maxRuleFieldLength} />
            <input
              value={applicability}
              onChange={(e) => setApplicability(e.target.value)}
              className={smallInputClass + " col-span-2"}
              placeholder="Applies to"
              maxLength={RESEARCH_LIMITS.maxRuleFieldLength}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-[#a4abb2]">{rule.instruction}</p>
      )}

      <Collapsible label="Generated rationale & original">
        <div className="flex flex-col gap-1 text-[10px] text-[#6e767d]">
          <p>
            <span className="text-[#4b5158] uppercase">Rationale: </span>
            {rule.rationale}
          </p>
          {rule.uncertainty && (
            <p className="text-[#c9a24b]">
              <span className="uppercase">Uncertainty: </span>
              {rule.uncertainty}
            </p>
          )}
          <p>
            <span className="text-[#4b5158] uppercase">Original instruction: </span>
            {rule.originalInstruction}
          </p>
          <p>
            <span className="text-[#4b5158] uppercase">Original pillar: </span>
            {rule.originalPillar ?? "—"}
          </p>
          <p>
            <span className="text-[#4b5158] uppercase">Original section: </span>
            {rule.originalSection ?? "—"}
          </p>
          <p>
            <span className="text-[#4b5158] uppercase">Original category: </span>
            {rule.originalCategory ?? "—"}
          </p>
          <p>
            <span className="text-[#4b5158] uppercase">Original strength: </span>
            {rule.originalStrength ?? "—"}
          </p>
          <p>
            <span className="text-[#4b5158] uppercase">Original applicability: </span>
            {rule.originalApplicability ?? "—"}
          </p>
        </div>
      </Collapsible>

      <p className="text-[9px] text-[#4b5158]">
        Sources: <CitedSources sources={sources} />
      </p>

      <ErrorText error={error} />

      {isProposed && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={smallButtonClass} disabled={submitting || !instruction.trim()} onClick={handleUpdate}>
            {submitting ? "Saving…" : "Save edits"}
          </button>
          <button type="button" className={smallButtonClass + " text-[#cf7b6b]"} disabled={submitting} onClick={handleReject}>
            Reject
          </button>
          <button
            type="button"
            className={smallButtonClass}
            disabled={submitting || !hasWorkingDraft || workingDraftRevision === null}
            title={!hasWorkingDraft ? "No Working Draft exists. Create one before approving rules." : undefined}
            onClick={handleApprove}
          >
            {submitting ? "Approving…" : "Approve into Working Draft"}
          </button>
          {!hasWorkingDraft && <span className="text-[9px] text-[#c9a24b]">No Working Draft exists — create one before approving rules.</span>}
        </div>
      )}
    </div>
  );
}

// ── Synthesis tab ────────────────────────────────────────────────────────

function SynthesisTab({
  projectId,
  influenceId,
  model,
  selectedSourceIds,
  hasWorkingDraft,
  workingDraftRevision,
  onChanged,
  onApproved,
}: {
  projectId: number;
  influenceId: number;
  model: ResearchReadModel;
  selectedSourceIds: number[];
  hasWorkingDraft: boolean;
  workingDraftRevision: number | null;
  onChanged: () => Promise<ResearchReadModel>;
  onApproved: (result: { draftRuleId: number; draftRevision: number }) => Promise<ReconcileResult>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `null` means "no explicit user choice yet" — the newest synthesis is
  // used as the effective default without a render-triggering effect.
  const [selectedSynthesisId, setSelectedSynthesisId] = useState<number | null>(null);
  const effectiveSynthesisId = selectedSynthesisId ?? model.syntheses[0]?.id ?? null;

  const selectedCount = selectedSourceIds.length;
  const withinBounds = selectedCount >= RESEARCH_LIMITS.minSourcesPerSynthesis && selectedCount <= RESEARCH_LIMITS.maxSourcesPerSynthesis;

  const handleSynthesize = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await runMutation(
        () =>
          synthesizeInfluenceResearchAction({
            projectId,
            influenceId,
            requestKey: crypto.randomUUID(),
            sourceIds: selectedSourceIds,
          }),
        async () => {
          const refreshed = await onChanged();
          if (refreshed.syntheses.length > 0) {
            setSelectedSynthesisId(refreshed.syntheses[0].id);
          }
        },
        setError,
        {
          actionFailure: "Unexpected error while synthesizing. Please try again.",
          refreshFailure: "Synthesis created, but refreshing the view failed. Reopen this Influence's Research to see the latest state.",
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const synthesis: ProjectStyleResearchSynthesis | undefined = model.syntheses.find((s) => s.id === effectiveSynthesisId);

  const claims = synthesis ? model.claims.filter((c) => c.synthesisId === synthesis.id).sort((a, b) => a.orderIndex - b.orderIndex) : [];
  const candidateRules = synthesis
    ? model.candidateRules.filter((r) => r.synthesisId === synthesis.id).sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const participatingSources = synthesis
    ? model.synthesisSources.filter((s) => s.synthesisId === synthesis.id).map((s) => model.sources.find((src) => src.id === s.sourceId)).filter((s): s is ProjectStyleResearchSource => !!s)
    : [];

  const sourcesByIds = (sourceIds: number[]) => sourceIds.map((id) => model.sources.find((s) => s.id === id)).filter((s): s is ProjectStyleResearchSource => !!s);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] ${withinBounds ? "text-[#8fc9a0]" : "text-[#c9a24b]"}`}>
          {selectedCount} source(s) selected from the Sources tab.
        </p>
        <button
          type="button"
          className={smallButtonClass}
          disabled={submitting || !withinBounds}
          title={!withinBounds ? `Select ${RESEARCH_LIMITS.minSourcesPerSynthesis}–${RESEARCH_LIMITS.maxSourcesPerSynthesis} active sources in the Sources tab.` : undefined}
          onClick={handleSynthesize}
        >
          {submitting ? "Synthesizing…" : "Synthesize research"}
        </button>
      </div>
      {!withinBounds && (
        <p className="text-[9px] text-[#c9a24b]">
          Select {RESEARCH_LIMITS.minSourcesPerSynthesis}–{RESEARCH_LIMITS.maxSourcesPerSynthesis} active sources in the Sources tab to enable synthesis.
        </p>
      )}

      <ErrorText error={error} />

      {model.syntheses.length === 0 ? (
        <EmptyState title="No synthesis yet" description="Select active sources and synthesize to get claims and candidate rules." />
      ) : (
        <>
          <label className="text-[10px] text-[#6e767d]" htmlFor="synthesis-version">
            Version
          </label>
          <select
            id="synthesis-version"
            value={effectiveSynthesisId ?? ""}
            onChange={(e) => setSelectedSynthesisId(Number(e.target.value))}
            className={smallInputClass + " max-w-[160px]"}
          >
            {model.syntheses.map((s) => (
              <option key={s.id} value={s.id}>
                v{s.versionNumber} — {s.createdAt}
              </option>
            ))}
          </select>

          {synthesis && (
            <div className="flex flex-col gap-3">
              <div className="rounded border border-[#232629] bg-[#101214] p-3 flex flex-col gap-1.5">
                <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d]">Summary</h4>
                <p className="text-xs text-[#a4abb2] whitespace-pre-wrap">{synthesis.summary}</p>
                <p className="text-[9px] text-[#4b5158]">
                  Sources: <CitedSources sources={participatingSources} />
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d]">Claims ({claims.length})</h4>
                {claims.map((claim) => {
                  const claimSourceIds = model.claimSources.filter((cs) => cs.claimId === claim.id).map((cs) => cs.sourceId);
                  return (
                    <div key={claim.id} className="rounded border border-[#2c3035] p-2 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Badge>{claim.kind}</Badge>
                        <Badge>confidence: {claim.confidence}</Badge>
                      </div>
                      <p className="text-xs text-[#a4abb2]">{claim.text}</p>
                      {claim.uncertainty && <p className="text-[10px] text-[#c9a24b]">Uncertainty: {claim.uncertainty}</p>}
                      <p className="text-[9px] text-[#4b5158]">
                        Sources: <CitedSources sources={sourcesByIds(claimSourceIds)} />
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d]">Candidate Rules ({candidateRules.length})</h4>
                {candidateRules.length === 0 ? (
                  <p className="text-[10px] text-[#4b5158]">No candidate rules proposed for this synthesis.</p>
                ) : (
                  candidateRules.map((rule) => {
                    const ruleSourceIds = model.candidateRuleSources.filter((rs) => rs.candidateRuleId === rule.id).map((rs) => rs.sourceId);
                    return (
                      <CandidateRuleCard
                        key={rule.id}
                        rule={rule}
                        sources={sourcesByIds(ruleSourceIds)}
                        projectId={projectId}
                        influenceId={influenceId}
                        hasWorkingDraft={hasWorkingDraft}
                        workingDraftRevision={workingDraftRevision}
                        onChanged={onChanged}
                        onApproved={onApproved}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main workspace ───────────────────────────────────────────────────────

type Tab = "discover" | "sources" | "synthesis";
const TAB_ORDER: Tab[] = ["discover", "sources", "synthesis"];
const TAB_LABELS: Record<Tab, string> = { discover: "Discover", sources: "Sources", synthesis: "Synthesis & Rules" };

export default function InfluenceResearchWorkspace({
  projectId,
  influence,
  hasWorkingDraft,
  workingDraftRevision,
  onClose,
  onRuleApproved,
}: {
  projectId: number;
  influence: ProjectStyleInfluenceView["influence"];
  hasWorkingDraft: boolean;
  workingDraftRevision: number | null;
  onClose: () => void;
  onRuleApproved: (result: { draftRuleId: number; draftRevision: number }) => Promise<ReconcileResult>;
}) {
  const tabsId = useId();
  const [model, setModel] = useState<ResearchReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("discover");
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const tabButtonRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ discover: null, sources: null, synthesis: null });

  // Reads the Research model and returns it — or THROWS on any failure
  // (transport exception or a structured CORE ownership/validation
  // refusal). Every caller (the initial-load effect below, and every
  // mutation's `runMutation` `afterSuccess`) decides for itself how to
  // report that failure; this function never silently swallows one.
  const refresh = async (): Promise<ResearchReadModel> => {
    const result = await getResearchReadModel(projectId, influence.id);
    if (!("runs" in result)) {
      throw new Error(result.error);
    }
    setModel(result);
    // Reconcile: retain only still-active, still-owned sources.
    setSelectedSourceIds((prev) => prev.filter((id) => result.sources.some((s) => s.id === id && s.status === "active")));
    return result;
  };

  const loadInitial = async () => {
    setLoading(true);
    try {
      await refresh();
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unexpected error while loading Research data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getResearchReadModel(projectId, influence.id);
        if (cancelled) return;
        if (!("runs" in result)) {
          setLoadError(result.error);
        } else {
          setLoadError(null);
          setModel(result);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Unexpected error while loading Research data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Lazy-load once per opened influence; explicit onRefresh calls handle
    // every subsequent update.
  }, [projectId, influence.id]);

  const handleToggleSource = (sourceId: number) => {
    setSelectedSourceIds((prev) => (prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]));
  };

  const focusTab = (t: Tab) => {
    setTab(t);
    tabButtonRefs.current[t]?.focus();
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const idx = TAB_ORDER.indexOf(current);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TAB_ORDER.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TAB_ORDER.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      focusTab(TAB_ORDER[nextIdx]);
    }
  };

  const pendingCount = model?.candidates.filter((c) => c.state === "pending_review").length ?? 0;
  const activeSourceCount = model?.sources.filter((s) => s.status === "active").length ?? 0;
  const proposedRuleCount = model?.candidateRules.filter((r) => r.status === "proposed").length ?? 0;

  return (
    <section className="rounded border border-[#243449] bg-[#0d1017] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-[#e7e9ec]">Research — {influence.subjectName}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge tone="info">{pendingCount} pending</Badge>
            <Badge tone="info">{activeSourceCount} active sources</Badge>
            <Badge tone="info">{proposedRuleCount} proposed rules</Badge>
          </div>
        </div>
        <button type="button" className={smallButtonClass} onClick={onClose} aria-label="Close Research workspace">
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[#6e767d]">Loading Research…</p>
      ) : loadError ? (
        <div className="flex flex-col gap-2">
          <ErrorText error={loadError} />
          <button type="button" className={smallButtonClass + " self-start"} onClick={loadInitial}>
            Retry
          </button>
        </div>
      ) : model ? (
        <>
          <div className="flex gap-1.5 border-b border-[#232629] pb-2" role="tablist" aria-label="Research sections">
            {TAB_ORDER.map((t) => (
              <button
                key={t}
                ref={(el) => {
                  tabButtonRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`${tabsId}-panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  tab === t ? "bg-[#141618] text-[#e7e9ec] border border-[#3a4046]" : "text-[#6e767d] hover:text-[#a4abb2]"
                }`}
                onClick={() => focusTab(t)}
                onKeyDown={(e) => handleTabKeyDown(e, t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <div id={`${tabsId}-panel-discover`} role="tabpanel" aria-labelledby={`${tabsId}-tab-discover`} tabIndex={0} hidden={tab !== "discover"}>
            {tab === "discover" && <DiscoverTab projectId={projectId} influence={influence} model={model} onRefresh={refresh} />}
          </div>
          <div id={`${tabsId}-panel-sources`} role="tabpanel" aria-labelledby={`${tabsId}-tab-sources`} tabIndex={0} hidden={tab !== "sources"}>
            {tab === "sources" && (
              <SourcesTab
                projectId={projectId}
                influenceId={influence.id}
                model={model}
                selectedSourceIds={selectedSourceIds}
                onToggleSource={handleToggleSource}
                onChanged={refresh}
              />
            )}
          </div>
          <div id={`${tabsId}-panel-synthesis`} role="tabpanel" aria-labelledby={`${tabsId}-tab-synthesis`} tabIndex={0} hidden={tab !== "synthesis"}>
            {tab === "synthesis" && (
              <SynthesisTab
                projectId={projectId}
                influenceId={influence.id}
                model={model}
                selectedSourceIds={selectedSourceIds}
                hasWorkingDraft={hasWorkingDraft}
                workingDraftRevision={workingDraftRevision}
                onChanged={refresh}
                onApproved={onRuleApproved}
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
