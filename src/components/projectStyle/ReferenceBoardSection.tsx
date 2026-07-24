"use client";

// ---------------------------------------------------------------------------
// ReferenceBoardSection.tsx — STYLE.1.B.UI (Scope A)
//
// Controlled component: receives `references` from parent and emits changes
// via callbacks. No internal reference state — single source of truth lives
// in ProjectStyleWorkspace.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import EmptyState from "@/components/EmptyState";
import {
  uploadProjectStyleReferenceAction,
  updateProjectStyleReferenceAction,
  deleteProjectStyleReferenceAction,
  type ProjectStyleReferenceView,
} from "@/actions/projectStyleReferences";
import {
  REFERENCE_CONSUMERS,
  type ReferenceConsumer,
} from "@/lib/projectStyle/validationB";

// ── Shared style tokens ──────────────────────────────────────────────────

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-[#2c3035] px-1.5 py-0.5 text-[9px] text-[#6e767d]">
      {children}
    </span>
  );
}

function ApprovalBadge({ approved, label }: { approved: boolean; label: string }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${
        approved
          ? "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]"
          : "border-[#2c3035] text-[#4b5158]"
      }`}
    >
      {label}
    </span>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

type ApprovalFilter = "all" | "analysis" | "generation" | "unapproved";

function FilterBar({
  search,
  onSearchChange,
  domainFilter,
  onDomainFilterChange,
  consumerFilter,
  onConsumerFilterChange,
  approvalFilter,
  onApprovalFilterChange,
  allDomains,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  domainFilter: string;
  onDomainFilterChange: (v: string) => void;
  consumerFilter: string;
  onConsumerFilterChange: (v: string) => void;
  approvalFilter: ApprovalFilter;
  onApprovalFilterChange: (v: ApprovalFilter) => void;
  allDomains: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="ref-search">Search references</label>
      <input
        id="ref-search"
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className={smallInputClass + " max-w-[200px]"}
        placeholder="Search label or filename…"
      />
      <label className="sr-only" htmlFor="ref-domain-filter">Domain filter</label>
      <select
        id="ref-domain-filter"
        value={domainFilter}
        onChange={(e) => onDomainFilterChange(e.target.value)}
        className={smallInputClass + " max-w-[160px]"}
      >
        <option value="">All domains</option>
        {allDomains.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="ref-consumer-filter">Consumer filter</label>
      <select
        id="ref-consumer-filter"
        value={consumerFilter}
        onChange={(e) => onConsumerFilterChange(e.target.value)}
        className={smallInputClass + " max-w-[160px]"}
      >
        <option value="">All consumers</option>
        {REFERENCE_CONSUMERS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="ref-approval-filter">Approval filter</label>
      <select
        id="ref-approval-filter"
        value={approvalFilter}
        onChange={(e) => onApprovalFilterChange(e.target.value as ApprovalFilter)}
        className={smallInputClass + " max-w-[180px]"}
      >
        <option value="all">All approvals</option>
        <option value="analysis">Analysis approved</option>
        <option value="generation">Generation approved</option>
        <option value="unapproved">Unapproved</option>
      </select>
    </div>
  );
}

// ── Upload panel ──────────────────────────────────────────────────────────

function UploadPanel({
  projectId,
  onUploaded,
}: {
  projectId: number;
  onUploaded: (view: ProjectStyleReferenceView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [provenanceNotes, setProvenanceNotes] = useState("");
  const [whatInterestsMe, setWhatInterestsMe] = useState("");
  const [whatToAvoid, setWhatToAvoid] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [consumers, setConsumers] = useState<ReferenceConsumer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDomain = () => {
    const trimmed = domainInput.trim();
    if (trimmed && !domains.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setDomains((prev) => [...prev, trimmed]);
      setDomainInput("");
    }
  };

  const removeDomain = (idx: number) => {
    setDomains((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleConsumer = (c: ReferenceConsumer) => {
    setConsumers((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const reset = () => {
    setFile(null);
    setLabel("");
    setSourceUrl("");
    setProvenanceNotes("");
    setWhatInterestsMe("");
    setWhatToAvoid("");
    setDomains([]);
    setDomainInput("");
    setConsumers([]);
    setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await uploadProjectStyleReferenceAction({
        projectId,
        file,
        label: label.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        provenanceNotes: provenanceNotes.trim() || null,
        whatInterestsMe: whatInterestsMe.trim() || null,
        whatToAvoid: whatToAvoid.trim() || null,
        domains,
        consumers,
      });
      if (result.ok) {
        onUploaded(result.view);
        reset();
        setOpen(false);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected error during upload.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        Add reference
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border border-dashed border-[#2c3035] p-3 flex flex-col gap-2">
      {error && <p className="text-xs text-[#cf7b6b]" role="alert">{error}</p>}
      <label className="text-[10px] text-[#6e767d]">
        Image file
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block mt-1 text-xs text-[#6e767d]"
        />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={smallInputClass + " mt-0.5"} placeholder="Optional label" />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Source URL
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={smallInputClass + " mt-0.5"} placeholder="https://…" />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        What interests me
        <textarea value={whatInterestsMe} onChange={(e) => setWhatInterestsMe(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        What to avoid
        <textarea value={whatToAvoid} onChange={(e) => setWhatToAvoid(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Provenance notes
        <textarea value={provenanceNotes} onChange={(e) => setProvenanceNotes(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
        <legend className="text-[10px] text-[#6e767d]">Domains</legend>
        <div className="flex flex-wrap gap-1">
          {domains.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded border border-[#2c3035] px-1.5 py-0.5 text-[10px] text-[#a4abb2]">
              {d}
              <button type="button" className="text-[#6e767d] hover:text-[#cf7b6b]" aria-label={`Remove domain ${d}`} onClick={() => removeDomain(i)}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
            className={smallInputClass + " flex-1"}
            placeholder="Add domain and press Enter"
          />
          <button type="button" className={smallButtonClass} onClick={addDomain}>Add</button>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
        <legend className="text-[10px] text-[#6e767d]">Consumers</legend>
        <div className="flex flex-wrap gap-2">
          {REFERENCE_CONSUMERS.map((c) => (
            <label key={c} className="flex items-center gap-1 text-[10px] text-[#a4abb2]">
              <input type="checkbox" checked={consumers.includes(c)} onChange={() => toggleConsumer(c)} />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={smallButtonClass} disabled={submitting || !file}>
          {submitting ? "Uploading…" : "Upload"}
        </button>
        <button type="button" className={smallButtonClass} onClick={() => { reset(); setOpen(false); }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────

function EditPanel({
  view,
  projectId,
  onSaved,
  onDeleted,
  onCancel,
}: {
  view: ProjectStyleReferenceView;
  projectId: number;
  onSaved: (view: ProjectStyleReferenceView) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(view.reference.label ?? "");
  const [sourceUrl, setSourceUrl] = useState(view.reference.sourceUrl ?? "");
  const [provenanceNotes, setProvenanceNotes] = useState(view.reference.provenanceNotes ?? "");
  const [whatInterestsMe, setWhatInterestsMe] = useState(view.reference.whatInterestsMe ?? "");
  const [whatToAvoid, setWhatToAvoid] = useState(view.reference.whatToAvoid ?? "");
  const [domains, setDomains] = useState<string[]>(view.domains);
  const [domainInput, setDomainInput] = useState("");
  const [consumers, setConsumers] = useState<ReferenceConsumer[]>(view.consumers);
  const [approvedForAnalysis, setApprovedForAnalysis] = useState(view.reference.approvedForAnalysis);
  const [approvedForGeneration, setApprovedForGeneration] = useState(view.reference.approvedForGeneration);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const addDomain = () => {
    const trimmed = domainInput.trim();
    if (trimmed && !domains.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setDomains((prev) => [...prev, trimmed]);
      setDomainInput("");
    }
  };

  const removeDomain = (idx: number) => {
    setDomains((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleConsumer = (c: ReferenceConsumer) => {
    setConsumers((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateProjectStyleReferenceAction({
        projectId,
        referenceId: view.reference.id,
        label: label.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        provenanceNotes: provenanceNotes.trim() || null,
        whatInterestsMe: whatInterestsMe.trim() || null,
        whatToAvoid: whatToAvoid.trim() || null,
        domains,
        consumers,
        approvedForAnalysis,
        approvedForGeneration,
      });
      if (result.ok) {
        onSaved(result.view);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected error during update.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await deleteProjectStyleReferenceAction(projectId, view.reference.id);
      if (result.ok) {
        onDeleted();
      } else {
        setError(result.error);
        setConfirmingDelete(false);
      }
    } catch {
      setError("Unexpected error during deletion.");
      setConfirmingDelete(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="rounded border border-[#243449] bg-[#101a26] p-3 flex flex-col gap-2">
      {error && <p className="text-xs text-[#cf7b6b]" role="alert">{error}</p>}
      <label className="text-[10px] text-[#6e767d]">
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={smallInputClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Source URL
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={smallInputClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        What interests me
        <textarea value={whatInterestsMe} onChange={(e) => setWhatInterestsMe(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        What to avoid
        <textarea value={whatToAvoid} onChange={(e) => setWhatToAvoid(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Provenance notes
        <textarea value={provenanceNotes} onChange={(e) => setProvenanceNotes(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
        <legend className="text-[10px] text-[#6e767d]">Domains</legend>
        <div className="flex flex-wrap gap-1">
          {domains.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded border border-[#2c3035] px-1.5 py-0.5 text-[10px] text-[#a4abb2]">
              {d}
              <button type="button" className="text-[#6e767d] hover:text-[#cf7b6b]" aria-label={`Remove domain ${d}`} onClick={() => removeDomain(i)}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
            className={smallInputClass + " flex-1"}
            placeholder="Add domain"
          />
          <button type="button" className={smallButtonClass} onClick={addDomain}>Add</button>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
        <legend className="text-[10px] text-[#6e767d]">Consumers</legend>
        <div className="flex flex-wrap gap-2">
          {REFERENCE_CONSUMERS.map((c) => (
            <label key={c} className="flex items-center gap-1 text-[10px] text-[#a4abb2]">
              <input type="checkbox" checked={consumers.includes(c)} onChange={() => toggleConsumer(c)} />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-[10px] text-[#a4abb2]">
          <input type="checkbox" checked={approvedForAnalysis} onChange={(e) => setApprovedForAnalysis(e.target.checked)} />
          Approved for Style analysis
        </label>
        <label className="flex items-center gap-2 text-[10px] text-[#a4abb2]">
          <input type="checkbox" checked={approvedForGeneration} onChange={(e) => setApprovedForGeneration(e.target.checked)} />
          Approved for generation use
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={smallButtonClass} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </button>
        <button type="button" className={smallButtonClass} onClick={onCancel}>
          Cancel
        </button>
        {confirmingDelete ? (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-[#c9a24b]">Delete?</span>
            <button type="button" className={smallButtonClass} disabled={submitting} onClick={handleDelete}>
              Confirm
            </button>
            <button type="button" className={smallButtonClass} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={smallButtonClass + " ml-auto text-[#cf7b6b]"} disabled={submitting} onClick={() => setConfirmingDelete(true)} aria-label="Delete this reference">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

// ── Reference card ────────────────────────────────────────────────────────

function ReferenceCard({
  view,
  projectId,
  onUpdated,
  onDeleted,
}: {
  view: ProjectStyleReferenceView;
  projectId: number;
  onUpdated: (v: ProjectStyleReferenceView) => void;
  onDeleted: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const r = view.reference;
  const displayLabel = r.label || r.sourceFilename || "Untitled reference";

  if (editing) {
    return (
      <EditPanel
        view={view}
        projectId={projectId}
        onSaved={(v) => { onUpdated(v); setEditing(false); }}
        onDeleted={onDeleted}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded border border-[#2c3035] bg-[#141618] p-2 flex flex-col gap-1.5">
      {/* Thumbnail */}
      <div className="relative w-full aspect-[4/3] rounded overflow-hidden bg-[#0d0e10]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/${r.imagePath}`}
          alt={displayLabel}
          className="w-full h-full object-cover"
        />
      </div>
      {/* Label */}
      <p className="text-xs font-medium text-[#a4abb2] truncate" title={displayLabel}>
        {displayLabel}
      </p>
      {/* Badges */}
      <div className="flex flex-wrap gap-0.5">
        {view.domains.map((d) => (
          <Badge key={d}>{d}</Badge>
        ))}
        {view.consumers.map((c) => (
          <Badge key={c}>{c}</Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-0.5">
        <ApprovalBadge approved={r.approvedForAnalysis} label={r.approvedForAnalysis ? "✓ Analysis" : "Analysis"} />
        <ApprovalBadge approved={r.approvedForGeneration} label={r.approvedForGeneration ? "✓ Generation" : "Generation"} />
      </div>
      {/* Actions row */}
      <div className="flex items-center gap-1 flex-wrap">
        {r.sourceUrl && (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#5b93d6] hover:underline"
          >
            Open source
          </a>
        )}
        <button type="button" className={smallButtonClass} onClick={() => setDetailsOpen((p) => !p)} aria-expanded={detailsOpen}>
          {detailsOpen ? "Hide details" : "Details"}
        </button>
        <button type="button" className={smallButtonClass} onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      {/* Expanded details */}
      {detailsOpen && (
        <div className="flex flex-col gap-1 border-t border-[#2c3035] pt-1.5 mt-0.5">
          {r.provenanceNotes && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">Provenance</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{r.provenanceNotes}</p>
            </div>
          )}
          {r.whatInterestsMe && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">What interests me</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{r.whatInterestsMe}</p>
            </div>
          )}
          {r.whatToAvoid && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">What to avoid</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{r.whatToAvoid}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main section (controlled) ─────────────────────────────────────────────

export default function ReferenceBoardSection({
  projectId,
  references,
  onReferenceAdded,
  onReferenceUpdated,
  onReferenceDeleted,
}: {
  projectId: number;
  references: ProjectStyleReferenceView[];
  onReferenceAdded: (view: ProjectStyleReferenceView) => void;
  onReferenceUpdated: (view: ProjectStyleReferenceView) => void;
  onReferenceDeleted: (referenceId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [consumerFilter, setConsumerFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");

  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const v of references) for (const d of v.domains) set.add(d);
    return [...set].sort();
  }, [references]);

  const filtered = useMemo(() => {
    let result = references;
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter((v) => {
        const lbl = (v.reference.label ?? v.reference.sourceFilename ?? "").toLowerCase();
        return lbl.includes(q);
      });
    }
    if (domainFilter) {
      result = result.filter((v) => v.domains.some((d) => d.toLowerCase() === domainFilter.toLowerCase()));
    }
    if (consumerFilter) {
      result = result.filter((v) => v.consumers.includes(consumerFilter as ReferenceConsumer));
    }
    if (approvalFilter !== "all") {
      result = result.filter((v) => {
        if (approvalFilter === "analysis") return v.reference.approvedForAnalysis;
        if (approvalFilter === "generation") return v.reference.approvedForGeneration;
        if (approvalFilter === "unapproved") return !v.reference.approvedForAnalysis && !v.reference.approvedForGeneration;
        return true;
      });
    }
    return result;
  }, [references, search, domainFilter, consumerFilter, approvalFilter]);

  return (
    <section className="flex flex-col gap-3 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
        Reference Board ({references.length})
      </h3>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        domainFilter={domainFilter}
        onDomainFilterChange={setDomainFilter}
        consumerFilter={consumerFilter}
        onConsumerFilterChange={setConsumerFilter}
        approvalFilter={approvalFilter}
        onApprovalFilterChange={setApprovalFilter}
        allDomains={allDomains}
      />

      {filtered.length === 0 ? (
        references.length === 0 ? (
          <EmptyState title="No references yet" description="Add a reference image to get started." />
        ) : (
          <EmptyState title="No matching references" description="Try adjusting your filters." />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((v) => (
            <ReferenceCard
              key={v.reference.id}
              view={v}
              projectId={projectId}
              onUpdated={onReferenceUpdated}
              onDeleted={() => onReferenceDeleted(v.reference.id)}
            />
          ))}
        </div>
      )}

      <UploadPanel projectId={projectId} onUploaded={onReferenceAdded} />
    </section>
  );
}