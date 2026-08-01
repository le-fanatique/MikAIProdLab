"use client";

// ---------------------------------------------------------------------------
// CandidateRuleCard.tsx — STYLE.1.B.ANALYSIS.UI (retake 4)
//
// Fully controlled: no local state copies of rule.
// F1: useRef lock prevents double-submit.
// F3: CORE approve returns { draftRuleId, draftRevision } — no phantom field.
// F4: snapshotParser used directly, corruption shown inline.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";
import { parseReferenceSnapshot } from "@/lib/projectStyle/referenceAnalysis/snapshotParser";
import {
  updateReferenceAnalysisCandidateRuleAction,
  rejectReferenceAnalysisCandidateRuleAction,
  approveReferenceAnalysisCandidateRuleAction,
} from "@/actions/projectStyleReferenceAnalysis";
import type {
  ProjectStyleReferenceAnalysisCandidateRule,
  ProjectStyleReferenceAnalysisCandidateRuleReference,
  ProjectStyleReferenceAnalysisRunReference,
} from "@/db/schema";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import type { StylePillar, StyleRuleStrength } from "@/lib/projectStyle/styleSnapshot";

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const STRENGTH_OPTIONS: StyleRuleStrength[] = ["Required", "Preferred", "Avoid"];

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

type RefDisplayInfo = { referenceKey: string; label: string | null; imagePath: string | null; snapshotError: string | null };

type MutatedPatch = {
  instruction?: string;
  pillar?: string | null;
  section?: string | null;
  category?: string | null;
  strength?: string | null;
  applicability?: string | null;
  status?: "proposed" | "rejected" | "approved";
  revision?: number;
};

