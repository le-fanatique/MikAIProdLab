"use client";

// ---------------------------------------------------------------------------
// SequenceStylePanel.tsx — STYLE.1.D.UI
//
// UI-only surface over the merged STYLE.1.D.CORE contract:
//   no override -> current active Project Style, inherited dynamically
//   override -> complete Sequence-local replacement
//
// This component never re-implements resolution, ownership, revision or
// compilation logic — every read goes through `getSequenceStyleState` and
// every mutation through `customizeSequenceStyleAction`,
// `updateSequenceStyleOverrideAction` or `resetSequenceStyleOverrideAction`
// (src/actions/sequenceStyle.ts). The override editor works on one local,
// purely client-side `StyleSnapshot` built from `EditState` below and
// compiled with the existing `compileStyleSnapshot` — no second compiler.
//
// State-machine summary:
//   - `result` holds the last canonical `getSequenceStyleState` read. A
//     failed refresh after a mutation NEVER overwrites a previously good
//     `result` (see `tryRefresh`) — the panel keeps showing the last known
//     content plus a distinct "saved, pending sync" banner instead.
//   - `editing`/`editState` exist only while `resolved.mode === "override"`.
//     A failed Save/Reset never touches `editState` — every unsaved field
//     and ordering survives byte-for-byte until an explicit
//     "Reload saved override" or a successful Save/Cancel.
//   - `busy` gates every mutation button so a repeated click/submit while a
//     request is in flight can never fire a second one.
// ---------------------------------------------------------------------------

import { useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  getSequenceStyleState,
  customizeSequenceStyleAction,
  updateSequenceStyleOverrideAction,
  resetSequenceStyleOverrideAction,
  type GetSequenceStyleStateResult,
} from "@/actions/sequenceStyle";
import type { ResolvedSequenceStyle } from "@/lib/projectStyle/resolveSequenceStyle";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import type {
  StyleSnapshot,
  StylePillarSnapshot,
  StylePillar,
  StyleRuleStrength,
  StyleRuleStatus,
} from "@/lib/projectStyle/styleSnapshot";

type Props = {
  projectId: number;
  sequenceId: number;
  initialResult: GetSequenceStyleStateResult;
};

// ── Local editor state ──────────────────────────────────────────────────
// A purely local, unsaved working copy of one StyleSnapshot. `key` fields
// exist only for stable React identity/reorder — they are never sent to the
// server and never derived from any DB id.

type EditSection = { key: string; heading: string; content: string };
type EditRule = {
  key: string;
  instruction: string;
  pillar: StylePillar | null;
  section: string;
  category: string;
  strength: StyleRuleStrength | null;
  applicability: string;
  provenanceNotes: string;
  status: StyleRuleStatus;
};
type EditState = {
  directionBrief: string;
  worldGeneral: string;
  worldNegative: string;
  worldSections: EditSection[];
  visualGeneral: string;
  visualNegative: string;
  visualSections: EditSection[];
  rules: EditRule[];
};

let localKeyCounter = 0;
/** Stable React keys only — never persisted, never sent to a Server Action. */
function makeLocalKey(): string {
  localKeyCounter += 1;
  return `local-${localKeyCounter}`;
}

function snapshotToEditState(snapshot: StyleSnapshot): EditState {
  return {
    directionBrief: snapshot.directionBrief ?? "",
    worldGeneral: snapshot.world.generalDirection ?? "",
    worldNegative: snapshot.world.negativeConstraints ?? "",
    worldSections: snapshot.world.sections.map((s) => ({ key: makeLocalKey(), heading: s.heading, content: s.content })),
    visualGeneral: snapshot.visual.generalDirection ?? "",
    visualNegative: snapshot.visual.negativeConstraints ?? "",
    visualSections: snapshot.visual.sections.map((s) => ({ key: makeLocalKey(), heading: s.heading, content: s.content })),
    rules: snapshot.rules.map((r) => ({
      key: makeLocalKey(),
      instruction: r.instruction,
      pillar: r.pillar,
      section: r.section ?? "",
      category: r.category ?? "",
      strength: r.strength,
      applicability: r.applicability ?? "",
      provenanceNotes: r.provenanceNotes ?? "",
      status: r.status,
    })),
  };
}

