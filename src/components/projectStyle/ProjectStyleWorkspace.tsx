"use client";

// ---------------------------------------------------------------------------
// ProjectStyleWorkspace.tsx — STYLE.1.A
//
// First Project Style workspace: Direction Brief, the two Style Bible
// pillars (World & Design Language, Visual Treatment) with sparse general/
// negative-constraints fields and optional specialized sections, atomic
// rules, an exact compiled preview (computed client-side with the same
// pure compiler used server-side — no round trip needed for the preview),
// and Versions & Publish.
//
// Every mutation goes through the Server Actions in
// src/actions/projectStyle.ts, each carrying `expectedRevision` for
// optimistic concurrency. `revision` here is always the exact value the
// server last confirmed — updated from every action's return value, never
// assumed.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import Collapsible from "@/components/Collapsible";
import {
  saveDraftFieldsAction,
  addSectionAction,
  updateSectionAction,
  deleteSectionAction,
  reorderSectionAction,
  addRuleAction,
  updateRuleAction,
  toggleRuleStatusAction,
  deleteRuleAction,
  reorderRuleAction,
  openDraftFromActiveVersionAction,
  publishStyleAction,
  type WorkingDraftView,
  type ActiveVersionView,
} from "@/actions/projectStyle";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import type {
  StyleSnapshot,
  StylePillar,
  StyleRuleStrength,
  StyleRuleStatus,
} from "@/lib/projectStyle/styleSnapshot";

type SectionRow = { id: number; pillar: StylePillar; heading: string; content: string; orderIndex: number };
type RuleRow = {
  id: number;
  instruction: string;
  pillar: StylePillar | null;
  section: string | null;
  category: string | null;
  strength: StyleRuleStrength | null;
  applicability: string | null;
  provenanceNotes: string | null;
  status: StyleRuleStatus;
  orderIndex: number;
};

/** Codex retake 2 (P1) — every render and every mutation of `sections`/`rules` state goes through this so the local array order always matches `orderIndex`, exactly like the server-side compiler's own `.sort((a,b) => a.orderIndex - b.orderIndex)`. Never mutates the input array. */
function sortByOrderIndex<T extends { orderIndex: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
}

type Props = {
  projectId: number;
  initialDraft: WorkingDraftView | null;
  initialVersions: ActiveVersionView;
};

