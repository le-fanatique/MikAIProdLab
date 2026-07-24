"use client";

// ---------------------------------------------------------------------------
// InfluenceSection.tsx — STYLE.1.B.UI (Scope B)
//
// Truly controlled component: receives `influences` array from parent
// (single source of truth in ProjectStyleWorkspace). No internal data state.
// All mutations flow up via callbacks. Only UI state (filters, open panel,
// error) remains local.
// ---------------------------------------------------------------------------

import { useMemo, useState, useId } from "react";
import EmptyState from "@/components/EmptyState";
import {
  createInfluenceAction,
  updateInfluenceAction,
  deleteInfluenceAction,
  linkInfluenceReferenceAction,
  unlinkInfluenceReferenceAction,
  type ProjectStyleInfluenceView,
} from "@/actions/projectStyleInfluences";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import {
  INFLUENCE_SUBJECT_TYPES,
  INFLUENCE_DOMAIN_WEIGHTS,
  INFLUENCE_STATUSES,
  type InfluenceSubjectType,
  type InfluenceStatus,
  type InfluenceDomainWeight,
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

function WeightBadge({ weight }: { weight: InfluenceDomainWeight }) {
  const tone =
    weight === "primary"
      ? "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]"
      : weight === "supporting"
      ? "border-[#243449] text-[#5b93d6] bg-[#101a26]"
      : "border-[#2c3035] text-[#6e767d]";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${tone}`}>
      {weight}
    </span>
  );
}

function StatusBadge({ status }: { status: InfluenceStatus }) {
  const tone =
    status === "approved"
      ? "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]"
      : "border-[#4a3a1f] text-[#c9a24b] bg-[#1f1a10]";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase ${tone}`}>
      {status}
    </span>
  );
}

const SUBJECT_LABELS: Record<InfluenceSubjectType, string> = {
  person: "Person",
  studio: "Studio",
  work: "Work",
  movement: "Movement",
};

// ── Domain row editor ─────────────────────────────────────────────────────

type DomainRow = { domain: string; weight: InfluenceDomainWeight };

function DomainEditor({
  domains,
  onChange,
  disabled,
  instanceId,
}: {
  domains: DomainRow[];
  onChange: (rows: DomainRow[]) => void;
  disabled: boolean;
  instanceId: string;
}) {
  const [domainInput, setDomainInput] = useState("");
  const [weightInput, setWeightInput] = useState<InfluenceDomainWeight>("supporting");

  const addRow = () => {
    const trimmed = domainInput.trim();
    if (trimmed && !domains.some((d) => d.domain.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...domains, { domain: trimmed, weight: weightInput }]);
      setDomainInput("");
    }
  };

  const removeRow = (idx: number) => {
    onChange(domains.filter((_, i) => i !== idx));
  };

  return (
    <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
      <legend className="text-[10px] text-[#6e767d]">Domains</legend>
      {domains.map((d, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-xs text-[#a4abb2] flex-1">{d.domain}</span>
          <WeightBadge weight={d.weight} />
          {!disabled && (
            <button type="button" className="text-[#6e767d] hover:text-[#cf7b6b] text-[10px]" aria-label={`Remove domain ${d.domain}`} onClick={() => removeRow(i)}>×</button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="flex gap-1 mt-1">
          <label className="sr-only" htmlFor={`${instanceId}-domain-input`}>Domain name</label>
          <input
            id={`${instanceId}-domain-input`}
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(); } }}
            className={smallInputClass + " flex-1"}
            placeholder="Domain"
          />
          <label className="sr-only" htmlFor={`${instanceId}-domain-weight`}>Domain weight</label>
          <select
            id={`${instanceId}-domain-weight`}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value as InfluenceDomainWeight)}
            className={smallInputClass + " max-w-[110px]"}
          >
            {INFLUENCE_DOMAIN_WEIGHTS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <button type="button" className={smallButtonClass} onClick={addRow}>Add</button>
        </div>
      )}
    </fieldset>
  );
}