/** The exact snapshot Save sends and the live compiled preview derives from — same shape, same trim rules as compileStyleSnapshot's own emptiness handling. */
function editStateToSnapshot(state: EditState): StyleSnapshot {
  return {
    directionBrief: state.directionBrief.trim() || null,
    world: {
      generalDirection: state.worldGeneral.trim() || null,
      negativeConstraints: state.worldNegative.trim() || null,
      sections: state.worldSections.map((s) => ({ heading: s.heading.trim(), content: s.content.trim() })),
    },
    visual: {
      generalDirection: state.visualGeneral.trim() || null,
      negativeConstraints: state.visualNegative.trim() || null,
      sections: state.visualSections.map((s) => ({ heading: s.heading.trim(), content: s.content.trim() })),
    },
    rules: state.rules.map((r) => ({
      instruction: r.instruction.trim(),
      pillar: r.pillar,
      section: r.section.trim() || null,
      category: r.category.trim() || null,
      strength: r.strength,
      applicability: r.applicability.trim() || null,
      provenanceNotes: r.provenanceNotes.trim() || null,
      status: r.status,
    })),
  };
}

// ── Shared visual primitives (this panel only — not exported) ──────────

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] w-full";
const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start";
const smallButtonClass =
  "rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const iconButtonClass =
  "rounded border border-[#2c3035] w-7 h-7 shrink-0 flex items-center justify-center text-xs text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const linkClass =
  "text-xs text-[#5b93d6] hover:text-[#8fbbe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors whitespace-nowrap";