export default function CandidateRuleCard({
  rule,
  isPending,
  ruleRefs,
  runRefByRefId,
  allReferences,
  projectId,
  draftRevision,
  onMutated,
  onApproved,
}: {
  rule: ProjectStyleReferenceAnalysisCandidateRule;
  isPending: boolean;
  ruleRefs: ProjectStyleReferenceAnalysisCandidateRuleReference[];
  runRefByRefId: Map<number, ProjectStyleReferenceAnalysisRunReference>;
  allReferences: ProjectStyleReferenceView[];
  projectId: number;
  draftRevision: number | null;
  onMutated: (ruleId: number, patch: MutatedPatch) => Promise<void>;
  onApproved: (ruleId: number, patch: { status: "approved"; draftRevision: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState(rule.instruction);
  const [editPillar, setEditPillar] = useState<StylePillar | null>(rule.pillar as StylePillar | null);
  const [editSection, setEditSection] = useState(rule.section ?? "");
  const [editCategory, setEditCategory] = useState(rule.category ?? "");
  const [editStrength, setEditStrength] = useState<StyleRuleStrength | null>(rule.strength as StyleRuleStrength | null);
  const [editApplicability, setEditApplicability] = useState(rule.applicability ?? "");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F1: useRef lock
  const lockRef = useRef(false);

  const refById = useMemo(() => {
    const m = new Map<number, ProjectStyleReferenceView>();
    for (const v of allReferences) m.set(v.reference.id, v);
    return m;
  }, [allReferences]);

  // F4: parseReferenceSnapshot directly, show corruption diagnostic
  const sourceRefInfos = useMemo(() => {
    return ruleRefs.map((rr): RefDisplayInfo => {
      const runRef = runRefByRefId.get(rr.referenceId);
      const currentRef = refById.get(rr.referenceId);
      if (runRef) {
        const parsed = parseReferenceSnapshot(runRef.referenceSnapshot);
        if (parsed.ok) {
          return {
            referenceKey: runRef.referenceKey,
            label: parsed.label ?? currentRef?.reference.label ?? null,
            imagePath: currentRef?.reference.imagePath ?? null,
            snapshotError: null,
          };
        }
        return {
          referenceKey: runRef.referenceKey,
          label: currentRef?.reference.label ?? null,
          imagePath: currentRef?.reference.imagePath ?? null,
          snapshotError: parsed.error,
        };
      }
      return {
        referenceKey: `Ref ${rr.referenceId}`,
        label: currentRef?.reference.label ?? null,
        imagePath: currentRef?.reference.imagePath ?? null,
        snapshotError: null,
      };
    });
  }, [ruleRefs, runRefByRefId, refById]);

  const handleSave = async () => {
    if (lockRef.current || isPending) return;
    lockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await updateReferenceAnalysisCandidateRuleAction({
        projectId,
        candidateRuleId: rule.id,
        expectedRevision: rule.revision,
        instruction: editInstruction.trim(),
        pillar: editPillar,
        section: editSection.trim() || null,
        category: editCategory.trim() || null,
        strength: editStrength,
        applicability: editApplicability.trim() || null,
      });
      if (result.ok) {
        setEditing(false);
        await onMutated(rule.id, {
          instruction: editInstruction.trim(),
          pillar: editPillar,
          section: editSection.trim() || null,
          category: editCategory.trim() || null,
          strength: editStrength,
          applicability: editApplicability.trim() || null,
          revision: result.revision as number,
        });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected transport error. Your edits are preserved.");
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (lockRef.current || isPending) return;
    lockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await rejectReferenceAnalysisCandidateRuleAction({
        projectId,
        candidateRuleId: rule.id,
        expectedRevision: rule.revision,
      });
      if (result.ok) {
        await onMutated(rule.id, { status: "rejected" });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected transport error.");
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (draftRevision === null) {
      setError("No Working Draft exists. Create one before approving rules.");
      return;
    }
    if (lockRef.current || isPending) return;
    lockRef.current = true;
    setApproving(true);
    setError(null);
    try {
      // F3: CORE returns { ok: true, draftRuleId, draftRevision } — not candidateRuleRevision
      const result = await approveReferenceAnalysisCandidateRuleAction({
        projectId,
        candidateRuleId: rule.id,
        expectedCandidateRevision: rule.revision,
        expectedDraftRevision: draftRevision,
      });
      if (result.ok) {
        // F3: pass the new draftRevision so parent can reload Working Draft
        await onApproved(rule.id, { status: "approved", draftRevision: result.draftRevision as number });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected transport error during approval. The rule was not approved.");
    } finally {
      lockRef.current = false;
      setApproving(false);
    }
  };

  const isProposed = rule.status === "proposed";
  const statusBorder =
    rule.status === "approved" ? "border-[#2c6142]" : rule.status === "rejected" ? "border-[#3d2323] opacity-60" : "border-[#2c3035]";

  return (
    <div className={`rounded border p-2 flex flex-col gap-1.5 ${statusBorder} ${isPending ? "opacity-50" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={rule.status === "approved" ? "ok" : rule.status === "rejected" ? "error" : "info"}>
          {rule.status}
        </Badge>
        {rule.pillar && <Badge tone="muted">{rule.pillar === "world" ? "World" : "Visual"}</Badge>}
        {rule.strength && <Badge tone="muted">{rule.strength}</Badge>}
        {rule.category && <Badge tone="muted">{rule.category}</Badge>}
        <span className="text-[9px] text-[#4b5158]">confidence: {rule.confidence}</span>
      </div>

      {/* Source references with thumbnails — F4: corruption shown inline */}
      {sourceRefInfos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sourceRefInfos.map((info, i) => (
            <div key={i} className="flex items-center gap-1 rounded border border-[#2c3035] px-1.5 py-0.5">
              <span className="text-[9px] font-mono text-[#5b93d6]">{info.referenceKey}</span>
              {info.imagePath && (
                <ThumbnailHoverPreview src={refImageUrl(info.imagePath)} alt={info.label ?? ""} previewSize={320}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refImageUrl(info.imagePath)} alt={info.label ?? ""} className="w-5 h-5 object-cover rounded" />
                </ThumbnailHoverPreview>
              )}
              {info.label && <span className="text-[9px] text-[#6e767d] truncate max-w-[80px]">{info.label}</span>}
              {info.snapshotError && <span className="text-[9px] text-[#c9a24b]" title={info.snapshotError}>⚠ snapshot</span>}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[#cf7b6b]" role="alert">{error}</p>}

      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }} className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#6e767d]">
            Instruction
            <textarea value={editInstruction} onChange={(e) => setEditInstruction(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-[#6e767d]">
              Pillar
              <select value={editPillar ?? ""} onChange={(e) => setEditPillar((e.target.value || null) as StylePillar | null)} className={smallInputClass + " mt-0.5"}>
                <option value="">No pillar</option>
                <option value="world">World</option>
                <option value="visual">Visual</option>
              </select>
            </label>
            <label className="text-[10px] text-[#6e767d]">
              Strength
              <select value={editStrength ?? ""} onChange={(e) => setEditStrength((e.target.value || null) as StyleRuleStrength | null)} className={smallInputClass + " mt-0.5"}>
                <option value="">No strength</option>
                {STRENGTH_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </label>
            <label className="text-[10px] text-[#6e767d]">
              Section
              <input value={editSection} onChange={(e) => setEditSection(e.target.value)} className={smallInputClass + " mt-0.5"} />
            </label>
            <label className="text-[10px] text-[#6e767d]">
              Category
              <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className={smallInputClass + " mt-0.5"} />
            </label>
            <label className="text-[10px] text-[#6e767d] col-span-2">
              Applicability
              <input value={editApplicability} onChange={(e) => setEditApplicability(e.target.value)} className={smallInputClass + " mt-0.5"} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={smallButtonClass} disabled={saving || isPending || !editInstruction.trim()}>
              {saving ? "Saving\u2026" : "Save"}
            </button>
            <button type="button" className={smallButtonClass} onClick={() => {
              setEditing(false);
              setEditInstruction(rule.instruction);
              setEditPillar(rule.pillar as StylePillar | null);
              setEditSection(rule.section ?? "");
              setEditCategory(rule.category ?? "");
              setEditStrength(rule.strength as StyleRuleStrength | null);
              setEditApplicability(rule.applicability ?? "");
              setError(null);
            }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-xs text-[#a4abb2] whitespace-pre-wrap">{rule.instruction}</p>
          {rule.rationale && <p className="text-[10px] text-[#6e767d] italic">{rule.rationale}</p>}
          {rule.uncertainty && <p className="text-[10px] text-[#4b5158]">Uncertainty: {rule.uncertainty}</p>}
          {rule.applicability && <p className="text-[10px] text-[#4b5158]">Applies to: {rule.applicability}</p>}
          <div className="flex gap-2 flex-wrap">
            {isProposed && (
              <>
                <button type="button" className={smallButtonClass} onClick={() => setEditing(true)} disabled={saving || approving || isPending}>
                  Edit
                </button>
                <button type="button" className={smallButtonClass + " text-[#cf7b6b]"} onClick={() => void handleReject()} disabled={saving || approving || isPending}>
                  Reject
                </button>
                <button
                  type="button"
                  className={smallButtonClass + " text-[#8fc9a0]"}
                  onClick={() => void handleApprove()}
                  disabled={saving || approving || isPending || draftRevision === null}
                  title={draftRevision === null ? "No Working Draft available" : "Approve into Working Draft"}
                >
                  {approving ? "Approving\u2026" : "Approve into Draft"}
                </button>
              </>
            )}
            {rule.status === "approved" && (
              <span className="text-[10px] text-[#8fc9a0]">Added to Working Draft as Style Rule</span>
            )}
          </div>
          {draftRevision === null && isProposed && (
            <p className="text-[10px] text-[#c9a24b]">No Working Draft exists. Create one to enable approval.</p>
          )}
        </>
      )}
    </div>
  );
}