function StateBadge({ tone, children }: { tone: "muted" | "warn" | "info" | "ok" | "error"; children: React.ReactNode }) {
  const toneClass = {
    muted: "border-[#2c3035] text-[#6e767d]",
    warn: "border-[#4a3a1f] text-[#c9a24b] bg-[#1f1a10]",
    info: "border-[#243449] text-[#5b93d6] bg-[#101a26]",
    ok: "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]",
    error: "border-[#3d2323] text-[#cf7b6b] bg-[#1a1212]",
  }[tone];
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function SectionsList({
  pillar,
  sections,
  disabled,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: {
  pillar: StylePillar;
  /** Caller-sorted by orderIndex — this component renders and indexes (idx for Up/Down disabling) the array exactly as given, never re-sorts it itself. */
  sections: SectionRow[];
  disabled: boolean;
  onAdd: (pillar: StylePillar, heading: string, content: string) => Promise<boolean>;
  onUpdate: (sectionId: number, heading: string, content: string) => Promise<boolean>;
  onDelete: (sectionId: number) => Promise<void>;
  onReorder: (sectionId: number, direction: "up" | "down") => Promise<void>;
}) {
  const [newHeading, setNewHeading] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editHeading, setEditHeading] = useState("");
  const [editContent, setEditContent] = useState("");

  const startEdit = (s: SectionRow) => {
    setEditingId(s.id);
    setEditHeading(s.heading);
    setEditContent(s.content);
  };

  return (
    <Collapsible label={`Add details (${sections.length})`} defaultOpen={sections.length > 0}>
      <div className="flex flex-col gap-2">
        {sections.map((s, idx) => (
          <div key={s.id} className="rounded border border-[#2c3035] p-2 flex flex-col gap-1.5">
            {editingId === s.id ? (
              <>
                <input value={editHeading} onChange={(e) => setEditHeading(e.target.value)} className={smallInputClass} placeholder="Heading" />
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={2} className={fieldClass} placeholder="Content" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={smallButtonClass}
                    disabled={disabled}
                    onClick={async () => {
                      // Codex retake 2 (P1) — only leave edit mode on a real
                      // success; a stale/invalid/failed update keeps the
                      // editor open with the user's typed text intact so
                      // nothing is silently lost.
                      const ok = await onUpdate(s.id, editHeading, editContent);
                      if (ok) setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                  <button type="button" className={smallButtonClass} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#a4abb2]">{s.heading}</span>
                  <div className="flex gap-1">
                    <button type="button" className={smallButtonClass} disabled={disabled || idx === 0} onClick={() => onReorder(s.id, "up")}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className={smallButtonClass}
                      disabled={disabled || idx === sections.length - 1}
                      onClick={() => onReorder(s.id, "down")}
                    >
                      ↓
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => onDelete(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#6e767d] whitespace-pre-wrap">{s.content}</p>
              </>
            )}
          </div>
        ))}

        <div className="rounded border border-dashed border-[#2c3035] p-2 flex flex-col gap-1.5">
          <input
            value={newHeading}
            onChange={(e) => setNewHeading(e.target.value)}
            className={smallInputClass}
            placeholder="New section heading (e.g. Costume language)"
            disabled={disabled}
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={2}
            className={fieldClass}
            placeholder="Content"
            disabled={disabled}
          />
          <button
            type="button"
            className={smallButtonClass}
            disabled={disabled || !newHeading.trim() || !newContent.trim()}
            onClick={async () => {
              // Codex retake 2 (P1) — only clear the draft fields on a real
              // success; a stale/invalid/failed add keeps the typed
              // heading/content so the user can retry without retyping.
              const ok = await onAdd(pillar, newHeading, newContent);
              if (ok) {
                setNewHeading("");
                setNewContent("");
              }
            }}
          >
            Add section
          </button>
        </div>
      </div>
    </Collapsible>
  );
}

function PillarPanel({
  title,
  generalDirection,
  negativeConstraints,
  onGeneralChange,
  onNegativeChange,
  sections,
  pillar,
  disabled,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onReorderSection,
}: {
  title: string;
  generalDirection: string;
  negativeConstraints: string;
  onGeneralChange: (v: string) => void;
  onNegativeChange: (v: string) => void;
  sections: SectionRow[];
  pillar: StylePillar;
  disabled: boolean;
  onAddSection: (pillar: StylePillar, heading: string, content: string) => Promise<boolean>;
  onUpdateSection: (sectionId: number, heading: string, content: string) => Promise<boolean>;
  onDeleteSection: (sectionId: number) => Promise<void>;
  onReorderSection: (sectionId: number, direction: "up" | "down") => Promise<void>;
}) {
  return (
    <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">{title}</h3>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#6e767d]">General direction</label>
        <textarea
          value={generalDirection}
          onChange={(e) => onGeneralChange(e.target.value)}
          rows={3}
          className={fieldClass}
          disabled={disabled}
          placeholder="A sentence or two is enough."
        />
      </div>
      <Collapsible label="Negative constraints">
        <textarea
          value={negativeConstraints}
          onChange={(e) => onNegativeChange(e.target.value)}
          rows={2}
          className={fieldClass}
          disabled={disabled}
          placeholder="What to avoid for this pillar."
        />
      </Collapsible>
      <SectionsList
        pillar={pillar}
        sections={sections}
        disabled={disabled}
        onAdd={onAddSection}
        onUpdate={onUpdateSection}
        onDelete={onDeleteSection}
        onReorder={onReorderSection}
      />
    </div>
  );
}

const STRENGTH_OPTIONS: StyleRuleStrength[] = ["Required", "Preferred", "Avoid"];

function RulesPanel({
  rules,
  disabled,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
  onReorder,
}: {
  /** Caller-sorted by orderIndex — this component renders and indexes (idx for Up/Down disabling) the array exactly as given, never re-sorts it itself. */
  rules: RuleRow[];
  disabled: boolean;
  onAdd: (fields: Omit<RuleRow, "id" | "status" | "orderIndex">) => Promise<boolean>;
  onUpdate: (ruleId: number, fields: Omit<RuleRow, "id" | "status" | "orderIndex">) => Promise<boolean>;
  onToggle: (ruleId: number) => Promise<void>;
  onDelete: (ruleId: number) => Promise<void>;
  onReorder: (ruleId: number, direction: "up" | "down") => Promise<void>;
}) {
  const emptyForm = { instruction: "", pillar: null as StylePillar | null, section: "", category: "", strength: null as StyleRuleStrength | null, applicability: "", provenanceNotes: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const startEdit = (r: RuleRow) => {
    setEditingId(r.id);
    setEditForm({
      instruction: r.instruction,
      pillar: r.pillar,
      section: r.section ?? "",
      category: r.category ?? "",
      strength: r.strength,
      applicability: r.applicability ?? "",
      provenanceNotes: r.provenanceNotes ?? "",
    });
  };

  return (
    <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Style Rules ({rules.length})</h3>
      <div className="flex flex-col gap-2">
        {rules.map((r, idx) => (
          <div key={r.id} className={`rounded border p-2 flex flex-col gap-1.5 ${r.status === "disabled" ? "border-[#2c3035] opacity-50" : "border-[#2c3035]"}`}>
            {editingId === r.id ? (
              <>
                <textarea
                  value={editForm.instruction}
                  onChange={(e) => setEditForm((p) => ({ ...p, instruction: e.target.value }))}
                  rows={2}
                  className={fieldClass}
                  placeholder="Rule instruction"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={editForm.pillar ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, pillar: (e.target.value || null) as StylePillar | null }))}
                    className={smallInputClass}
                  >
                    <option value="">No pillar</option>
                    <option value="world">World & Design Language</option>
                    <option value="visual">Visual Treatment</option>
                  </select>
                  <select
                    value={editForm.strength ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, strength: (e.target.value || null) as StyleRuleStrength | null }))}
                    className={smallInputClass}
                  >
                    <option value="">No strength</option>
                    {STRENGTH_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input value={editForm.section} onChange={(e) => setEditForm((p) => ({ ...p, section: e.target.value }))} className={smallInputClass} placeholder="Section (optional)" />
                  <input value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} className={smallInputClass} placeholder="Category (optional)" />
                  <input value={editForm.applicability} onChange={(e) => setEditForm((p) => ({ ...p, applicability: e.target.value }))} className={smallInputClass} placeholder="Applies to (optional)" />
                  <input value={editForm.provenanceNotes} onChange={(e) => setEditForm((p) => ({ ...p, provenanceNotes: e.target.value }))} className={smallInputClass} placeholder="Source / notes (optional)" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={smallButtonClass}
                    disabled={disabled || !editForm.instruction.trim()}
                    onClick={async () => {
                      // Codex retake 2 (P1) — only leave edit mode on a real
                      // success; a stale/invalid/failed update keeps the
                      // editor open with the user's typed fields intact.
                      const ok = await onUpdate(r.id, editForm);
                      if (ok) setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                  <button type="button" className={smallButtonClass} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-[#a4abb2] flex-1">{r.instruction}</p>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" className={smallButtonClass} disabled={disabled || idx === 0} onClick={() => onReorder(r.id, "up")}>
                      ↑
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled || idx === rules.length - 1} onClick={() => onReorder(r.id, "down")}>
                      ↓
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => startEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => onToggle(r.id)}>
                      {r.status === "approved" ? "Disable" : "Enable"}
                    </button>
                    <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => onDelete(r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[9px] text-[#4b5158]">
                  {r.pillar && <span className="border border-[#2c3035] rounded px-1">{r.pillar === "world" ? "World" : "Visual"}</span>}
                  {r.strength && <span className="border border-[#2c3035] rounded px-1">{r.strength}</span>}
                  {r.category && <span className="border border-[#2c3035] rounded px-1">{r.category}</span>}
                  {r.status === "disabled" && <span className="border border-[#4a3a1f] text-[#c9a24b] rounded px-1">disabled — excluded from compiled preview</span>}
                </div>
              </>
            )}
          </div>
        ))}

        <Collapsible label="Add rule" defaultOpen={rules.length === 0}>
          <div className="rounded border border-dashed border-[#2c3035] p-2 flex flex-col gap-1.5">
            <textarea
              value={form.instruction}
              onChange={(e) => setForm((p) => ({ ...p, instruction: e.target.value }))}
              rows={2}
              className={fieldClass}
              placeholder="Instruction (required)"
              disabled={disabled}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={form.pillar ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, pillar: (e.target.value || null) as StylePillar | null }))}
                className={smallInputClass}
                disabled={disabled}
              >
                <option value="">No pillar</option>
                <option value="world">World & Design Language</option>
                <option value="visual">Visual Treatment</option>
              </select>
              <select
                value={form.strength ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, strength: (e.target.value || null) as StyleRuleStrength | null }))}
                className={smallInputClass}
                disabled={disabled}
              >
                <option value="">No strength</option>
                {STRENGTH_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))} className={smallInputClass} placeholder="Section (optional)" disabled={disabled} />
              <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={smallInputClass} placeholder="Category (optional)" disabled={disabled} />
              <input
                value={form.applicability}
                onChange={(e) => setForm((p) => ({ ...p, applicability: e.target.value }))}
                className={smallInputClass}
                placeholder="Applies to (optional)"
                disabled={disabled}
              />
              <input
                value={form.provenanceNotes}
                onChange={(e) => setForm((p) => ({ ...p, provenanceNotes: e.target.value }))}
                className={smallInputClass}
                placeholder="Source / notes (optional)"
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              className={smallButtonClass}
              disabled={disabled || !form.instruction.trim()}
              onClick={async () => {
                // Codex retake 2 (P1) — only clear the draft form on a real
                // success; a stale/invalid/failed add keeps the typed
                // fields so the user can retry without retyping.
                const ok = await onAdd(form);
                if (ok) setForm(emptyForm);
              }}
            >
              Add rule
            </button>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