// ── Reference picker ──────────────────────────────────────────────────────

function ReferencePicker({
  references,
  selectedIds,
  onChange,
  disabled,
}: {
  references: ProjectStyleReferenceView[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  if (references.length === 0) {
    return <p className="text-[10px] text-[#4b5158]">No references available in the Reference Board.</p>;
  }

  return (
    <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
      <legend className="text-[10px] text-[#6e767d]">Supporting references</legend>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto">
        {references.map((v) => {
          const r = v.reference;
          const lbl = r.label || r.sourceFilename || "Untitled";
          const selected = selectedIds.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={selected}
              aria-label={`Reference: ${lbl}`}
              className={`flex items-center gap-1.5 rounded border p-1 text-left transition-colors ${
                selected ? "border-[#5b93d6] bg-[#14202e]" : "border-[#2c3035] bg-[#141618]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-[#3a4046] cursor-pointer"}`}
              onClick={() => !disabled && toggle(r.id)}
              disabled={disabled}
            >
              <div className="w-8 h-8 rounded overflow-hidden bg-[#0d0e10] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/${r.imagePath}`} alt={lbl} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] text-[#a4abb2] truncate">{lbl}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ── Influence form (shared between create and edit) ───────────────────────

type InfluenceFormState = {
  subjectType: InfluenceSubjectType;
  subjectName: string;
  disambiguation: string;
  roleOrDiscipline: string;
  periodOrWorks: string;
  whatInterestsMe: string;
  whatToAvoid: string;
  researchNotes: string;
  domains: DomainRow[];
  selectedReferenceIds: number[];
};

function emptyForm(): InfluenceFormState {
  return {
    subjectType: "person",
    subjectName: "",
    disambiguation: "",
    roleOrDiscipline: "",
    periodOrWorks: "",
    whatInterestsMe: "",
    whatToAvoid: "",
    researchNotes: "",
    domains: [],
    selectedReferenceIds: [],
  };
}

function InfluenceForm({
  form,
  onChange,
  references,
  showStatus,
  status,
  onStatusChange,
  onSubmit,
  onCancel,
  submitting,
  error,
  submitLabel,
  instanceId,
}: {
  form: InfluenceFormState;
  onChange: (f: InfluenceFormState) => void;
  references: ProjectStyleReferenceView[];
  showStatus: boolean;
  status: InfluenceStatus;
  onStatusChange: (s: InfluenceStatus) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
  submitLabel: string;
  instanceId: string;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(e); }} className="rounded border border-[#243449] bg-[#101a26] p-3 flex flex-col gap-2">
      {error && <p className="text-xs text-[#cf7b6b]" role="alert">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-[#6e767d]">
          Subject type
          <select
            value={form.subjectType}
            onChange={(e) => onChange({ ...form, subjectType: e.target.value as InfluenceSubjectType })}
            className={smallInputClass + " mt-0.5"}
          >
            {INFLUENCE_SUBJECT_TYPES.map((t) => (
              <option key={t} value={t}>{SUBJECT_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-[#6e767d]">
          Subject name *
          <input
            value={form.subjectName}
            onChange={(e) => onChange({ ...form, subjectName: e.target.value })}
            className={smallInputClass + " mt-0.5"}
            placeholder="Required"
          />
        </label>
        <label className="text-[10px] text-[#6e767d]">
          Disambiguation
          <input
            value={form.disambiguation}
            onChange={(e) => onChange({ ...form, disambiguation: e.target.value })}
            className={smallInputClass + " mt-0.5"}
            placeholder="Optional"
          />
        </label>
        <label className="text-[10px] text-[#6e767d]">
          Role / discipline
          <input
            value={form.roleOrDiscipline}
            onChange={(e) => onChange({ ...form, roleOrDiscipline: e.target.value })}
            className={smallInputClass + " mt-0.5"}
            placeholder="Optional"
          />
        </label>
        <label className="text-[10px] text-[#6e767d] col-span-2">
          Period / works
          <input
            value={form.periodOrWorks}
            onChange={(e) => onChange({ ...form, periodOrWorks: e.target.value })}
            className={smallInputClass + " mt-0.5"}
            placeholder="Optional"
          />
        </label>
      </div>
      <label className="text-[10px] text-[#6e767d]">
        What interests me
        <textarea value={form.whatInterestsMe} onChange={(e) => onChange({ ...form, whatInterestsMe: e.target.value })} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        What to avoid
        <textarea value={form.whatToAvoid} onChange={(e) => onChange({ ...form, whatToAvoid: e.target.value })} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <label className="text-[10px] text-[#6e767d]">
        Research notes
        <textarea value={form.researchNotes} onChange={(e) => onChange({ ...form, researchNotes: e.target.value })} rows={2} className={fieldClass + " mt-0.5"} />
      </label>
      <DomainEditor
        domains={form.domains}
        onChange={(d) => onChange({ ...form, domains: d })}
        disabled={false}
        instanceId={instanceId}
      />
      <ReferencePicker
        references={references}
        selectedIds={form.selectedReferenceIds}
        onChange={(ids) => onChange({ ...form, selectedReferenceIds: ids })}
        disabled={false}
      />
      {showStatus && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[#6e767d]" htmlFor={`${instanceId}-status`}>Status</label>
          <select
            id={`${instanceId}-status`}
            value={status}
            onChange={(e) => onStatusChange(e.target.value as InfluenceStatus)}
            className={smallInputClass + " max-w-[120px]"}
          >
            {INFLUENCE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" className={smallButtonClass} disabled={submitting || !form.subjectName.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button type="button" className={smallButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Create panel ──────────────────────────────────────────────────────────

function CreatePanel({
  projectId,
  references,
  onCreated,
  onPartialCreated,
}: {
  projectId: number;
  references: ProjectStyleReferenceView[];
  onCreated: (view: ProjectStyleInfluenceView) => void;
  onPartialCreated: (view: ProjectStyleInfluenceView, errorMessage: string) => void;
}) {
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InfluenceFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Phase 1: Create the influence — if this fails, stay in CreatePanel.
    let createResult: { ok: true; view: ProjectStyleInfluenceView } | { ok: false; error: string };
    try {
      createResult = await createInfluenceAction({
        projectId,
        subjectType: form.subjectType,
        subjectName: form.subjectName,
        disambiguation: form.disambiguation.trim() || null,
        roleOrDiscipline: form.roleOrDiscipline.trim() || null,
        periodOrWorks: form.periodOrWorks.trim() || null,
        whatInterestsMe: form.whatInterestsMe.trim() || null,
        whatToAvoid: form.whatToAvoid.trim() || null,
        researchNotes: form.researchNotes.trim() || null,
        domains: form.domains,
      });
    } catch {
      setError("Unexpected error during creation.");
      setSubmitting(false);
      return;
    }

    if (!createResult.ok) {
      setError(createResult.error);
      setSubmitting(false);
      return;
    }

    // Phase 2: Link references — creation succeeded, never return to create
    // path for this dossier regardless of link outcomes.
    const confirmedIds: number[] = [];
    let partialError: string | null = null;
    for (const refId of form.selectedReferenceIds) {
      try {
        const linkResult = await linkInfluenceReferenceAction(projectId, createResult.view.influence.id, refId);
        if (linkResult.ok) {
          confirmedIds.push(refId);
        } else if (!partialError) {
          partialError = `Reference link failed: ${linkResult.error}`;
        }
      } catch {
        if (!partialError) {
          partialError = `Reference link ${refId} threw an unexpected error.`;
        }
      }
    }

    const finalView: ProjectStyleInfluenceView = {
      ...createResult.view,
      referenceIds: confirmedIds,
    };

    // Always close CreatePanel — the dossier now exists.
    setForm(emptyForm());
    setOpen(false);
    setSubmitting(false);

    if (partialError) {
      onPartialCreated(finalView, partialError);
    } else {
      onCreated(finalView);
    }
  };

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        Add influence
      </button>
    );
  }

  return (
    <InfluenceForm
      form={form}
      onChange={setForm}
      references={references}
      showStatus={false}
      status="draft"
      onStatusChange={() => {}}
      onSubmit={handleSubmit}
      onCancel={() => { setForm(emptyForm()); setError(null); setOpen(false); }}
      submitting={submitting}
      error={error}
      submitLabel="Create"
      instanceId={`${instanceId}-create`}
    />
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────

function EditPanel({
  view,
  projectId,
  references,
  initialError,
  onCompleted,
  onProgress,
  onDeleted,
  onCancel,
}: {
  view: ProjectStyleInfluenceView;
  projectId: number;
  references: ProjectStyleReferenceView[];
  initialError?: string | null;
  /** Total success: metadata + all links confirmed. Parent should close editor. */
  onCompleted: (v: ProjectStyleInfluenceView) => void;
  /** Partial success: metadata confirmed but some links failed. Parent should update state but keep editor open. */
  onProgress: (v: ProjectStyleInfluenceView) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const instanceId = useId();
  const [form, setForm] = useState<InfluenceFormState>({
    subjectType: view.influence.subjectType as InfluenceSubjectType,
    subjectName: view.influence.subjectName,
    disambiguation: view.influence.disambiguation ?? "",
    roleOrDiscipline: view.influence.roleOrDiscipline ?? "",
    periodOrWorks: view.influence.periodOrWorks ?? "",
    whatInterestsMe: view.influence.whatInterestsMe ?? "",
    whatToAvoid: view.influence.whatToAvoid ?? "",
    researchNotes: view.influence.researchNotes ?? "",
    domains: view.domains,
    selectedReferenceIds: view.referenceIds,
  });
  const [status, setStatus] = useState<InfluenceStatus>(view.influence.status as InfluenceStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Baseline: confirmed reference ids, updated after each successful CORE op.
  // Starts from the view's current referenceIds (which reflects actual DB state).
  const [confirmedRefIds, setConfirmedRefIds] = useState<number[]>(view.referenceIds);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await updateInfluenceAction({
        projectId,
        influenceId: view.influence.id,
        status,
        subjectType: form.subjectType,
        subjectName: form.subjectName,
        disambiguation: form.disambiguation.trim() || null,
        roleOrDiscipline: form.roleOrDiscipline.trim() || null,
        periodOrWorks: form.periodOrWorks.trim() || null,
        whatInterestsMe: form.whatInterestsMe.trim() || null,
        whatToAvoid: form.whatToAvoid.trim() || null,
        researchNotes: form.researchNotes.trim() || null,
        domains: form.domains,
      });
      if (result.ok) {
        // Compute delta from confirmed baseline (not from original view)
        const toLink = form.selectedReferenceIds.filter((id) => !confirmedRefIds.includes(id));
        const toUnlink = confirmedRefIds.filter((id) => !form.selectedReferenceIds.includes(id));

        // Working set starts from confirmed baseline
        const workingRefIds = new Set(confirmedRefIds);
        let partialError: string | null = null;

        for (const refId of toLink) {
          try {
            const r = await linkInfluenceReferenceAction(projectId, view.influence.id, refId);
            if (r.ok) {
              workingRefIds.add(refId);
            } else if (!partialError) {
              partialError = `Failed to link reference ${refId}: ${r.error}`;
            }
          } catch {
            if (!partialError) {
              partialError = `Reference link ${refId} threw an unexpected error.`;
            }
          }
        }
        for (const refId of toUnlink) {
          try {
            const r = await unlinkInfluenceReferenceAction(projectId, view.influence.id, refId);
            if (r.ok) {
              workingRefIds.delete(refId);
            } else if (!partialError) {
              partialError = `Failed to unlink reference ${refId}: ${r.error}`;
            }
          } catch {
            if (!partialError) {
              partialError = `Reference unlink ${refId} threw an unexpected error.`;
            }
          }
        }

        // Always update baseline to confirmed state
        const newConfirmed = [...workingRefIds];
        setConfirmedRefIds(newConfirmed);

        const finalView: ProjectStyleInfluenceView = {
          ...result.view,
          referenceIds: newConfirmed,
        };

        if (partialError) {
          // Partial: update parent state but keep editor open
          onProgress(finalView);
          setError(partialError);
          setForm((prev) => ({ ...prev, selectedReferenceIds: newConfirmed }));
        } else {
          // Total success: update parent state and close editor
          onCompleted(finalView);
        }
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
      const result = await deleteInfluenceAction(projectId, view.influence.id);
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
    <div className="flex flex-col gap-2">
      <InfluenceForm
        form={form}
        onChange={setForm}
        references={references}
        showStatus={true}
        status={status}
        onStatusChange={setStatus}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        submitting={submitting}
        error={error}
        submitLabel="Save"
        instanceId={`${instanceId}-edit`}
      />
      {confirmingDelete ? (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-[10px] text-[#c9a24b]">Delete this influence?</span>
          <button type="button" className={smallButtonClass} disabled={submitting} onClick={handleDelete}>
            Confirm
          </button>
          <button type="button" className={smallButtonClass} onClick={() => setConfirmingDelete(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={smallButtonClass + " ml-2 text-[#cf7b6b]"} disabled={submitting} onClick={() => setConfirmingDelete(true)} aria-label="Delete this influence">
          Delete
        </button>
      )}
    </div>
  );
}

// ── Influence card ────────────────────────────────────────────────────────

function InfluenceCard({
  view,
  projectId,
  references,
  isEditing,
  initialError,
  onEdit,
  onProgress,
  onCompleted,
  onDeleted,
  onCancelEdit,
}: {
  view: ProjectStyleInfluenceView;
  projectId: number;
  references: ProjectStyleReferenceView[];
  /** Controlled: parent decides if this card is in edit mode. */
  isEditing: boolean;
  initialError?: string | null;
  /** Request parent to enter edit mode for this card. */
  onEdit: () => void;
  /** Partial success: parent syncs state, keeps editor open. */
  onProgress: (v: ProjectStyleInfluenceView) => void;
  /** Total success: parent syncs state and closes editor. */
  onCompleted: (v: ProjectStyleInfluenceView) => void;
  onDeleted: () => void;
  onCancelEdit: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const inf = view.influence;

  if (isEditing) {
    return (
      <EditPanel
        view={view}
        projectId={projectId}
        references={references}
        initialError={initialError}
        onCompleted={onCompleted}
        onProgress={onProgress}
        onDeleted={onDeleted}
        onCancel={onCancelEdit}
      />
    );
  }

  const linkedRefViews = references.filter((r) => view.referenceIds.includes(r.reference.id));

  return (
    <div className="rounded border border-[#2c3035] bg-[#141618] p-2.5 flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p className="text-xs font-medium text-[#a4abb2] truncate">{inf.subjectName}</p>
          <div className="flex flex-wrap gap-1">
            <Badge>{SUBJECT_LABELS[inf.subjectType as InfluenceSubjectType]}</Badge>
            <StatusBadge status={inf.status as InfluenceStatus} />
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" className={smallButtonClass} onClick={onEdit}>Edit</button>
        </div>
      </div>

      {/* Summary */}
      {(inf.roleOrDiscipline || inf.periodOrWorks) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#6e767d]">
          {inf.roleOrDiscipline && <span>{inf.roleOrDiscipline}</span>}
          {inf.periodOrWorks && <span>{inf.periodOrWorks}</span>}
        </div>
      )}

      {/* Domains */}
      {view.domains.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {view.domains.map((d, i) => (
            <span key={i} className="inline-flex items-center gap-0.5">
              <span className="text-[9px] text-[#6e767d]">{d.domain}</span>
              <WeightBadge weight={d.weight} />
            </span>
          ))}
        </div>
      )}

      {/* Linked references count + mini thumbnails */}
      {linkedRefViews.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#4b5158]">{linkedRefViews.length} ref(s)</span>
          <div className="flex gap-0.5">
            {linkedRefViews.slice(0, 4).map((rv) => (
              <div key={rv.reference.id} className="w-5 h-5 rounded overflow-hidden bg-[#0d0e10]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/${rv.reference.imagePath}`}
                  alt={rv.reference.label || rv.reference.sourceFilename || ""}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {linkedRefViews.length > 4 && (
              <span className="text-[9px] text-[#4b5158]">+{linkedRefViews.length - 4}</span>
            )}
          </div>
        </div>
      )}

      {/* Expandable details */}
      <button type="button" className={smallButtonClass + " self-start"} onClick={() => setDetailsOpen((p) => !p)} aria-expanded={detailsOpen}>
        {detailsOpen ? "Hide details" : "Details"}
      </button>
      {detailsOpen && (
        <div className="flex flex-col gap-1 border-t border-[#2c3035] pt-1.5 mt-0.5">
          {inf.disambiguation && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">Disambiguation</p>
              <p className="text-xs text-[#6e767d]">{inf.disambiguation}</p>
            </div>
          )}
          {inf.whatInterestsMe && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">What interests me</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{inf.whatInterestsMe}</p>
            </div>
          )}
          {inf.whatToAvoid && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">What to avoid</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{inf.whatToAvoid}</p>
            </div>
          )}
          {inf.researchNotes && (
            <div>
              <p className="text-[10px] text-[#4b5158] uppercase">Research notes</p>
              <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{inf.researchNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────

function InfluenceFilterBar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  domainFilter,
  onDomainFilterChange,
  allDomains,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  domainFilter: string;
  onDomainFilterChange: (v: string) => void;
  allDomains: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="inf-search">Search influences</label>
      <input
        id="inf-search"
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className={smallInputClass + " max-w-[200px]"}
        placeholder="Search subject…"
      />
      <label className="sr-only" htmlFor="inf-type-filter">Subject type filter</label>
      <select
        id="inf-type-filter"
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
        className={smallInputClass + " max-w-[130px]"}
      >
        <option value="">All types</option>
        {INFLUENCE_SUBJECT_TYPES.map((t) => (
          <option key={t} value={t}>{SUBJECT_LABELS[t]}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="inf-status-filter">Status filter</label>
      <select
        id="inf-status-filter"
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className={smallInputClass + " max-w-[130px]"}
      >
        <option value="">All statuses</option>
        {INFLUENCE_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="inf-domain-filter">Domain filter</label>
      <select
        id="inf-domain-filter"
        value={domainFilter}
        onChange={(e) => onDomainFilterChange(e.target.value)}
        className={smallInputClass + " max-w-[160px]"}
      >
        <option value="">All domains</option>
        {allDomains.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}

// ── Main section (truly controlled) ───────────────────────────────────────

export default function InfluenceSection({
  projectId,
  influences,
  references,
  onInfluenceCreated,
  onInfluenceUpdated,
  onInfluenceDeleted,
}: {
  projectId: number;
  influences: ProjectStyleInfluenceView[];
  references: ProjectStyleReferenceView[];
  onInfluenceCreated?: (view: ProjectStyleInfluenceView) => void;
  onInfluenceUpdated?: (view: ProjectStyleInfluenceView) => void;
  onInfluenceDeleted?: (influenceId: number) => void;
}) {
  // UI-only state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  // Track which influence should be in edit mode (e.g. after partial creation)
  const [editingId, setEditingId] = useState<number | null>(null);
  // Error message to inject into the edit panel after partial creation
  const [editingError, setEditingError] = useState<string | null>(null);

  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const v of influences) for (const d of v.domains) set.add(d.domain);
    return [...set].sort();
  }, [influences]);

  const filtered = useMemo(() => {
    let result = influences;
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter((v) => v.influence.subjectName.toLowerCase().includes(q));
    }
    if (typeFilter) {
      result = result.filter((v) => v.influence.subjectType === typeFilter);
    }
    if (statusFilter) {
      result = result.filter((v) => v.influence.status === statusFilter);
    }
    if (domainFilter) {
      result = result.filter((v) => v.domains.some((d) => d.domain.toLowerCase() === domainFilter.toLowerCase()));
    }
    return result;
  }, [influences, search, typeFilter, statusFilter, domainFilter]);

  const handleCreated = (view: ProjectStyleInfluenceView) => {
    onInfluenceCreated?.(view);
    setEditingId(null);
    setEditingError(null);
  };

  const handlePartialCreated = (view: ProjectStyleInfluenceView, errorMessage: string) => {
    // Add to parent state, open in edit mode with the CORE error visible.
    // Reset filters so the new card is always rendered.
    onInfluenceCreated?.(view);
    setEditingId(view.influence.id);
    setEditingError(errorMessage);
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setDomainFilter("");
  };

  const handleProgress = (updated: ProjectStyleInfluenceView) => {
    onInfluenceUpdated?.(updated);
    // Keep editor open, clear editing error (it's shown inside EditPanel)
    setEditingError(null);
  };

  const handleCompleted = (updated: ProjectStyleInfluenceView) => {
    onInfluenceUpdated?.(updated);
    setEditingId(null);
    setEditingError(null);
  };

  const handleDeleted = (influenceId: number) => {
    onInfluenceDeleted?.(influenceId);
    if (editingId === influenceId) {
      setEditingId(null);
      setEditingError(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingError(null);
  };

  return (
    <section className="flex flex-col gap-3 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
        Creative Influences ({influences.length})
      </h3>

      <InfluenceFilterBar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        domainFilter={domainFilter}
        onDomainFilterChange={setDomainFilter}
        allDomains={allDomains}
      />

      {/* Render filtered cards + the active editing card (even if excluded by filters) */}
      {(() => {
        // The editing card (if any) is always rendered, even if filters would exclude it.
        // It appears at its natural position if in the filtered set, or appended at the end.
        const editingCard = editingId !== null
          ? influences.find((v) => v.influence.id === editingId) ?? null
          : null;
        const editingInFiltered = editingCard !== null && filtered.some((v) => v.influence.id === editingId);

        if (filtered.length === 0 && !editingCard) {
          return influences.length === 0 ? (
            <EmptyState title="No influences yet" description="Add a creative influence to get started." />
          ) : (
            <EmptyState title="No matching influences" description="Try adjusting your filters." />
          );
        }

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((v) => (
              <InfluenceCard
                key={v.influence.id}
                view={v}
                projectId={projectId}
                references={references}
                isEditing={editingId === v.influence.id}
                initialError={editingId === v.influence.id ? editingError : undefined}
                onEdit={() => { setEditingId(v.influence.id); setEditingError(null); }}
                onProgress={handleProgress}
                onCompleted={handleCompleted}
                onDeleted={() => handleDeleted(v.influence.id)}
                onCancelEdit={handleCancelEdit}
              />
            ))}
            {/* If editing card is not in filtered set, render it at the end */}
            {editingCard && !editingInFiltered && (
              <InfluenceCard
                key={`editing-${editingCard.influence.id}`}
                view={editingCard}
                projectId={projectId}
                references={references}
                isEditing={true}
                initialError={editingError}
                onEdit={() => {}}
                onProgress={handleProgress}
                onCompleted={handleCompleted}
                onDeleted={() => handleDeleted(editingCard.influence.id)}
                onCancelEdit={handleCancelEdit}
              />
            )}
          </div>
        );
      })()}

      <CreatePanel
        projectId={projectId}
        references={references}
        onCreated={handleCreated}
        onPartialCreated={handlePartialCreated}
      />
    </section>
  );
}