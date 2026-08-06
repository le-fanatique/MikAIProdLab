"use client";

// ---------------------------------------------------------------------------
// ObservationCard.tsx — STYLE.1.B.ANALYSIS.UI (retake 4)
//
// Fully controlled: no local state copies of observation.
// F1: useRef lock prevents double-submit on same render cycle.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import Collapsible from "@/components/Collapsible";
import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  updateReferenceAnalysisObservationAction,
  setReferenceAnalysisObservationStatusAction,
} from "@/actions/projectStyleReferenceAnalysis";
import type { ProjectStyleReferenceAnalysisObservation } from "@/db/schema";

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function Badge({ tone, children }: { tone: "muted" | "ok" | "warn" | "error"; children: React.ReactNode }) {
  const toneClass = {
    muted: "border-[#2c3035] text-[#6e767d]",
    ok: "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]",
    warn: "border-[#4a3a1f] text-[#c9a24b] bg-[#1f1a10]",
    error: "border-[#3d2323] text-[#cf7b6b] bg-[#1a1212]",
  }[tone];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${toneClass}`}>
      {children}
    </span>
  );
}

type RefInfo = { referenceKey: string; label: string | null; imagePath: string | null };

type MutatedPatch = {
  domain?: string | null;
  observation?: string;
  rationale?: string | null;
  status?: "proposed" | "accepted" | "rejected";
  revision: number;
};

export default function ObservationCard({
  observation,
  isPending,
  refInfo,
  projectId,
  onMutated,
}: {
  observation: ProjectStyleReferenceAnalysisObservation;
  isPending: boolean;
  refInfo: RefInfo;
  projectId: number;
  onMutated: (observationId: number, patch: MutatedPatch) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editDomain, setEditDomain] = useState(observation.domain ?? "");
  const [editObservation, setEditObservation] = useState(observation.observation);
  const [editRationale, setEditRationale] = useState(observation.rationale ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F1: useRef lock — acquired synchronously before any await
  const lockRef = useRef(false);

  const obs = observation;

  const handleSave = async () => {
    if (lockRef.current || isPending) return;
    lockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await updateReferenceAnalysisObservationAction({
        projectId,
        observationId: obs.id,
        expectedRevision: obs.revision,
        domain: editDomain.trim() || null,
        observation: editObservation.trim(),
        rationale: editRationale.trim() || null,
      });
      if (result.ok) {
        setEditing(false);
        await onMutated(obs.id, {
          domain: editDomain.trim() || null,
          observation: editObservation.trim(),
          rationale: editRationale.trim() || null,
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

  const handleStatusChange = async (status: "accepted" | "rejected") => {
    if (lockRef.current || isPending) return;
    lockRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await setReferenceAnalysisObservationStatusAction({
        projectId,
        observationId: obs.id,
        expectedRevision: obs.revision,
        status,
      });
      if (result.ok) {
        await onMutated(obs.id, { status, revision: result.revision as number });
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unexpected transport error. Status was not changed.");
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  };

  const statusBorder =
    obs.status === "accepted" ? "border-[#2c6142]" : obs.status === "rejected" ? "border-[#3d2323] opacity-60" : "border-[#2c3035]";

  return (
    <div className={`rounded border p-2 flex flex-col gap-1.5 ${statusBorder} ${isPending ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-[#5b93d6]">{refInfo.referenceKey}</span>
        {refInfo.imagePath && (
          <ThumbnailHoverPreview src={refImageUrl(refInfo.imagePath)} alt={refInfo.label ?? ""}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImageUrl(refInfo.imagePath)} alt={refInfo.label ?? ""} className="w-6 h-6 object-cover rounded" />
          </ThumbnailHoverPreview>
        )}
        <span className="text-[10px] text-[#a4abb2] truncate max-w-[100px]">{refInfo.label ?? "Untitled"}</span>
        {obs.domain && (
          <span className="text-[10px] border border-[#2c3035] rounded px-1 text-[#6e767d]">{obs.domain}</span>
        )}
        <Badge tone={obs.status === "accepted" ? "ok" : obs.status === "rejected" ? "error" : "muted"}>
          {obs.status}
        </Badge>
        <span className="text-[9px] text-[#4b5158]">confidence: {obs.confidence}</span>
      </div>

      {error && <p className="text-xs text-[#cf7b6b]" role="alert">{error}</p>}

      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }} className="flex flex-col gap-1.5">
          <label className="text-[10px] text-[#6e767d]">
            Domain
            <input value={editDomain} onChange={(e) => setEditDomain(e.target.value)} className={smallInputClass + " mt-0.5"} />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Observation
            <textarea value={editObservation} onChange={(e) => setEditObservation(e.target.value)} rows={3} className={fieldClass + " mt-0.5"} />
          </label>
          <label className="text-[10px] text-[#6e767d]">
            Rationale
            <textarea value={editRationale} onChange={(e) => setEditRationale(e.target.value)} rows={2} className={fieldClass + " mt-0.5"} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={smallButtonClass} disabled={saving || isPending}>
              {saving ? "Saving\u2026" : "Save"}
            </button>
            <button type="button" className={smallButtonClass} onClick={() => {
              setEditing(false);
              setEditDomain(obs.domain ?? "");
              setEditObservation(obs.observation);
              setEditRationale(obs.rationale ?? "");
              setError(null);
            }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-xs text-[#a4abb2] whitespace-pre-wrap">{obs.observation}</p>
          {obs.rationale && <p className="text-[10px] text-[#6e767d] italic">{obs.rationale}</p>}
          {obs.uncertainty && <p className="text-[10px] text-[#4b5158]">Uncertainty: {obs.uncertainty}</p>}
          {obs.observation !== obs.originalObservation && (
            <Collapsible label="Show original">
              <p className="text-[10px] text-[#4b5158] italic whitespace-pre-wrap">{obs.originalObservation}</p>
            </Collapsible>
          )}
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={smallButtonClass} onClick={() => setEditing(true)} disabled={saving || isPending}>
              Edit
            </button>
            {obs.status !== "accepted" && (
              <button type="button" className={smallButtonClass + " text-[#8fc9a0]"} onClick={() => void handleStatusChange("accepted")} disabled={saving || isPending}>
                Accept
              </button>
            )}
            {obs.status !== "rejected" && (
              <button type="button" className={smallButtonClass + " text-[#cf7b6b]"} onClick={() => void handleStatusChange("rejected")} disabled={saving || isPending}>
                Reject
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