export default function ProjectStyleWorkspace({ projectId, initialDraft, initialVersions }: Props) {
  const [hasDraft, setHasDraft] = useState<boolean>(initialDraft !== null);

  // Codex P1 retake — a Project can have a published active version with NO
  // Working Draft. Previously the top-level fields still initialized to ""
  // and stayed fully editable in that state, so a stray keystroke + Save
  // Draft could create a brand-new, empty/partial draft that silently
  // abandoned the active version's real content instead of going through
  // `Edit Active Style` (which seeds the new draft from it). Fields are now
  // READ-ONLY (and populated from the active version's own content, not
  // blank) whenever a draft doesn't exist but an active version does — the
  // ONLY way to make them editable is `Edit Active Style`, which reloads
  // into a real, seeded draft. A Project with neither a draft nor any
  // published version (never published yet) still starts fully editable —
  // that is the legitimate "author your first draft" path.
  const activeSnapshot: StyleSnapshot | null =
    initialDraft === null && initialVersions.activeVersion
      ? (JSON.parse(initialVersions.activeVersion.contentSnapshot) as StyleSnapshot)
      : null;
  const isReadOnlyActiveView = initialDraft === null && initialVersions.activeVersion !== null;

  const [revision, setRevision] = useState<number | null>(initialDraft?.draft.revision ?? null);
  const [directionBrief, setDirectionBrief] = useState(initialDraft?.draft.directionBrief ?? activeSnapshot?.directionBrief ?? "");
  const [worldGeneral, setWorldGeneral] = useState(initialDraft?.draft.worldGeneralDirection ?? activeSnapshot?.world.generalDirection ?? "");
  const [worldNegative, setWorldNegative] = useState(initialDraft?.draft.worldNegativeConstraints ?? activeSnapshot?.world.negativeConstraints ?? "");
  const [visualGeneral, setVisualGeneral] = useState(initialDraft?.draft.visualGeneralDirection ?? activeSnapshot?.visual.generalDirection ?? "");
  const [visualNegative, setVisualNegative] = useState(initialDraft?.draft.visualNegativeConstraints ?? activeSnapshot?.visual.negativeConstraints ?? "");
  const [sections, setSections] = useState<SectionRow[]>(
    sortByOrderIndex(
      initialDraft
        ? initialDraft.sections.map((s) => ({ id: s.id, pillar: s.pillar as StylePillar, heading: s.heading, content: s.content, orderIndex: s.orderIndex }))
        : activeSnapshot
        ? [
            ...activeSnapshot.world.sections.map((s, i): SectionRow => ({ id: -1000 - i, pillar: "world", heading: s.heading, content: s.content, orderIndex: i })),
            ...activeSnapshot.visual.sections.map((s, i): SectionRow => ({ id: -2000 - i, pillar: "visual", heading: s.heading, content: s.content, orderIndex: i })),
          ]
        : []
    )
  );
  const [rules, setRules] = useState<RuleRow[]>(
    sortByOrderIndex(
      initialDraft
        ? initialDraft.rules.map((r) => ({
            id: r.id,
            instruction: r.instruction,
            pillar: r.pillar as StylePillar | null,
            section: r.section,
            category: r.category,
            strength: r.strength as StyleRuleStrength | null,
            applicability: r.applicability,
            provenanceNotes: r.provenanceNotes,
            status: r.status as StyleRuleStatus,
            orderIndex: r.orderIndex,
          }))
        : activeSnapshot
        ? activeSnapshot.rules.map((r, i) => ({ id: -3000 - i, ...r, orderIndex: i }))
        : []
    )
  );

  // Never mutated client-side — every action that changes version history
  // (Publish Style, Edit Active Style) does a full page reload afterward,
  // so this always stays the current server-fetched state.
  const versions = initialVersions;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishConfirming, setPublishConfirming] = useState(false);
  const controlsDisabled = submitting || isReadOnlyActiveView;

  // ── Client-side compiled preview — same pure compiler as the server,
  //    recomputed on every render from local state, so what the user sees
  //    is exactly what would be published if they clicked Publish now. ────
  const compiledPreview = useMemo(() => {
    const snapshot: StyleSnapshot = {
      directionBrief: directionBrief.trim() || null,
      world: {
        generalDirection: worldGeneral.trim() || null,
        negativeConstraints: worldNegative.trim() || null,
        sections: sections.filter((s) => s.pillar === "world").sort((a, b) => a.orderIndex - b.orderIndex).map((s) => ({ heading: s.heading, content: s.content })),
      },
      visual: {
        generalDirection: visualGeneral.trim() || null,
        negativeConstraints: visualNegative.trim() || null,
        sections: sections.filter((s) => s.pillar === "visual").sort((a, b) => a.orderIndex - b.orderIndex).map((s) => ({ heading: s.heading, content: s.content })),
      },
      rules: rules
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((r) => ({
          instruction: r.instruction,
          pillar: r.pillar,
          section: r.section,
          category: r.category,
          strength: r.strength,
          applicability: r.applicability,
          provenanceNotes: r.provenanceNotes,
          status: r.status,
        })),
    };
    return compileStyleSnapshot(snapshot);
  }, [directionBrief, worldGeneral, worldNegative, visualGeneral, visualNegative, sections, rules]);

  const handleSaveDraft = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const result = await saveDraftFieldsAction({
      projectId,
      expectedRevision: revision,
      directionBrief,
      worldGeneralDirection: worldGeneral,
      worldNegativeConstraints: worldNegative,
      visualGeneralDirection: visualGeneral,
      visualNegativeConstraints: visualNegative,
    });
    setSubmitting(false);
    if (result.ok) {
      setRevision(result.revision);
      setHasDraft(true);
    } else {
      setError(result.error);
    }
  }, [projectId, revision, directionBrief, worldGeneral, worldNegative, visualGeneral, visualNegative]);

  const handleAddSection = useCallback(
    async (pillar: StylePillar, heading: string, content: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      const result = await addSectionAction({ projectId, expectedRevision: revision, pillar, heading, content });
      setSubmitting(false);
      if (result.ok) {
        // Codex P1 retake — splice the real DB row (with its real id)
        // straight into local state instead of `window.location.reload()`,
        // which previously discarded any unsaved edit sitting in the
        // Direction Brief / pillar fields at that moment.
        setRevision(result.revision);
        setHasDraft(true);
        setSections((prev) => sortByOrderIndex([...prev, result.section]));
        return true;
      }
      setError(result.error);
      return false;
    },
    [projectId, revision]
  );

  const handleUpdateSection = useCallback(
    async (sectionId: number, heading: string, content: string): Promise<boolean> => {
      if (revision === null) return false;
      setSubmitting(true);
      setError(null);
      const result = await updateSectionAction({ projectId, sectionId, expectedRevision: revision, heading, content });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, heading: heading.trim(), content: content.trim() } : s)));
        return true;
      }
      setError(result.error);
      return false;
    },
    [projectId, revision]
  );

  const handleDeleteSection = useCallback(
    async (sectionId: number) => {
      if (revision === null) return;
      setSubmitting(true);
      setError(null);
      const result = await deleteSectionAction({ projectId, sectionId, expectedRevision: revision });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
      } else {
        setError(result.error);
      }
    },
    [projectId, revision]
  );

  const handleReorderSection = useCallback(
    async (sectionId: number, direction: "up" | "down") => {
      if (revision === null) return;
      setSubmitting(true);
      setError(null);
      const result = await reorderSectionAction({ projectId, sectionId, expectedRevision: revision, direction });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        // Codex retake 2 (P1) — patch orderIndex for the swapped pair AND
        // re-sort the local array by orderIndex. Patching orderIndex alone
        // (as the first retake did) left the JS array order unchanged, so
        // the moved item never visually moved, the Up/Down `disabled`
        // booleans (computed from stale `idx`) stayed wrong, and the
        // compiled preview (which DOES sort by orderIndex) could show a
        // different order than the editor.
        setSections((prev) =>
          sortByOrderIndex(
            prev.map((s) => {
              const swap = result.swapped.find((sw) => sw.id === s.id);
              return swap ? { ...s, orderIndex: swap.orderIndex } : s;
            })
          )
        );
      } else {
        setError(result.error);
      }
    },
    [projectId, revision]
  );

  const handleAddRule = useCallback(
    async (fields: Omit<RuleRow, "id" | "status" | "orderIndex">): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      const result = await addRuleAction({
        projectId,
        expectedRevision: revision,
        instruction: fields.instruction,
        pillar: fields.pillar,
        section: fields.section || null,
        category: fields.category || null,
        strength: fields.strength,
        applicability: fields.applicability || null,
        provenanceNotes: fields.provenanceNotes || null,
      });
      setSubmitting(false);
      if (result.ok) {
        // Codex P1 retake — splice the real DB row into local state instead
        // of reloading, which previously discarded any unsaved edit in the
        // Direction Brief / pillar fields.
        setRevision(result.revision);
        setHasDraft(true);
        setRules((prev) => sortByOrderIndex([...prev, result.rule]));
        return true;
      }
      setError(result.error);
      return false;
    },
    [projectId, revision]
  );

  const handleUpdateRule = useCallback(
    async (ruleId: number, fields: Omit<RuleRow, "id" | "status" | "orderIndex">): Promise<boolean> => {
      if (revision === null) return false;
      setSubmitting(true);
      setError(null);
      const result = await updateRuleAction({
        projectId,
        ruleId,
        expectedRevision: revision,
        instruction: fields.instruction,
        pillar: fields.pillar,
        section: fields.section || null,
        category: fields.category || null,
        strength: fields.strength,
        applicability: fields.applicability || null,
        provenanceNotes: fields.provenanceNotes || null,
      });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        setRules((prev) =>
          prev.map((r) =>
            r.id === ruleId
              ? {
                  ...r,
                  instruction: fields.instruction.trim(),
                  pillar: fields.pillar,
                  section: fields.section || null,
                  category: fields.category || null,
                  strength: fields.strength,
                  applicability: fields.applicability || null,
                  provenanceNotes: fields.provenanceNotes || null,
                }
              : r
          )
        );
        return true;
      }
      setError(result.error);
      return false;
    },
    [projectId, revision]
  );

  const handleToggleRule = useCallback(
    async (ruleId: number) => {
      if (revision === null) return;
      setSubmitting(true);
      setError(null);
      const result = await toggleRuleStatusAction({ projectId, ruleId, expectedRevision: revision });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, status: r.status === "approved" ? "disabled" : "approved" } : r)));
      } else {
        setError(result.error);
      }
    },
    [projectId, revision]
  );

  const handleDeleteRule = useCallback(
    async (ruleId: number) => {
      if (revision === null) return;
      setSubmitting(true);
      setError(null);
      const result = await deleteRuleAction({ projectId, ruleId, expectedRevision: revision });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      } else {
        setError(result.error);
      }
    },
    [projectId, revision]
  );

  const handleReorderRule = useCallback(
    async (ruleId: number, direction: "up" | "down") => {
      if (revision === null) return;
      setSubmitting(true);
      setError(null);
      const result = await reorderRuleAction({ projectId, ruleId, expectedRevision: revision, direction });
      setSubmitting(false);
      if (result.ok) {
        setRevision(result.revision);
        // Codex retake 2 (P1) — patch orderIndex for the swapped pair AND
        // re-sort locally by orderIndex (see handleReorderSection's comment
        // for why patching orderIndex alone left the visual order wrong).
        setRules((prev) =>
          sortByOrderIndex(
            prev.map((r) => {
              const swap = result.swapped.find((sw) => sw.id === r.id);
              return swap ? { ...r, orderIndex: swap.orderIndex } : r;
            })
          )
        );
      } else {
        setError(result.error);
      }
    },
    [projectId, revision]
  );

  const handleEditActive = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const result = await openDraftFromActiveVersionAction(projectId);
    setSubmitting(false);
    if (result.ok) {
      window.location.reload();
    } else {
      setError(result.error);
    }
  }, [projectId]);

  const handlePublish = useCallback(async () => {
    if (revision === null) return;
    setSubmitting(true);
    setError(null);
    // Codex P1 retake — send the exact live field values the compiled
    // preview was computed from, so the published version can never diverge
    // from what the preview showed, regardless of whether Save Draft was
    // clicked first.
    const result = await publishStyleAction(projectId, revision, {
      directionBrief,
      worldGeneralDirection: worldGeneral,
      worldNegativeConstraints: worldNegative,
      visualGeneralDirection: visualGeneral,
      visualNegativeConstraints: visualNegative,
    });
    setSubmitting(false);
    setPublishConfirming(false);
    if (result.ok) {
      window.location.reload();
    } else {
      setError(result.error);
    }
  }, [projectId, revision, directionBrief, worldGeneral, worldNegative, visualGeneral, visualNegative]);

  const stateLabel = hasDraft ? "Working Draft" : versions.activeVersion ? `Active v${versions.activeVersion.versionNumber}` : "No published style";
  const stateTone: "muted" | "info" | "ok" = hasDraft ? "info" : versions.activeVersion ? "ok" : "muted";

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{error}</p>}

      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Direction Brief</h3>
          <div className="flex items-center gap-2">
            {isReadOnlyActiveView && <StateBadge tone="warn">Read-only — click Edit Active Style to change</StateBadge>}
            <StateBadge tone={stateTone}>{stateLabel}</StateBadge>
          </div>
        </div>
        <textarea
          value={directionBrief}
          onChange={(e) => setDirectionBrief(e.target.value)}
          rows={3}
          className={fieldClass}
          disabled={controlsDisabled}
          placeholder="One or a few sentences describing the overall direction — that alone is a valid Style."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PillarPanel
          title="World & Design Language"
          generalDirection={worldGeneral}
          negativeConstraints={worldNegative}
          onGeneralChange={setWorldGeneral}
          onNegativeChange={setWorldNegative}
          sections={sections.filter((s) => s.pillar === "world")}
          pillar="world"
          disabled={controlsDisabled}
          onAddSection={handleAddSection}
          onUpdateSection={handleUpdateSection}
          onDeleteSection={handleDeleteSection}
          onReorderSection={handleReorderSection}
        />
        <PillarPanel
          title="Visual Treatment"
          generalDirection={visualGeneral}
          negativeConstraints={visualNegative}
          onGeneralChange={setVisualGeneral}
          onNegativeChange={setVisualNegative}
          sections={sections.filter((s) => s.pillar === "visual")}
          pillar="visual"
          disabled={controlsDisabled}
          onAddSection={handleAddSection}
          onUpdateSection={handleUpdateSection}
          onDeleteSection={handleDeleteSection}
          onReorderSection={handleReorderSection}
        />
      </div>

      <RulesPanel
        rules={rules}
        disabled={controlsDisabled}
        onAdd={handleAddRule}
        onUpdate={handleUpdateRule}
        onToggle={handleToggleRule}
        onDelete={handleDeleteRule}
        onReorder={handleReorderRule}
      />

      {!isReadOnlyActiveView && (
        <div className="flex gap-2">
          <button type="button" className={buttonClass} disabled={submitting} onClick={handleSaveDraft}>
            {submitting ? "Saving…" : "Save Draft"}
          </button>
        </div>
      )}

      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Compiled preview</h3>
        {compiledPreview ? (
          <pre className="text-xs text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-3">{compiledPreview}</pre>
        ) : (
          <p className="text-xs text-[#6e767d]">Empty — nothing would be compiled yet.</p>
        )}
      </div>

      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Versions & Publish</h3>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6e767d]">Status:</span>
          <StateBadge tone={stateTone}>{stateLabel}</StateBadge>
        </div>

        <div className="flex gap-2">
          {!hasDraft && versions.activeVersion && (
            <button type="button" className={buttonClass} disabled={submitting} onClick={handleEditActive}>
              Edit Active Style
            </button>
          )}
          {hasDraft &&
            (publishConfirming ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#c9a24b]">
                  Publish v{(versions.history[0]?.versionNumber ?? 0) + 1}? This becomes the new active Style immediately.
                </span>
                <button type="button" className={buttonClass} disabled={submitting} onClick={handlePublish}>
                  Confirm Publish
                </button>
                <button type="button" className={smallButtonClass} onClick={() => setPublishConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className={buttonClass} disabled={submitting} onClick={() => setPublishConfirming(true)}>
                Publish Style
              </button>
            ))}
        </div>

        {versions.history.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-[#232629] pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">History ({versions.history.length})</p>
            {versions.history.map((v) => (
              <div
                key={v.id}
                className={`rounded border px-3 py-2 text-xs flex flex-col gap-2 ${
                  versions.pointer?.activeVersionId === v.id ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]" : "border-[#2c3035] text-[#a4abb2]"
                }`}
              >
                <div>
                  <span className="font-mono">v{v.versionNumber}</span>
                  <span className="text-[#6e767d]"> — published {v.publishedAt}</span>
                  {versions.pointer?.activeVersionId === v.id ? (
                    <span className="ml-2 text-[#5b93d6]">active</span>
                  ) : (
                    <span className="ml-2 text-[#6e767d]">previous</span>
                  )}
                </div>
                {/* Codex P2 retake — the compiled text of every version was
                    already loaded (ProjectStyleVersion.compiledText) but
                    never rendered; History was version+date only, with no
                    way to inspect what was actually published. */}
                <Collapsible label="View compiled text">
                  <pre className="text-[10px] text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2">
                    {v.compiledText || "(empty)"}
                  </pre>
                </Collapsible>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