function PanelBadge({ tone, children }: { tone: "muted" | "info" | "ok"; children: ReactNode }) {
  const toneClass = {
    muted: "border-[#2c3035] text-[#6e767d]",
    info: "border-[#243449] text-[#5b93d6] bg-[#101a26]",
    ok: "border-[#2c6142] text-[#8fc9a0] bg-[#12241a]",
  }[tone];
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

/** A single disclosure with correct `aria-expanded`/`aria-controls` wiring — used for "Compiled Style" wherever it appears (read-only inspection and the live editor preview). */
function CompiledDisclosure({ compiledText }: { compiledText: string }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[#6e767d] hover:text-[#a4abb2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b93d6] transition-colors"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          ›
        </span>
        Compiled Style
      </button>
      {open && (
        <div id={contentId} className="mt-2">
          {compiledText ? (
            <pre className="text-[10px] text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-3 overflow-x-auto">
              {compiledText}
            </pre>
          ) : (
            <p className="text-xs text-[#6e767d]">Empty — nothing would be compiled.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Read-only inspection ────────────────────────────────────────────────

function PillarInspection({ title, pillar }: { title: string; pillar: StylePillarSnapshot }) {
  const hasGeneral = Boolean(pillar.generalDirection?.trim());
  const hasNegative = Boolean(pillar.negativeConstraints?.trim());
  const hasSections = pillar.sections.length > 0;
  if (!hasGeneral && !hasNegative && !hasSections) return null;

  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d] mb-1">{title}</h4>
      {hasGeneral && <p className="text-xs text-[#a4abb2] whitespace-pre-wrap mb-1.5">{pillar.generalDirection}</p>}
      {hasNegative && (
        <p className="text-xs text-[#c9a24b] whitespace-pre-wrap mb-1.5">
          <span className="text-[#6e767d]">Avoid: </span>
          {pillar.negativeConstraints}
        </p>
      )}
      {hasSections && (
        <div className="flex flex-col gap-1.5">
          {pillar.sections.map((s, i) => (
            <div key={i} className="rounded border border-[#2c3035] p-2">
              <p className="text-xs font-medium text-[#a4abb2]">{s.heading || <span className="italic text-[#4b5158]">(untitled section)</span>}</p>
              {s.content && <p className="text-xs text-[#6e767d] whitespace-pre-wrap mt-0.5">{s.content}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isSnapshotCompletelyEmpty(snapshot: StyleSnapshot): boolean {
  return (
    !snapshot.directionBrief?.trim() &&
    !snapshot.world.generalDirection?.trim() &&
    !snapshot.world.negativeConstraints?.trim() &&
    snapshot.world.sections.length === 0 &&
    !snapshot.visual.generalDirection?.trim() &&
    !snapshot.visual.negativeConstraints?.trim() &&
    snapshot.visual.sections.length === 0 &&
    snapshot.rules.length === 0
  );
}

function StyleInspection({ snapshot, compiledText }: { snapshot: StyleSnapshot; compiledText: string }) {
  if (isSnapshotCompletelyEmpty(snapshot)) {
    return <p className="text-xs text-[#6e767d] italic">This Style has no content yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {snapshot.directionBrief?.trim() && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d] mb-1">Direction Brief</h4>
          <p className="text-xs text-[#a4abb2] whitespace-pre-wrap">{snapshot.directionBrief}</p>
        </div>
      )}

      <PillarInspection title="World Building" pillar={snapshot.world} />
      <PillarInspection title="Visual Identity" pillar={snapshot.visual} />

      {snapshot.rules.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#6e767d] mb-1">Style Rules ({snapshot.rules.length})</h4>
          <div className="flex flex-col gap-1.5">
            {snapshot.rules.map((r, i) => (
              <div
                key={i}
                className={`rounded border p-2 flex flex-col gap-1 ${r.status === "disabled" ? "border-[#2c3035] opacity-50" : "border-[#2c3035]"}`}
              >
                <p className="text-xs text-[#a4abb2]">
                  {r.instruction.trim() || <span className="italic text-[#4b5158]">(empty instruction)</span>}
                </p>
                <div className="flex flex-wrap gap-1 text-[9px] text-[#4b5158]">
                  {r.pillar && <span className="border border-[#2c3035] rounded px-1">{r.pillar === "world" ? "World Building" : "Visual Identity"}</span>}
                  {r.strength && <span className="border border-[#2c3035] rounded px-1">{r.strength}</span>}
                  {r.section && <span className="border border-[#2c3035] rounded px-1">Section: {r.section}</span>}
                  {r.category && <span className="border border-[#2c3035] rounded px-1">{r.category}</span>}
                  {r.applicability && <span className="border border-[#2c3035] rounded px-1">Applies: {r.applicability}</span>}
                  {r.provenanceNotes && <span className="border border-[#2c3035] rounded px-1">Notes: {r.provenanceNotes}</span>}
                  <span
                    className={`border rounded px-1 ${
                      r.status === "disabled" ? "border-[#4a3a1f] text-[#c9a24b]" : "border-[#2c6142] text-[#8fc9a0]"
                    }`}
                  >
                    {r.status === "disabled" ? "Disabled" : "Approved"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CompiledDisclosure compiledText={compiledText} />
    </div>
  );
}

// ── Local editor ────────────────────────────────────────────────────────

function SectionsEditor({
  label,
  sections,
  onChange,
  disabled,
}: {
  label: string;
  sections: EditSection[];
  onChange: (next: EditSection[]) => void;
  disabled: boolean;
}) {
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const update = (key: string, patch: Partial<EditSection>) => onChange(sections.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: string) => onChange(sections.filter((s) => s.key !== key));
  const add = () => onChange([...sections, { key: makeLocalKey(), heading: "", content: "" }]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#6e767d]">
          {label} sections ({sections.length})
        </span>
        <button type="button" onClick={add} disabled={disabled} className={smallButtonClass}>
          + Add section
        </button>
      </div>
      {sections.map((s, i) => (
        <div key={s.key} className="rounded border border-[#2c3035] p-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-[#6e767d]" htmlFor={`section-heading-${s.key}`}>
            Heading
          </label>
          <input
            id={`section-heading-${s.key}`}
            value={s.heading}
            onChange={(e) => update(s.key, { heading: e.target.value })}
            disabled={disabled}
            className={smallInputClass}
          />
          <label className="text-[10px] text-[#6e767d]" htmlFor={`section-content-${s.key}`}>
            Content
          </label>
          <textarea
            id={`section-content-${s.key}`}
            value={s.content}
            onChange={(e) => update(s.key, { content: e.target.value })}
            rows={2}
            disabled={disabled}
            className={fieldClass}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label={`Move ${label} section ${i + 1} up`}
              title="Move up"
              onClick={() => move(i, -1)}
              disabled={disabled || i === 0}
              className={iconButtonClass}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${label} section ${i + 1} down`}
              title="Move down"
              onClick={() => move(i, 1)}
              disabled={disabled || i === sections.length - 1}
              className={iconButtonClass}
            >
              ↓
            </button>
            <button type="button" onClick={() => remove(s.key)} disabled={disabled} className={smallButtonClass}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const STRENGTH_OPTIONS: StyleRuleStrength[] = ["Required", "Preferred", "Avoid"];

function RulesEditor({ rules, onChange, disabled }: { rules: EditRule[]; onChange: (next: EditRule[]) => void; disabled: boolean }) {
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const update = (key: string, patch: Partial<EditRule>) => onChange(rules.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rules.filter((r) => r.key !== key));
  const toggle = (key: string) =>
    onChange(rules.map((r) => (r.key === key ? { ...r, status: r.status === "approved" ? "disabled" : "approved" } : r)));
  const add = () =>
    onChange([
      ...rules,
      {
        key: makeLocalKey(),
        instruction: "",
        pillar: null,
        section: "",
        category: "",
        strength: null,
        applicability: "",
        provenanceNotes: "",
        status: "approved",
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#6e767d]">Style Rules ({rules.length})</span>
        <button type="button" onClick={add} disabled={disabled} className={smallButtonClass}>
          + Add rule
        </button>
      </div>
      {rules.map((r, i) => (
        <div
          key={r.key}
          className={`rounded border p-2 flex flex-col gap-1.5 ${r.status === "disabled" ? "border-[#2c3035] opacity-50" : "border-[#2c3035]"}`}
        >
          <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-instruction-${r.key}`}>
            Instruction
          </label>
          <textarea
            id={`rule-instruction-${r.key}`}
            value={r.instruction}
            onChange={(e) => update(r.key, { instruction: e.target.value })}
            rows={2}
            disabled={disabled}
            className={fieldClass}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-pillar-${r.key}`}>
                Pillar
              </label>
              <select
                id={`rule-pillar-${r.key}`}
                value={r.pillar ?? ""}
                onChange={(e) => update(r.key, { pillar: (e.target.value || null) as StylePillar | null })}
                disabled={disabled}
                className={smallInputClass}
              >
                <option value="">No pillar</option>
                <option value="world">World Building</option>
                <option value="visual">Visual Identity</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-strength-${r.key}`}>
                Strength
              </label>
              <select
                id={`rule-strength-${r.key}`}
                value={r.strength ?? ""}
                onChange={(e) => update(r.key, { strength: (e.target.value || null) as StyleRuleStrength | null })}
                disabled={disabled}
                className={smallInputClass}
              >
                <option value="">No strength</option>
                {STRENGTH_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-section-${r.key}`}>
                Section
              </label>
              <input
                id={`rule-section-${r.key}`}
                value={r.section}
                onChange={(e) => update(r.key, { section: e.target.value })}
                disabled={disabled}
                className={smallInputClass}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-category-${r.key}`}>
                Category
              </label>
              <input
                id={`rule-category-${r.key}`}
                value={r.category}
                onChange={(e) => update(r.key, { category: e.target.value })}
                disabled={disabled}
                className={smallInputClass}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-applicability-${r.key}`}>
                Applicability
              </label>
              <input
                id={`rule-applicability-${r.key}`}
                value={r.applicability}
                onChange={(e) => update(r.key, { applicability: e.target.value })}
                disabled={disabled}
                className={smallInputClass}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[#6e767d]" htmlFor={`rule-provenance-${r.key}`}>
                Provenance notes
              </label>
              <input
                id={`rule-provenance-${r.key}`}
                value={r.provenanceNotes}
                onChange={(e) => update(r.key, { provenanceNotes: e.target.value })}
                disabled={disabled}
                className={smallInputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Move rule ${i + 1} up`}
              title="Move up"
              onClick={() => move(i, -1)}
              disabled={disabled || i === 0}
              className={iconButtonClass}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move rule ${i + 1} down`}
              title="Move down"
              onClick={() => move(i, 1)}
              disabled={disabled || i === rules.length - 1}
              className={iconButtonClass}
            >
              ↓
            </button>
            <button type="button" onClick={() => toggle(r.key)} disabled={disabled} className={smallButtonClass}>
              {r.status === "approved" ? "Disable" : "Enable"}
            </button>
            <button type="button" onClick={() => remove(r.key)} disabled={disabled} className={smallButtonClass}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function StyleOverrideEditor({
  state,
  onChange,
  onSave,
  onCancel,
  locked,
  saving,
}: {
  state: EditState;
  onChange: (next: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Disables every field, add/remove/reorder control and Save — set while a request is in flight OR while pending-sync forbids replaying a mutation (codex_review.md Round 1, P2). */
  locked: boolean;
  /** True only while a request is actually in flight — governs Cancel's own disabled state and the Save button's label. Cancel is intentionally NEVER disabled by `locked` alone: it is non-destructive (discards local edits) and stays available as an escape hatch while pending-sync blocks every mutation. */
  saving: boolean;
}) {
  const compiledPreview = compileStyleSnapshot(editStateToSnapshot(state));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[#6e767d]" htmlFor="seq-style-direction-brief">
          Direction Brief
        </label>
        <textarea
          id="seq-style-direction-brief"
          value={state.directionBrief}
          onChange={(e) => onChange({ ...state, directionBrief: e.target.value })}
          rows={3}
          disabled={locked}
          className={fieldClass}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-[#232629] bg-[#101214] p-3 flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">World Building</h4>
          <label className="text-[10px] text-[#6e767d]" htmlFor="seq-style-world-general">
            General direction
          </label>
          <textarea
            id="seq-style-world-general"
            value={state.worldGeneral}
            onChange={(e) => onChange({ ...state, worldGeneral: e.target.value })}
            rows={2}
            disabled={locked}
            className={fieldClass}
          />
          <label className="text-[10px] text-[#6e767d]" htmlFor="seq-style-world-negative">
            Negative constraints
          </label>
          <textarea
            id="seq-style-world-negative"
            value={state.worldNegative}
            onChange={(e) => onChange({ ...state, worldNegative: e.target.value })}
            rows={2}
            disabled={locked}
            className={fieldClass}
          />
          <SectionsEditor
            label="World Building"
            sections={state.worldSections}
            onChange={(next) => onChange({ ...state, worldSections: next })}
            disabled={locked}
          />
        </div>
        <div className="rounded border border-[#232629] bg-[#101214] p-3 flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">Visual Identity</h4>
          <label className="text-[10px] text-[#6e767d]" htmlFor="seq-style-visual-general">
            General direction
          </label>
          <textarea
            id="seq-style-visual-general"
            value={state.visualGeneral}
            onChange={(e) => onChange({ ...state, visualGeneral: e.target.value })}
            rows={2}
            disabled={locked}
            className={fieldClass}
          />
          <label className="text-[10px] text-[#6e767d]" htmlFor="seq-style-visual-negative">
            Negative constraints
          </label>
          <textarea
            id="seq-style-visual-negative"
            value={state.visualNegative}
            onChange={(e) => onChange({ ...state, visualNegative: e.target.value })}
            rows={2}
            disabled={locked}
            className={fieldClass}
          />
          <SectionsEditor
            label="Visual Identity"
            sections={state.visualSections}
            onChange={(next) => onChange({ ...state, visualSections: next })}
            disabled={locked}
          />
        </div>
      </div>

      <div className="rounded border border-[#232629] bg-[#101214] p-3">
        <RulesEditor rules={state.rules} onChange={(next) => onChange({ ...state, rules: next })} disabled={locked} />
      </div>

      <CompiledDisclosure compiledText={compiledPreview} />

      <div className="flex items-center gap-2">
        <button type="submit" disabled={locked} className={buttonClass}>
          {saving ? "Saving…" : "Save override"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={smallButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────

function summaryFor(resolved: ResolvedSequenceStyle): { tone: "muted" | "info" | "ok"; badge: string; message: string } {
  if (resolved.mode === "none") {
    return { tone: "muted", badge: "No Project Style", message: "This Project has no active published Style." };
  }
  if (resolved.mode === "inherited") {
    return { tone: "info", badge: "Inherited", message: `Inherited from Project Style v${resolved.projectVersionNumber}` };
  }
  return {
    tone: "ok",
    badge: "Customized",
    message: `Sequence override r${resolved.revision}, based on Project Style v${resolved.sourceProjectVersionNumber}`,
  };
}

export default function SequenceStylePanel({ projectId, sequenceId, initialResult }: Props) {
  const [result, setResult] = useState<GetSequenceStyleStateResult>(initialResult);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleInfo, setStaleInfo] = useState<{ error: string; currentRevision: number } | null>(null);
  const [pendingSync, setPendingSync] = useState<null | "customize" | "save" | "reset">(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);

  const openProjectStyleHref = `/projects/${projectId}/style`;
  const locked = busy || pendingSync !== null;

  /**
   * Refreshes canonical state and applies it ONLY on success — a failed
   * refresh after a committed mutation must never clobber the last
   * known-good `result` (STYLE.1.D.UI "pending sync" contract). Retake
   * Round 1 (Codex P1): this never throws — a transport/runtime exception
   * from the read itself is caught and turned into the same sanitized
   * `{ ok: false }` shape a structured CORE failure would return, so every
   * caller can treat "refresh failed" as one case regardless of whether it
   * failed by returning `ok:false` or by rejecting.
   */
  async function tryRefresh(): Promise<GetSequenceStyleStateResult> {
    try {
      const r = await getSequenceStyleState(projectId, sequenceId);
      if (r.ok) setResult(r);
      return r;
    } catch {
      return { ok: false, error: "The latest Project Style state could not be reloaded. Try again." };
    }
  }

  async function handleRetryLoad() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await getSequenceStyleState(projectId, sequenceId);
      setResult(r);
    } catch {
      setResult({ ok: false, error: "The Project Style could not be loaded for this Sequence. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function handleCustomize() {
    if (locked) return;
    setBusy(true);
    setActionError(null);
    setStaleInfo(null);
    try {
      const res = await customizeSequenceStyleAction({ projectId, sequenceId });
      if (!res.ok) {
        // Rejected before any success is known — visible error, nothing to preserve here (no local edit state exists yet).
        setActionError(res.error);
        return;
      }
      // Committed. From here on a refresh failure is NEVER a plain error —
      // it is "saved, pending sync", and Customize must never be replayed.
      const r = await tryRefresh();
      setPendingSync(r.ok ? null : "customize");
    } catch {
      // The action call itself rejected (transport/runtime) — success was
      // never confirmed, so this is "rejected before known success", not
      // pending-sync (see codex_review.md P1).
      setActionError("Customize for Sequence could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleOpenEditor() {
    if (locked || !result.ok || result.state.resolved.mode !== "override") return;
    setEditState(snapshotToEditState(result.state.resolved.snapshot));
    setActionError(null);
    setStaleInfo(null);
    setEditing(true);
  }

  function handleCancelEdit() {
    // Discards local edits — the read-only inspection re-renders from the
    // last canonical `result`, which is exactly "restores the last
    // canonical saved snapshot". Non-destructive, so intentionally NOT
    // gated by `pendingSync` — it is one of the actions still allowed
    // while pending-sync is showing (codex_review.md P2).
    setEditing(false);
    setEditState(null);
    setActionError(null);
    setStaleInfo(null);
  }

  async function handleSave() {
    if (busy || pendingSync || !editState || !result.ok || result.state.resolved.mode !== "override") return;
    setBusy(true);
    setActionError(null);
    setStaleInfo(null);
    const expectedRevision = result.state.resolved.revision;
    const snapshot = editStateToSnapshot(editState);
    try {
      const res = await updateSequenceStyleOverrideAction({ projectId, sequenceId, expectedRevision, snapshot });
      if (!res.ok) {
        // Keep the editor open and every unsaved field/order exactly as typed.
        if (res.currentRevision != null) setStaleInfo({ error: res.error, currentRevision: res.currentRevision });
        else setActionError(res.error);
        return;
      }
      const r = await tryRefresh();
      if (r.ok) {
        setEditing(false);
        setEditState(null);
        setStaleInfo(null);
      } else {
        // Committed, refresh failed — pending-sync, never a plain error,
        // and the editor/editState are left exactly as they are (nothing
        // to lose: this is the content that was just saved).
        setPendingSync("save");
      }
    } catch {
      // The action call itself rejected — success was never confirmed.
      // Visible error, editor stays open, every field/order untouched.
      setActionError("Save override could not be completed. Try again — your edits are preserved.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReloadSavedOverride() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await getSequenceStyleState(projectId, sequenceId);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      setResult(r);
      setStaleInfo(null);
      setActionError(null);
      if (r.state.resolved.mode === "override") {
        setEditState(snapshotToEditState(r.state.resolved.snapshot));
      } else {
        // The override no longer exists (e.g. reset elsewhere) — nothing left to edit.
        setEditing(false);
        setEditState(null);
      }
    } catch {
      setActionError("Reloading the saved override failed. Try again — your edits are preserved.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetConfirmed(e: FormEvent) {
    e.preventDefault();
    if (busy || pendingSync || !result.ok || result.state.resolved.mode !== "override") return;
    setBusy(true);
    setActionError(null);
    setStaleInfo(null);
    const expectedRevision = result.state.resolved.revision;
    try {
      const res = await resetSequenceStyleOverrideAction({ projectId, sequenceId, expectedRevision });
      if (!res.ok) {
        setResetConfirming(false);
        setActionError(res.error);
        return;
      }
      const r = await tryRefresh();
      setResetConfirming(false);
      setEditing(false);
      setEditState(null);
      setPendingSync(r.ok ? null : "reset");
    } catch {
      setResetConfirming(false);
      setActionError("Reset to Project Style could not be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetrySync() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await tryRefresh();
      if (r.ok) setPendingSync(null);
    } finally {
      setBusy(false);
    }
  }

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-[#3d2323] bg-[#1a1212] p-5 flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6e767d]">Project Style</h3>
        <p className="text-xs text-[#cf7b6b]">{result.error}</p>
        <button type="button" onClick={handleRetryLoad} disabled={busy} className={buttonClass}>
          {busy ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const { resolved, activeProjectVersion } = result.state;
  const summary = summaryFor(resolved);

  return (
    <div className="rounded-lg border border-[#232629] bg-[#1a1d20] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <PanelBadge tone={summary.tone}>{summary.badge}</PanelBadge>
          <p className="text-xs text-[#a4abb2]">{summary.message}</p>
        </div>
        <Link href={openProjectStyleHref} className={linkClass}>
          Open Project Style →
        </Link>
      </div>

      {resolved.mode === "override" && activeProjectVersion && (
        <p className="text-xs text-[#c9a24b]">
          Project Style is currently v{activeProjectVersion.versionNumber}. This Sequence keeps its saved override.
        </p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-[#cf7b6b] border border-[#3d2323] bg-[#1a1212] rounded px-3 py-2">
          {actionError}
        </p>
      )}

      {staleInfo && (
        <div className="text-xs text-[#c9a24b] border border-[#4a3a1f] bg-[#1f1a10] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>{staleInfo.error}</span>
          <button type="button" onClick={handleReloadSavedOverride} disabled={busy} className={smallButtonClass}>
            Reload saved override
          </button>
        </div>
      )}

      {pendingSync && (
        <div className="text-xs text-[#5b93d6] border border-[#243449] bg-[#101a26] rounded px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span>Saved, pending sync — the change was recorded but the latest state could not be reloaded.</span>
          <button type="button" onClick={handleRetrySync} disabled={busy} className={smallButtonClass}>
            {busy ? "Retrying…" : "Retry sync"}
          </button>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          {resolved.mode === "inherited" && (
            <button type="button" onClick={handleCustomize} disabled={locked} className={buttonClass}>
              {busy ? "Customizing…" : "Customize for Sequence"}
            </button>
          )}
          {resolved.mode === "override" && (
            <>
              <button type="button" onClick={handleOpenEditor} disabled={locked} className={buttonClass}>
                Edit override
              </button>
              {!resetConfirming ? (
                <button type="button" onClick={() => setResetConfirming(true)} disabled={locked} className={buttonClass}>
                  Reset to Project Style
                </button>
              ) : (
                <form onSubmit={handleResetConfirmed} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[#c9a24b]">This removes the complete Sequence override. Continue?</span>
                  <button type="submit" disabled={locked} className={buttonClass}>
                    {busy ? "Resetting…" : "Confirm Reset"}
                  </button>
                  <button type="button" onClick={() => setResetConfirming(false)} disabled={busy} className={smallButtonClass}>
                    Cancel
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {resolved.mode === "none" && (
        <p className="text-xs text-[#6e767d]">Shots in this Sequence currently have no Style to inherit.</p>
      )}

      {resolved.mode !== "none" && !editing && <StyleInspection snapshot={resolved.snapshot} compiledText={resolved.compiledText} />}

      {resolved.mode === "override" && editing && editState && (
        <StyleOverrideEditor state={editState} onChange={setEditState} onSave={handleSave} onCancel={handleCancelEdit} locked={locked} saving={busy} />
      )}
    </div>
  );
}
