"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentBench.tsx — STYLE.1.G.UI.1
//
// The Look Development Bench: a real production workspace to prepare, preview,
// launch and publish one Look Test at a time, organized into unframed
// sections (Test setup / Prompt & Style preview / Generation / Recent Look
// Tests). All state lives here; every mutation goes through the exact CORE
// Server Actions in src/actions/lookDevelopment.ts — no second prompt
// compiler, workflow patcher, poller or publisher is introduced.
//
// The preview below and the payload submitted to `createLookTestAction` are
// built from the SAME local state via the SAME pure helpers
// (parseComfyWorkflow, detectDynamicBatchUiInfo, resolveLookWorkflowInputSelections,
// buildGenerationPayload, compileLookPrompt) the CORE runner itself uses — so
// what the user inspects here is exactly what would be queued.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from "react";
import type { WorkingDraftView, ActiveVersionView } from "@/actions/projectStyle";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import {
  createLookTestAction,
  publishLookResultAction,
  getLookTestAction,
  listLookTestsAction,
  type CreateLookTestInput,
  type LookTestListItem,
} from "@/actions/lookDevelopment";
import {
  isValidLookWorkflowInputSelections,
  type LookMode,
  type LookTestSource,
  type LookStyleSourceRequest,
  type LookWorkflowInputSelections,
} from "@/lib/lookDevelopment/contracts";
import { compileLookPrompt } from "@/lib/lookDevelopment/compileLookPrompt";
import { resolveLookWorkflowInputSelections } from "@/lib/lookDevelopment/resolveWorkflowInputSelections";
import type { ResolvedLookReference } from "@/lib/lookDevelopment/resolveLookReferences";
import { parseComfyWorkflow, type WorkflowInput } from "@/lib/comfy/parseWorkflow";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import {
  NEUTRAL_BENCHMARK_SUBJECT,
  NEUTRAL_BENCHMARK_ACTION,
  deriveFromStoryText,
  randomizeNeutralSubjectAndAction,
} from "@/lib/lookDevelopment/lookDevelopmentPresets";
import ImageSourcePicker from "@/components/ImageSourcePicker";
import Collapsible from "@/components/Collapsible";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import { refImageUrl } from "@/lib/refImageUrl";
import LookDevelopmentRecentTests from "@/components/projectStyle/lookDevelopment/LookDevelopmentRecentTests";
import LookDevelopmentComparisonGrid from "@/components/projectStyle/lookDevelopment/LookDevelopmentComparisonGrid";
import type { LookResultStatus } from "@/lib/lookDevelopment/contracts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type WorkflowRow = { id: number; name: string; kind: "image" | "video"; workflowJson: string };

type LoadErrors = {
  draft?: string;
  versions?: string;
  references?: string;
  workflows?: string;
  tests?: string;
};

type Props = {
  projectId: number;
  project: { name: string; pitch: string | null; description: string | null; story: string | null };
  initialDraft: WorkingDraftView | null;
  initialVersions: ActiveVersionView;
  initialReferences: ProjectStyleReferenceView[];
  initialWorkflows: WorkflowRow[];
  initialTests: LookTestListItem[];
  initialLoadErrors: LoadErrors;
  /** STYLE.1.POLISH.1 — `default_workflow_look_development` (Settings > Generation Defaults). Null/absent/invalid falls back to the historical image-first default. */
  initialDefaultLookDevelopmentWorkflowId: number | null;
};

// ---------------------------------------------------------------------------
// Style source options
// ---------------------------------------------------------------------------

type StyleSourceOption = {
  key: string;
  label: string;
  request: LookStyleSourceRequest;
  compiledText: string;
};

export function buildStyleSourceOptions(draft: WorkingDraftView | null, versions: ActiveVersionView): StyleSourceOption[] {
  const options: StyleSourceOption[] = [];
  if (draft) {
    options.push({
      key: "working-draft",
      label: `Working Draft (revision ${draft.draft.revision})`,
      request: { kind: "working-draft", expectedRevision: draft.draft.revision },
      compiledText: draft.compiledPreview,
    });
  }
  for (const v of versions.history) {
    const isActive = versions.pointer?.activeVersionId === v.id;
    options.push({
      key: `version-${v.id}`,
      label: `v${v.versionNumber}${isActive ? " (active)" : ""} — published ${v.publishedAt}`,
      request: { kind: "published-version", versionId: v.id },
      compiledText: v.compiledText,
    });
  }
  return options;
}

export function defaultStyleSourceKey(draft: WorkingDraftView | null, versions: ActiveVersionView): string | null {
  if (draft) return "working-draft";
  if (versions.activeVersion) return `version-${versions.activeVersion.id}`;
  if (versions.history.length > 0) return `version-${versions.history[0].id}`;
  return null;
}

// ---------------------------------------------------------------------------
// Pure, exported, unit-testable helpers — no React state, no DB, no network.
// Extracted so a workflow-switch, a duplicate-mapping guard, and the Partner
// Node "frozen intent" contract can each be proven deterministically without
// rendering the component (see the proof script referenced in the report).
// ---------------------------------------------------------------------------

/**
 * Codex retake round 1 (P1, "Preview accepts a duplicate reference mapping
 * that CORE rejects") — an ordinary image node assignment must never leave
 * the same reference id assigned to two nodes at once. Assigning a reference
 * to `nodeId` clears it from any OTHER node it was previously assigned to
 * first, so the resulting map can never contain a duplicate value — the same
 * contradiction `isValidLookWorkflowInputSelections` (contracts.ts) refuses
 * server-side can never be constructed here in the first place.
 */
export function computeImageAssignmentUpdate(
  prev: Record<string, number | null>,
  nodeId: string,
  referenceId: number | null
): Record<string, number | null> {
  const next: Record<string, number | null> = { ...prev };
  if (referenceId !== null) {
    for (const otherNodeId of Object.keys(next)) {
      if (otherNodeId !== nodeId && next[otherNodeId] === referenceId) {
        next[otherNodeId] = null;
      }
    }
  }
  next[nodeId] = referenceId;
  return next;
}

export type WorkflowLocalState = {
  imageAssignments: Record<string, number | null>;
  textOverrideEnabled: Record<string, boolean>;
  textOverrideValue: Record<string, string>;
  scalarOverrideValue: Record<string, string>;
};

/**
 * Codex retake round 1 (P1, "Workflow changes retain hidden mappings and
 * overrides") — image assignments and text/scalar overrides are keyed by
 * node id, which is only meaningful for ONE specific workflow. Switching mode
 * or workflow must wipe all of it atomically; there is no way to know which
 * (if any) node ids coincidentally still exist in a different workflow, and
 * keeping stale entries around only produces silent resolver rejections the
 * user has no control to clear. A full reset is the only always-correct
 * response to a workflow identity change.
 */
export function emptyWorkflowLocalState(): WorkflowLocalState {
  return { imageAssignments: {}, textOverrideEnabled: {}, textOverrideValue: {}, scalarOverrideValue: {} };
}

/**
 * Explicit-argument, pure request builder — the ONLY place a
 * `CreateLookTestInput` is assembled from local values, used identically by
 * the first (no opt-in) submission and by the frozen-intent fingerprint
 * below, so there is never a second, divergent assembly path.
 */
export function buildCreateLookTestInput(args: {
  projectId: number;
  source: LookTestSource;
  mode: LookMode;
  subject: string;
  action: string;
  styleSource: LookStyleSourceRequest;
  referenceImageIds: number[];
  workflowId: number;
  workflowInputSelections: LookWorkflowInputSelections;
  confirmPartnerNodeCost: boolean;
}): CreateLookTestInput {
  return {
    projectId: args.projectId,
    source: args.source,
    mode: args.mode,
    subject: args.subject,
    action: args.action,
    styleSource: args.styleSource,
    referenceImageIds: args.referenceImageIds.length > 0 ? args.referenceImageIds : undefined,
    workflowId: args.workflowId,
    workflowInputSelections: args.workflowInputSelections,
    confirmPartnerNodeCost: args.confirmPartnerNodeCost,
  };
}

/**
 * Recursively sorts object keys (arrays keep their given order — reference
 * and mapping ORDER is part of the intent) so two structurally-equal values
 * always serialize identically regardless of property insertion order.
 *
 * Codex retake round 1 proof run — an earlier version of
 * `buildLookTestRequestFingerprint` passed `Object.keys(rest).sort()` as
 * JSON.stringify's REPLACER argument. A replacer array is applied
 * recursively at EVERY nesting level, not just the top level: it silently
 * stripped every key of the nested `styleSource`/`workflowInputSelections`
 * objects that wasn't also a top-level key name (e.g. `kind`, `versionId`,
 * `imageAssignments`), so two requests that only differed in Style source or
 * mapping produced the SAME, wrong fingerprint. Caught by the disposable
 * proof script before this reached review — fixed by hand-rolling a real
 * recursive serializer instead of (mis)using JSON.stringify's replacer.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Codex retake round 1 (P1, "Partner Node confirmation can authorize a
 * different request") — a deterministic fingerprint of every field that
 * defines the paid intent, EXCLUDING `confirmPartnerNodeCost` itself (a
 * fingerprint must be stable between the first refused attempt and the
 * confirmed resubmission of the exact same intent). Two requests that differ
 * in workflow, references, mappings, Style source, mode, subject/action, or
 * overrides always produce different fingerprints; two requests that differ
 * ONLY in `confirmPartnerNodeCost` always produce the SAME fingerprint.
 */
export function buildLookTestRequestFingerprint(request: CreateLookTestInput): string {
  const { confirmPartnerNodeCost: _ignored, ...rest } = request;
  void _ignored;
  return stableStringify(rest);
}

/**
 * Codex retake round 2 (P2, "Recent Look Tests remains stale as the active
 * job progresses") — the ONE place a polled job-status update is reconciled
 * into the `tests` list. Pure (no React state): given the current list, the
 * active test/job ids, and the latest polled status, returns a new list with
 * only the matching row's `job.status` updated (or a `job` object created if
 * one wasn't there yet) — every other row is untouched. Used identically by
 * `handleActiveJobStatusChange` below, so preview and actual reconciliation
 * can never diverge, and is unit-testable without rendering the component.
 */
export function reconcileTestJobStatus(
  tests: LookTestListItem[],
  activeLookTestId: number | null,
  activeJobId: number | null,
  status: string
): LookTestListItem[] {
  if (activeLookTestId === null || activeJobId === null) return tests;
  return tests.map((t) => (t.id === activeLookTestId ? { ...t, job: { id: activeJobId, status } } : t));
}

// ---------------------------------------------------------------------------
// UI atoms (matching ProjectStyleWorkspace's visual language)
// ---------------------------------------------------------------------------

const fieldClass =
  "rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y w-full";
const smallInputClass =
  "rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046] w-full";
const buttonClass =
  "rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start";
const segButtonBase =
  "rounded border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const segButtonActive = "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]";
const segButtonInactive = "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]";
const sectionTitleClass = "text-xs font-medium uppercase tracking-wider text-[#6e767d]";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-[#e7e9ec] border-b border-[#232629] pb-2">{children}</h2>;
}

const SCALAR_KINDS = new Set<WorkflowInput["kind"]>(["integer", "float", "boolean", "select", "seed", "string"]);

export default function LookDevelopmentBench({
  projectId,
  project,
  initialDraft,
  initialVersions,
  initialReferences,
  initialWorkflows,
  initialTests,
  initialLoadErrors,
  initialDefaultLookDevelopmentWorkflowId,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<LookTestListItem[]>(initialTests);
  const loadErrorEntries = Object.entries(initialLoadErrors).filter((entry): entry is [string, string] => Boolean(entry[1]));

  // ── Test content ──────────────────────────────────────────────────────
  const [source, setSource] = useState<LookTestSource>("custom");
  const [subject, setSubject] = useState("");
  const [action, setAction] = useState("");
  // Tracks the exact text the currently-selected preset last applied, so a
  // later keystroke can be detected as "dirty" (edited beyond the preset)
  // without a second, divergent "has the user typed anything" heuristic.
  const [lastAppliedText, setLastAppliedText] = useState<{ subject: string; action: string }>({ subject: "", action: "" });
  const [pendingSourceSwitch, setPendingSourceSwitch] = useState<LookTestSource | null>(null);
  // ── Neutral Benchmark Random (Lot D2) — declared here (ahead of
  // `applyPreset`) so it can clear a stale Random confirmation whenever a
  // source switch is applied. See the Codex retake round 1 (P1) comments
  // below for why the two pending decisions must stay mutually exclusive.
  const [pendingRandomize, setPendingRandomize] = useState(false);

  const isDirty = subject !== lastAppliedText.subject || action !== lastAppliedText.action;

  const applyPreset = useCallback(
    (next: LookTestSource) => {
      let nextSubject = "";
      let nextAction = "";
      if (next === "from-story") {
        const derived = deriveFromStoryText(project);
        nextSubject = derived.subject;
        nextAction = derived.action;
      } else if (next === "neutral-benchmark") {
        nextSubject = NEUTRAL_BENCHMARK_SUBJECT;
        nextAction = NEUTRAL_BENCHMARK_ACTION;
      }
      setSource(next);
      setSubject(nextSubject);
      setAction(nextAction);
      setLastAppliedText({ subject: nextSubject, action: nextAction });
      setPendingSourceSwitch(null);
      // Codex retake round 1 (P1) — applying a source switch (Overwrite or a
      // no-opt-in direct switch) supersedes any stale Random decision left
      // over from a PREVIOUS source: without this, a leftover
      // `pendingRandomize` confirmation could still be sitting on screen
      // after `source` has already moved on, and its Overwrite button would
      // then install neutral content under the wrong (now-current) source.
      setPendingRandomize(false);
    },
    [project]
  );

  const handleSourceSelect = useCallback(
    (next: LookTestSource) => {
      if (next === source) return;
      if (isDirty) {
        // Codex retake round 1 (P1) — the two pending overwrite decisions
        // (source switch vs. randomize) are mutually exclusive: staging a
        // new source-switch decision immediately invalidates/clears any
        // pending Random decision, so at most one confirmation banner is
        // ever visible and a stale one can never be actioned later.
        setPendingRandomize(false);
        setPendingSourceSwitch(next);
        return;
      }
      applyPreset(next);
    },
    [source, isDirty, applyPreset]
  );

  const applyRandomized = useCallback(() => {
    // Codex retake round 1 (P1) — defense-in-depth: even if a stale
    // `pendingRandomize` confirmation were ever actioned after `source`
    // moved away from "neutral-benchmark" (e.g. a future code path that
    // forgets to clear it), this guard refuses to apply neutral content
    // under a different preset. It only clears the stale flag instead.
    if (source !== "neutral-benchmark") {
      setPendingRandomize(false);
      return;
    }
    const { subject: nextSubject, action: nextAction } = randomizeNeutralSubjectAndAction();
    setSubject(nextSubject);
    setAction(nextAction);
    setLastAppliedText({ subject: nextSubject, action: nextAction });
    setPendingRandomize(false);
  }, [source]);

  const handleRandomizeClick = useCallback(() => {
    if (isDirty) {
      // Codex retake round 1 (P1) — symmetric to handleSourceSelect: staging
      // a Random decision invalidates/clears any pending source-switch
      // decision, keeping the two confirmations mutually exclusive.
      setPendingSourceSwitch(null);
      setPendingRandomize(true);
      return;
    }
    applyRandomized();
  }, [isDirty, applyRandomized]);

  // ── Mode + Style source ──────────────────────────────────────────────
  // STYLE.1.POLISH.1 — the Default Look Development Workflow (Settings), if
  // it still resolves to a real workflow, sets the INITIAL mode/workflowId
  // from that workflow's real kind. Absent/deleted/invalid falls back to the
  // historical behavior: mode "image" + the first image workflow.
  const defaultWorkflowRow = useMemo(
    () =>
      initialDefaultLookDevelopmentWorkflowId !== null
        ? initialWorkflows.find((w) => w.id === initialDefaultLookDevelopmentWorkflowId) ?? null
        : null,
    [initialWorkflows, initialDefaultLookDevelopmentWorkflowId]
  );
  const [mode, setMode] = useState<LookMode>(() => defaultWorkflowRow?.kind ?? "image");

  const styleOptions = useMemo(() => buildStyleSourceOptions(initialDraft, initialVersions), [initialDraft, initialVersions]);
  const [styleSourceKey, setStyleSourceKey] = useState<string | null>(() => defaultStyleSourceKey(initialDraft, initialVersions));
  const selectedStyleOption = styleOptions.find((o) => o.key === styleSourceKey) ?? null;

  // ── Workflow ──────────────────────────────────────────────────────────
  const compatibleWorkflows = useMemo(() => initialWorkflows.filter((w) => w.kind === mode), [initialWorkflows, mode]);
  const [workflowId, setWorkflowId] = useState<number | null>(() => defaultWorkflowRow?.id ?? compatibleWorkflows[0]?.id ?? null);

  // ── Reference Board mapping state (declared here, ahead of the workflow
  // handlers below, so they can reset it without a temporal-dead-zone /
  // hoisting hazard) ───────────────────────────────────────────────────
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<number[]>([]);
  const [imageAssignments, setImageAssignments] = useState<Record<string, number | null>>({});
  const [textOverrideEnabled, setTextOverrideEnabled] = useState<Record<string, boolean>>({});
  const [textOverrideValue, setTextOverrideValue] = useState<Record<string, string>>({});
  const [scalarOverrideValue, setScalarOverrideValue] = useState<Record<string, string>>({});

  // Codex retake round 1 (P1) — image assignments and text/scalar overrides
  // are keyed by node id, meaningful only for one specific workflow. Every
  // workflow (and therefore mode) change resets them atomically via
  // `emptyWorkflowLocalState` — see that helper's doc comment for why a
  // partial/keyed-by-workflow-id state was rejected in favor of a full reset.
  const handleModeChange = useCallback(
    (next: LookMode) => {
      // Codex retake round 2 (P1, "Clicking the already-active mode destroys
      // workflow-local edits") — both segmented Mode buttons stay clickable
      // (needed for keyboard/AT semantics — see `aria-pressed` below), so a
      // harmless click on the ALREADY-active mode must be a pure no-op:
      // return before any reset. Only a REAL mode change may clear
      // workflow-local state.
      if (next === mode) return;
      setMode(next);
      const firstOfKind = initialWorkflows.find((w) => w.kind === next);
      setWorkflowId(firstOfKind?.id ?? null);
      const reset = emptyWorkflowLocalState();
      setImageAssignments(reset.imageAssignments);
      setTextOverrideEnabled(reset.textOverrideEnabled);
      setTextOverrideValue(reset.textOverrideValue);
      setScalarOverrideValue(reset.scalarOverrideValue);
    },
    [mode, initialWorkflows]
  );

  const handleWorkflowSelect = useCallback((nextWorkflowId: number) => {
    setWorkflowId(nextWorkflowId);
    const reset = emptyWorkflowLocalState();
    setImageAssignments(reset.imageAssignments);
    setTextOverrideEnabled(reset.textOverrideEnabled);
    setTextOverrideValue(reset.textOverrideValue);
    setScalarOverrideValue(reset.scalarOverrideValue);
  }, []);

  const selectedWorkflow = initialWorkflows.find((w) => w.id === workflowId) ?? null;

  const parsedWorkflow = useMemo(() => {
    if (!selectedWorkflow) return null;
    return parseComfyWorkflow(selectedWorkflow.workflowJson);
  }, [selectedWorkflow]);

  const batchInfo = useMemo(() => {
    if (!selectedWorkflow) return { kind: "none" as const };
    return detectDynamicBatchUiInfo(selectedWorkflow.workflowJson);
  }, [selectedWorkflow]);

  const imageInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => i.kind === "image") ?? [], [parsedWorkflow]);
  const textInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => i.kind === "text") ?? [], [parsedWorkflow]);
  const scalarInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => SCALAR_KINDS.has(i.kind)) ?? [], [parsedWorkflow]);

  const templateChainNodeIds = useMemo(() => new Set(batchInfo.kind === "ready" ? batchInfo.templateChainNodeIds : []), [batchInfo]);
  const ordinaryImageInputs = useMemo(() => imageInputs.filter((i) => !templateChainNodeIds.has(i.nodeId)), [imageInputs, templateChainNodeIds]);

  const references = initialReferences;
  const referenceById = useMemo(() => new Map(references.map((r) => [r.reference.id, r])), [references]);

  const selectedReferences: ResolvedLookReference[] = useMemo(
    () =>
      selectedReferenceIds
        .map((id) => referenceById.get(id))
        .filter((v): v is ProjectStyleReferenceView => v !== undefined)
        .map((v) => ({
          id: v.reference.id,
          imagePath: v.reference.imagePath,
          label: v.reference.label,
          whatInterestsMe: v.reference.whatInterestsMe,
          whatToAvoid: v.reference.whatToAvoid,
          provenanceNotes: v.reference.provenanceNotes,
        })),
    [selectedReferenceIds, referenceById]
  );

  const toggleReference = useCallback((id: number) => {
    setSelectedReferenceIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length >= 12) return prev;
      return [...prev, id];
    });
    setImageAssignments((prev) => {
      // Dropping a reference clears any node assignment that pointed to it.
      const next = { ...prev };
      for (const nodeId of Object.keys(next)) {
        if (next[nodeId] === id) next[nodeId] = null;
      }
      return next;
    });
  }, []);

  const moveReference = useCallback((id: number, direction: "up" | "down") => {
    setSelectedReferenceIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }, []);

  // Every reference not explicitly assigned to an ordinary image node falls
  // into the Dynamic Batch / direct-repeatable ordered list, in the exact
  // selected order — so every selected reference is always reachable
  // through exactly one path (see resolveWorkflowInputSelections.ts).
  const assignedReferenceIds = useMemo(() => new Set(Object.values(imageAssignments).filter((v): v is number => v !== null)), [imageAssignments]);
  const remainingReferences = useMemo(() => selectedReferences.filter((r) => !assignedReferenceIds.has(r.id)), [selectedReferences, assignedReferenceIds]);

  const workflowInputSelections: LookWorkflowInputSelections = useMemo(() => {
    const imgAssignments = Object.entries(imageAssignments)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([nodeId, referenceId]) => ({ nodeId, referenceId }));
    const dynamicBatchReferenceIds = batchInfo.kind === "ready" ? remainingReferences.map((r) => r.id) : [];
    const textOverrideByNodeId: Record<string, string> = {};
    for (const input of textInputs) {
      if (textOverrideEnabled[input.nodeId] && (textOverrideValue[input.nodeId] ?? "").trim().length > 0) {
        textOverrideByNodeId[input.nodeId] = textOverrideValue[input.nodeId];
      }
    }
    const scalarOverrideByNodeId: Record<string, string> = {};
    for (const input of scalarInputs) {
      const val = scalarOverrideValue[input.nodeId];
      if (val !== undefined && val !== (input.defaultValue ?? "")) {
        scalarOverrideByNodeId[input.nodeId] = val;
      }
    }
    return {
      imageAssignments: imgAssignments.length > 0 ? imgAssignments : undefined,
      dynamicBatchReferenceIds: dynamicBatchReferenceIds.length > 0 ? dynamicBatchReferenceIds : undefined,
      textOverrideByNodeId: Object.keys(textOverrideByNodeId).length > 0 ? textOverrideByNodeId : undefined,
      scalarOverrideByNodeId: Object.keys(scalarOverrideByNodeId).length > 0 ? scalarOverrideByNodeId : undefined,
    };
  }, [imageAssignments, batchInfo, remainingReferences, textInputs, textOverrideEnabled, textOverrideValue, scalarInputs, scalarOverrideValue]);

  // ── Preview: same pure helpers the CORE runner uses ─────────────────
  const compiledPrompt = useMemo(() => {
    if (!selectedStyleOption) return null;
    return compileLookPrompt({
      subject,
      action,
      styleCompiledText: selectedStyleOption.compiledText,
      references: selectedReferences,
    });
  }, [subject, action, selectedStyleOption, selectedReferences]);

  const mappingResolution = useMemo(() => {
    if (!parsedWorkflow) return null;
    return resolveLookWorkflowInputSelections({
      inputs: parsedWorkflow.inputs,
      batchInfo,
      references: selectedReferences,
      selections: workflowInputSelections,
    });
  }, [parsedWorkflow, batchInfo, selectedReferences, workflowInputSelections]);

  const buildPreview = useMemo(() => {
    if (!selectedWorkflow || !parsedWorkflow || !mappingResolution?.ok || !compiledPrompt) return null;
    const availableImages: RuntimeImageOption[] = selectedReferences.map((ref) => ({
      id: `look-ref-${ref.id}`,
      source: "board" as const,
      imagePath: ref.imagePath,
      label: ref.label ?? "Reference",
      role: null,
    }));
    return buildGenerationPayload({
      workflowJson: selectedWorkflow.workflowJson,
      inputs: parsedWorkflow.inputs,
      suggestedText: compiledPrompt.prompt,
      availableImages,
      selectedImageByNodeId: mappingResolution.result.selectedImageByNodeId,
      batchSelectedImages: mappingResolution.result.batchSelectedImages,
      textOverrideByNodeId: mappingResolution.result.textOverrideByNodeId,
      scalarOverrideByNodeId: mappingResolution.result.scalarOverrideByNodeId,
    });
  }, [selectedWorkflow, parsedWorkflow, mappingResolution, compiledPrompt, selectedReferences]);

  const diagnostics: string[] = useMemo(() => {
    const list: string[] = [];
    if (!selectedWorkflow) list.push("No compatible workflow selected.");
    if (parsedWorkflow === null && selectedWorkflow) list.push("Workflow JSON could not be parsed.");
    if (!selectedStyleOption) list.push("No usable Style source is available for this Project.");
    // Codex retake round 1 (P1) — defense-in-depth: validate the exact
    // selections object against the SAME strict contract
    // `createLookTestAction` itself enforces server-side
    // (`isValidLookWorkflowInputSelections`, contracts.ts), so any future
    // slip in the dedup-at-the-source guard above is still caught here
    // before Generate is ever enabled, instead of surfacing only as a CORE
    // rejection after a round trip.
    if (!isValidLookWorkflowInputSelections(workflowInputSelections)) {
      list.push("The current reference mapping is contradictory (e.g. a reference assigned to more than one input) — adjust it before generating.");
    }
    if (mappingResolution && !mappingResolution.ok) list.push(mappingResolution.error);
    if (buildPreview && !buildPreview.ok) list.push(buildPreview.error);
    if (buildPreview?.ok && buildPreview.displayMappings.some((m) => m.mappingKind === "video")) {
      list.push("This workflow requires a video input, which Look Development cannot upload yet — blocked.");
    }
    if (buildPreview?.ok && !buildPreview.patch.patches.some((p) => p.kind === "text")) {
      list.push("This workflow has no compatible text input to receive the Look Development prompt.");
    }
    return list;
  }, [selectedWorkflow, parsedWorkflow, selectedStyleOption, mappingResolution, buildPreview, workflowInputSelections]);

  const canGenerate = diagnostics.length === 0 && selectedStyleOption !== null && selectedWorkflow !== null && subject.trim().length > 0 && action.trim().length > 0;

  // ── Generation ────────────────────────────────────────────────────────
  const submitLockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [activeLookTestId, setActiveLookTestId] = useState<number | null>(null);
  // Codex retake round 1 (P1, "Partner Node confirmation can authorize a
  // different request") — the FULL confirmed request is frozen here
  // (never rebuilt from live state at confirm time), plus the fingerprint it
  // was frozen under. `apiNodeClasses` is kept only for display.
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    fingerprint: string;
    request: CreateLookTestInput;
    apiNodeClasses: string[];
  } | null>(null);
  const [jobStatus, setJobStatus] = useState<{ status: string; outputPath: string | null } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publishLockRef = useRef(false);
  const [publishedResult, setPublishedResult] = useState<{ resultId: number; filePath: string } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  // The exact request the CURRENT setup state would submit right now — the
  // single source both the initial submit and the pending-confirmation
  // invalidation check derive from, so they can never diverge.
  const liveRequest: CreateLookTestInput | null = useMemo(() => {
    if (!selectedStyleOption || !workflowId) return null;
    return buildCreateLookTestInput({
      projectId,
      source,
      mode,
      subject,
      action,
      styleSource: selectedStyleOption.request,
      referenceImageIds: selectedReferenceIds,
      workflowId,
      workflowInputSelections,
      confirmPartnerNodeCost: false,
    });
  }, [selectedStyleOption, workflowId, projectId, source, mode, subject, action, selectedReferenceIds, workflowInputSelections]);

  const liveFingerprint = useMemo(() => (liveRequest ? buildLookTestRequestFingerprint(liveRequest) : null), [liveRequest]);

  // Codex retake round 1 (P1) — ANY relevant edit after the gate (workflow,
  // references, mappings, Style source, mode, subject/action, overrides — all
  // captured by `liveFingerprint`) invalidates the pending confirmation and
  // forces a fresh no-opt-in preflight; it can never be honored by a later,
  // different intent. Derived at render time (never a `setState` inside an
  // effect) — a stale `pendingConfirmation` whose fingerprint no longer
  // matches the live setup is simply never treated as active, everywhere
  // it's read below.
  const activePendingConfirmation = pendingConfirmation && pendingConfirmation.fingerprint === liveFingerprint ? pendingConfirmation : null;

  const refreshTests = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const result = await listLookTestsAction(projectId);
      if (result.ok) {
        setTests(result.tests);
        return { ok: true };
      }
      return { ok: false, error: result.error };
    } catch {
      return { ok: false, error: "Failed to refresh Recent Look Tests." };
    }
  }, [projectId]);

  // Codex retake round 1 (P1) — every async boundary below produces a
  // visible, sanitized error and always releases its lock/busy state
  // (try/catch/finally, never try/finally alone). `request` is always
  // submitted EXACTLY as given by the caller — `handleConfirmPartnerNode`
  // passes the frozen `pendingConfirmation.request`, never a value rebuilt
  // from current state.
  const submitRequest = useCallback(
    async (request: CreateLookTestInput) => {
      try {
        const result = await createLookTestAction(request);
        if (result.ok) {
          setActiveJobId(result.jobId);
          setActiveLookTestId(result.lookTestId ?? null);
          setPendingConfirmation(null);
          setJobStatus(null);
          setPublishedResult(null);
          setPublishError(null);
          setRefreshWarning(null);
          const refreshed = await refreshTests();
          if (!refreshed.ok) setRefreshWarning(`Look Test created, but Recent Look Tests could not be refreshed: ${refreshed.error}`);
        } else if (result.requiresPartnerNodeConfirmation) {
          // Freeze the EXACT request just refused (still confirmPartnerNodeCost: false) —
          // this is what Confirm will resubmit, never a value read again from live state.
          setPendingConfirmation({
            fingerprint: buildLookTestRequestFingerprint(request),
            request,
            apiNodeClasses: result.apiNodeClasses ?? [],
          });
        } else {
          setError(result.error);
        }
      } catch {
        setError("Failed to submit the Look Test. Check your connection and try again — your setup was not cleared.");
      }
    },
    [refreshTests]
  );

  const handleGenerate = useCallback(async () => {
    // Synchronous lock BEFORE any await — prevents a double click from
    // creating two jobs for the same intent.
    if (submitLockRef.current) return;
    if (!liveRequest) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitRequest(liveRequest);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [submitRequest, liveRequest]);

  const handleConfirmPartnerNode = useCallback(async () => {
    if (submitLockRef.current) return;
    // Only an ACTIVE confirmation (its fingerprint still matches the live
    // setup) can be honored — a stale one (any relevant edit happened after
    // the gate) is never submitted; the user must re-click Generate for a
    // fresh no-opt-in preflight instead.
    if (!activePendingConfirmation) return;
    const request = { ...activePendingConfirmation.request, confirmPartnerNodeCost: true };
    // Codex retake round 2 (P1, "Cancel remains active after paid submission
    // has started") — the confirmation is accepted for submission
    // SYNCHRONOUSLY, before any `await`: `pendingConfirmation` is cleared
    // right here, in the same tick as the click, so the confirm/cancel
    // banner (and its Cancel button) can never remain on screen once the
    // paid request is in flight. There is no abort contract for an
    // already-submitted Server Action — the UI must never imply one exists
    // by leaving Cancel clickable or reachable after this point.
    submitLockRef.current = true;
    setPendingConfirmation(null);
    setSubmitting(true);
    setError(null);
    try {
      await submitRequest(request);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [submitRequest, activePendingConfirmation]);

  const handleCancelPartnerNode = useCallback(() => {
    // Cancelling creates no job — simply discard the pending confirmation.
    // Guarded by `disabled={submitting}` in the JSX below as well, but the
    // real guarantee is structural: once Confirm runs, the banner this
    // button lives in is already gone (see handleConfirmPartnerNode above),
    // so this can never fire concurrently with an in-flight paid submission.
    setPendingConfirmation(null);
  }, []);

  const handleSaveLookResult = useCallback(async () => {
    if (!activeLookTestId || !activeJobId) return;
    if (publishLockRef.current) return;
    publishLockRef.current = true;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishLookResultAction(projectId, activeLookTestId, activeJobId);
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      // Publication is a confirmed success from here on — it must remain
      // represented as such regardless of what the refresh below does.
      setPublishedResult({ resultId: result.resultId, filePath: result.filePath });

      // Codex retake round 1 (P1) — both structured failures (`{ ok: false }`)
      // AND thrown rejections are checked individually via `allSettled`; a
      // failed refresh is reported as a warning and NEVER triggers a replay
      // of generation or publication.
      const [getOutcome, refreshOutcome] = await Promise.allSettled([getLookTestAction(projectId, activeLookTestId), refreshTests()]);
      const warnings: string[] = [];
      if (getOutcome.status === "rejected" || (getOutcome.status === "fulfilled" && !getOutcome.value.ok)) {
        warnings.push("failed to reload this Look Test");
      }
      if (refreshOutcome.status === "rejected" || (refreshOutcome.status === "fulfilled" && !refreshOutcome.value.ok)) {
        warnings.push("failed to refresh Recent Look Tests");
      }
      if (warnings.length > 0) {
        setPublishError(`Look Result was saved, but the following refresh(es) failed: ${warnings.join("; ")}. Reload the page to see the latest state everywhere.`);
      }
    } catch {
      setPublishError("Failed to save the Look Result. Check your connection and try again.");
    } finally {
      publishLockRef.current = false;
      setPublishing(false);
    }
  }, [activeLookTestId, activeJobId, projectId, refreshTests]);

  const handleOpenTest = useCallback(
    async (lookTestId: number) => {
      try {
        return await getLookTestAction(projectId, lookTestId);
      } catch {
        return { ok: false as const, error: "Failed to load this Look Test. Check your connection and try again." };
      }
    },
    [projectId]
  );

  const workflowNameById = useMemo(() => new Map(initialWorkflows.map((w) => [w.id, w.name])), [initialWorkflows]);

  // ── Review workspace: comparison selection + notes/status/target/delete
  //    reconciliation. `tests` (declared above) remains the ONE source of
  //    truth for every row's job/result summary; these handlers only patch
  //    the matching row after a CORE mutation succeeds elsewhere (Recent
  //    Tests, Comparison grid) — never a second, divergent copy of the data.
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);
  const [comparisonRefreshToken, setComparisonRefreshToken] = useState(0);
  // STYLE.1.POLISH.1 (C4) — closed by default; only controls CSS visibility,
  // LookDevelopmentRecentTests itself always stays mounted (see render below).
  const [recentTestsOpen, setRecentTestsOpen] = useState(false);

  const handleToggleComparison = useCallback((lookTestId: number) => {
    setComparisonIds((prev) => {
      if (prev.includes(lookTestId)) return prev.filter((id) => id !== lookTestId);
      if (prev.length >= 4) return prev;
      return [...prev, lookTestId];
    });
  }, []);

  const handleClearComparison = useCallback(() => setComparisonIds([]), []);

  const bumpComparisonRefresh = useCallback(() => setComparisonRefreshToken((v) => v + 1), []);

  // A Look Target change reconciles EVERY row: the newly-targeted result
  // becomes look-target, and any other row that previously held look-target
  // reverts to candidate — mirroring `markLookResultAsTargetAction`'s own
  // project-scoped uniqueness guarantee, applied locally without a reload.
  const handleStatusChanged = useCallback((resultId: number, status: LookResultStatus) => {
    setTests((prev) =>
      prev.map((t) => {
        if (!t.result) return t;
        if (t.result.id === resultId) return { ...t, result: { ...t.result, status } };
        if (status === "look-target" && t.result.status === "look-target") return { ...t, result: { ...t.result, status: "candidate" } };
        return t;
      })
    );
    bumpComparisonRefresh();
  }, [bumpComparisonRefresh]);

  const handleNotesSaved = useCallback((_resultId: number, _notes: string | null) => {
    void _resultId;
    void _notes;
    // Notes are not part of the list-row summary (LookTestListItem never
    // carries them) — only the opened detail and the comparison grid read
    // them, both via getLookTestAction. Bump the comparison refresh token so
    // any compared entry re-fetches the latest notes.
    bumpComparisonRefresh();
  }, [bumpComparisonRefresh]);

  const handleResultDeleted = useCallback(
    (resultId: number) => {
      setTests((prev) => prev.map((t) => (t.result?.id === resultId ? { ...t, result: null } : t)));
      setComparisonIds((prev) => {
        const deletedTest = tests.find((t) => t.result?.id === resultId);
        return deletedTest ? prev.filter((id) => id !== deletedTest.id) : prev;
      });
      bumpComparisonRefresh();
    },
    [tests, bumpComparisonRefresh]
  );

  // Returns whether the list refresh itself succeeded — the caller (Recent
  // Tests) uses this to decide whether the duplicated id can be dropped from
  // its own "pending sync" tracking, or must keep offering `Retry sync`.
  // Never re-invokes `duplicateLookTestAction` — only a read.
  const handleDuplicated = useCallback(async (): Promise<boolean> => {
    const refreshed = await refreshTests();
    if (!refreshed.ok) {
      setRefreshWarning(`Look Test duplicated, but Recent Look Tests could not be refreshed: ${refreshed.error}`);
      return false;
    }
    setRefreshWarning(null);
    return true;
  }, [refreshTests]);

  const handleRerunQueued = useCallback(
    async (lookTestId: number, jobId: number) => {
      setTests((prev) => prev.map((t) => (t.id === lookTestId ? { ...t, job: { id: jobId, status: "queued" } } : t)));
      const refreshed = await refreshTests();
      if (!refreshed.ok) setRefreshWarning(`Look Test run queued, but Recent Look Tests could not be refreshed: ${refreshed.error}`);
      else setRefreshWarning(null);
    },
    [refreshTests]
  );

  // A rerun's publish is authoritative on its own (publishLookResultAction
  // returns the exact resultId/filePath) — patching `tests` here never
  // depends on a second network round trip succeeding. The list refresh
  // below is best-effort only, to pick up anything else that may have
  // changed; its failure never invalidates the already-known publish.
  const handleRerunPublished = useCallback(
    async (lookTestId: number, resultId: number, filePath: string, _generationJobId: number) => {
      void _generationJobId; // only needed by the opened-detail reconciliation in LookDevelopmentRecentTests; the list row summary never carries it.
      setTests((prev) => prev.map((t) => (t.id === lookTestId ? { ...t, result: { id: resultId, status: "candidate", filePath } } : t)));
      bumpComparisonRefresh();
      const refreshed = await refreshTests();
      if (!refreshed.ok) setRefreshWarning(`Look Result saved, but Recent Look Tests could not be fully refreshed: ${refreshed.error}`);
      else setRefreshWarning(null);
    },
    [refreshTests, bumpComparisonRefresh]
  );

  const handleRetryListSync = useCallback(async () => {
    const refreshed = await refreshTests();
    if (refreshed.ok) setRefreshWarning(null);
    else setRefreshWarning(`Recent Look Tests could not be refreshed: ${refreshed.error}`);
  }, [refreshTests]);

  // Codex retake round 2 (P2, "Recent Look Tests remains stale as the active
  // job progresses") — `GenerationJobStatusPanel` polls independently and
  // only calls `router.refresh()` on a TERMINAL status, which re-fetches
  // Server Component props but does NOT reinitialize this already-mounted
  // Client Component's own `useState(initialTests)`. A single callback now
  // updates BOTH the live `jobStatus` shown under Generation AND the
  // matching row's `job.status` inside `tests` (keyed by `activeLookTestId`,
  // which is known and stable for the whole lifetime of the active job) —
  // every poll tick (queued -> running -> done/failed/timeout) is reflected
  // in Recent Look Tests immediately, without waiting for a full page
  // refresh or another `listLookTestsAction` round trip.
  const handleActiveJobStatusChange = useCallback(
    (status: { status: string; outputPath: string | null }) => {
      setJobStatus(status);
      setTests((prev) => reconcileTestJobStatus(prev, activeLookTestId, activeJobId, status.status));
    },
    [activeLookTestId, activeJobId]
  );

  return (
    <div className="flex flex-col gap-6">
      {loadErrorEntries.length > 0 && (
        <div className="rounded border border-[#3d2323] bg-[#1a1212] px-3 py-2 flex flex-col gap-1">
          {loadErrorEntries.map(([domain, message]) => (
            <p key={domain} className="text-xs text-[#cf7b6b]">
              {message}
            </p>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{error}</p>}

      {/* ── Test setup ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <SectionHeading>Test setup</SectionHeading>

        {/* STYLE.1.POLISH.1 (C3) — closed by default; state lives in this
            component (subject/action/source/pendingSourceSwitch/pendingRandomize),
            never in Collapsible, so it survives close/reopen unchanged. */}
        <Collapsible label="Test content" defaultOpen={false}>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap items-center">
            {(["from-story", "neutral-benchmark", "custom"] as LookTestSource[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`${segButtonBase} ${source === s ? segButtonActive : segButtonInactive}`}
                onClick={() => handleSourceSelect(s)}
              >
                {s === "from-story" ? "From Story" : s === "neutral-benchmark" ? "Neutral Benchmark" : "Custom"}
              </button>
            ))}
            {source === "neutral-benchmark" && (
              <button type="button" className={segButtonBase + " " + segButtonInactive} onClick={handleRandomizeClick}>
                Randomize subject and action
              </button>
            )}
          </div>
          {pendingSourceSwitch && (
            <div className="rounded border border-[#4a3a1f] bg-[#1f1a10] px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-xs text-[#c9a24b]">Switching presets will overwrite your edited Subject/Action text. Continue?</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" className={smallInputClass + " w-auto"} onClick={() => applyPreset(pendingSourceSwitch)}>
                  Overwrite
                </button>
                <button type="button" className={smallInputClass + " w-auto"} onClick={() => setPendingSourceSwitch(null)}>
                  Keep my text
                </button>
              </div>
            </div>
          )}
          {pendingRandomize && (
            <div className="rounded border border-[#4a3a1f] bg-[#1f1a10] px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-xs text-[#c9a24b]">Randomizing will overwrite your edited Subject/Action text. Continue?</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" className={smallInputClass + " w-auto"} onClick={applyRandomized}>
                  Overwrite
                </button>
                <button type="button" className={smallInputClass + " w-auto"} onClick={() => setPendingRandomize(false)}>
                  Keep my text
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#6e767d]">Subject</label>
            <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={2} className={fieldClass} placeholder="The subject of this test." maxLength={500} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#6e767d]">Action</label>
            <textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2} className={fieldClass} placeholder="What the subject is doing." maxLength={1000} />
          </div>
        </div>
        </Collapsible>

        <div className="flex flex-col gap-2">
          <span className={sectionTitleClass}>Mode</span>
          <div className="flex gap-2">
            {(["image", "video"] as LookMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={`${segButtonBase} ${mode === m ? segButtonActive : segButtonInactive}`}
                onClick={() => handleModeChange(m)}
              >
                {m === "image" ? "Image" : "Video"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionTitleClass}>Style source</span>
          {styleOptions.length === 0 ? (
            <p className="text-xs text-[#cf7b6b]">
              This Project has no Working Draft and no Published Style version yet — generation is blocked until one exists.
            </p>
          ) : (
            <select value={styleSourceKey ?? ""} onChange={(e) => setStyleSourceKey(e.target.value)} className={smallInputClass}>
              {styleOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionTitleClass}>Workflow ({mode})</span>
          {compatibleWorkflows.length === 0 ? (
            <p className="text-xs text-[#cf7b6b]">No {mode} workflows available in the library.</p>
          ) : (
            <select value={workflowId ?? ""} onChange={(e) => handleWorkflowSelect(Number(e.target.value))} className={smallInputClass}>
              {compatibleWorkflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionTitleClass}>Reference Board ({selectedReferenceIds.length}/12)</span>
          {references.length === 0 ? (
            <p className="text-xs text-[#6e767d]">No Reference Board images yet.</p>
          ) : (
            <ImageSourcePicker
              items={references.map((v) => ({ id: String(v.reference.id), imagePath: v.reference.imagePath, label: v.reference.label ?? "Reference" }))}
              selectedId=""
              onSelect={(id) => toggleReference(Number(id))}
            />
          )}
          {selectedReferenceIds.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[10px] text-[#6e767d]">Selected order</span>
              {selectedReferenceIds.map((id, idx) => {
                const view = referenceById.get(id);
                return (
                  <div key={id} className="flex items-center gap-2 text-xs text-[#a4abb2] border border-[#2c3035] rounded px-2 py-1">
                    <span className="font-mono text-[#6e767d]">{idx + 1}</span>
                    <span className="flex-1 truncate">{view?.reference.label ?? `Reference ${id}`}</span>
                    <button type="button" className="text-[#6e767d] hover:text-[#a4abb2]" disabled={idx === 0} onClick={() => moveReference(id, "up")}>
                      ↑
                    </button>
                    <button type="button" className="text-[#6e767d] hover:text-[#a4abb2]" disabled={idx === selectedReferenceIds.length - 1} onClick={() => moveReference(id, "down")}>
                      ↓
                    </button>
                    <button type="button" className="text-[#6e767d] hover:text-[#cf7b6b]" onClick={() => toggleReference(id)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {parsedWorkflow && ordinaryImageInputs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={sectionTitleClass}>Ordinary image mapping</span>
            {ordinaryImageInputs.map((input) => (
              <div key={input.nodeId} className="flex items-center gap-2">
                <span className="text-xs text-[#a4abb2] w-40 truncate" title={input.label}>
                  {input.label}
                </span>
                <select
                  className={smallInputClass}
                  value={imageAssignments[input.nodeId] ?? ""}
                  onChange={(e) => {
                    const nextRefId = e.target.value === "" ? null : Number(e.target.value);
                    // Codex retake round 1 (P1) — dedupes against every other
                    // node so the same reference can never end up assigned to
                    // two ordinary image nodes at once (see
                    // computeImageAssignmentUpdate's doc comment).
                    setImageAssignments((prev) => computeImageAssignmentUpdate(prev, input.nodeId, nextRefId));
                  }}
                >
                  <option value="">Unassigned</option>
                  {selectedReferences.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label ?? `Reference ${r.id}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {batchInfo.kind === "ready" && (
          <div className="flex flex-col gap-1">
            <span className={sectionTitleClass}>Dynamic Batch ({batchInfo.batchTitle})</span>
            {remainingReferences.length === 0 ? (
              <p className="text-xs text-[#6e767d]">No references routed to Dynamic Batch — every selected reference is assigned above.</p>
            ) : (
              <p className="text-xs text-[#a4abb2]">
                {remainingReferences.length} reference(s) will be cloned into this Dynamic Batch, in selected order:{" "}
                {remainingReferences.map((r) => r.label ?? `#${r.id}`).join(" → ")}
              </p>
            )}
          </div>
        )}
        {batchInfo.kind === "error" && <p className="text-xs text-[#cf7b6b]">Dynamic Batch detection error: {batchInfo.message}</p>}

        {textInputs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={sectionTitleClass}>Text overrides (optional)</span>
            {textInputs.map((input) => (
              <div key={input.nodeId} className="flex flex-col gap-1 border border-[#2c3035] rounded p-2">
                <label className="flex items-center gap-2 text-xs text-[#a4abb2]">
                  <input
                    type="checkbox"
                    checked={textOverrideEnabled[input.nodeId] ?? false}
                    onChange={(e) => setTextOverrideEnabled((prev) => ({ ...prev, [input.nodeId]: e.target.checked }))}
                  />
                  Override &quot;{input.label}&quot; (default: compiled Look prompt)
                </label>
                {textOverrideEnabled[input.nodeId] && (
                  <textarea
                    value={textOverrideValue[input.nodeId] ?? ""}
                    onChange={(e) => setTextOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))}
                    rows={2}
                    className={fieldClass}
                    maxLength={20000}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {scalarInputs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={sectionTitleClass}>Scalar / select / seed overrides (optional)</span>
            {scalarInputs.map((input) => (
              <div key={input.nodeId} className="flex items-center gap-2">
                <span className="text-xs text-[#a4abb2] w-40 truncate" title={input.label}>
                  {input.label}
                </span>
                {input.kind === "select" && input.inputOptions ? (
                  <select
                    className={smallInputClass}
                    value={scalarOverrideValue[input.nodeId] ?? input.defaultValue ?? ""}
                    onChange={(e) => setScalarOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))}
                  >
                    {input.inputOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={smallInputClass}
                    value={scalarOverrideValue[input.nodeId] ?? input.defaultValue ?? ""}
                    onChange={(e) => setScalarOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))}
                    maxLength={500}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Prompt & Style preview ─────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <SectionHeading>Prompt &amp; Style preview</SectionHeading>

        {/* STYLE.1.POLISH.1 (C3) — the separate "Test content" preview here
            was redundant with "Compiled Look prompt" below; removed rather
            than maintaining a second representation. Selected Style stays. */}
        <div className="flex flex-col gap-1">
          <span className={sectionTitleClass}>Selected Style</span>
          <pre className="text-[10px] text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 max-h-40 overflow-auto">
            {selectedStyleOption?.compiledText || "(none)"}
          </pre>
        </div>

        <div className="flex flex-col gap-1">
          <span className={sectionTitleClass}>Compiled Look prompt</span>
          <pre className="text-xs text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-3">
            {compiledPrompt?.prompt || "(nothing compiled yet)"}
          </pre>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-[#a4abb2]">
          <span>
            Workflow: <span className="text-[#e7e9ec]">{selectedWorkflow?.name ?? "(none)"}</span>
          </span>
          <span>
            Mode: <span className="text-[#e7e9ec]">{mode}</span>
          </span>
          <span>
            References: <span className="text-[#e7e9ec]">{selectedReferenceIds.length}</span>
          </span>
        </div>

        {diagnostics.length > 0 && (
          <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 flex flex-col gap-1">
            {diagnostics.map((d, i) => (
              <p key={i} className="text-xs text-[#cf7b6b]">
                {d}
              </p>
            ))}
          </div>
        )}

        {buildPreview?.ok && (
          <details className="rounded border border-[#232629]">
            <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[#6e767d] hover:text-[#a4abb2] transition-colors">
              Node mappings, overrides &amp; warnings
            </summary>
            <div className="border-t border-[#232629] px-3 py-2 flex flex-col gap-2 text-xs text-[#a4abb2]">
              {buildPreview.patch.patches.map((p, i) => (
                <p key={i}>
                  {p.kind} → node {p.nodeId} ({p.label})
                </p>
              ))}
              {buildPreview.patch.warnings.map((w, i) => (
                <p key={`w-${i}`} className="text-[#c9a24b]">
                  {w}
                </p>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── Generation ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <SectionHeading>Generation</SectionHeading>

        {activePendingConfirmation && (
          <div className="rounded border border-[#3d3320] bg-[#1a1712] px-3 py-2 flex flex-col gap-2">
            <p className="text-xs text-[#c9a24b]">
              This will call paid Comfy Cloud Partner Node(s): {activePendingConfirmation.apiNodeClasses.join(", ")}. Continue and incur cost?
            </p>
            <div className="flex gap-2">
              <button type="button" className={buttonClass} disabled={submitting} onClick={handleConfirmPartnerNode}>
                Confirm and Generate
              </button>
              <button type="button" className={buttonClass} disabled={submitting} onClick={handleCancelPartnerNode}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!activePendingConfirmation && (
          <button type="button" className={buttonClass} disabled={!canGenerate || submitting} onClick={handleGenerate}>
            {submitting ? "Submitting…" : "Generate Look Test"}
          </button>
        )}

        {refreshWarning && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-[#c9a24b]">{refreshWarning}</p>
            <button type="button" className={buttonClass} onClick={handleRetryListSync}>
              Retry sync
            </button>
          </div>
        )}

        {activeJobId !== null && (
          <div className="flex flex-col gap-3 border-t border-[#232629] pt-3">
            <GenerationJobStatusPanel jobId={activeJobId} onStatusChange={handleActiveJobStatusChange} />
            {jobStatus?.status === "done" && (
              <div className="flex flex-col gap-2">
                {publishedResult ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-[#6b9e72]">Look Result saved.</p>
                    {publishedResult.filePath.match(/\.(mp4|webm|mov)$/i) ? (
                      <video src={refImageUrl(publishedResult.filePath)} controls className="max-w-full rounded border border-[#2c3035]" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={refImageUrl(publishedResult.filePath)} alt="Look Result" className="max-w-full rounded border border-[#2c3035]" />
                    )}
                  </div>
                ) : (
                  <button type="button" className={buttonClass} disabled={publishing} onClick={handleSaveLookResult}>
                    {publishing ? "Saving…" : "Save Look Result"}
                  </button>
                )}
                {publishError && <p className="text-xs text-[#cf7b6b]">{publishError}</p>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Comparison ──────────────────────────────────────────────── */}
      {comparisonIds.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeading>Comparison</SectionHeading>
          <LookDevelopmentComparisonGrid
            lookTestIds={comparisonIds}
            onOpen={handleOpenTest}
            workflowNameById={workflowNameById}
            refreshToken={comparisonRefreshToken}
            onClear={handleClearComparison}
            onRemove={handleToggleComparison}
          />
        </section>
      )}

      {/* ── Recent Look Tests ───────────────────────────────────────── */}
      {/* STYLE.1.POLISH.1 (C4) — closed by default, but `LookDevelopmentRecentTests`
          stays MOUNTED at all times (hidden via CSS only): it owns the
          multi-rerun registry, pollers, publication state and Close/reopen
          resumption. `Collapsible` (which unmounts its children) is never
          used here — that would destroy all of it on every close. */}
      <section className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setRecentTestsOpen((v) => !v)}
          aria-expanded={recentTestsOpen}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#e7e9ec] border-b border-[#232629] pb-2 w-full text-left"
        >
          <span className={`transition-transform ${recentTestsOpen ? "rotate-90" : ""}`}>›</span>
          Recent Look Tests
        </button>
        <div className={recentTestsOpen ? undefined : "hidden"}>
          <LookDevelopmentRecentTests
            projectId={projectId}
            tests={tests}
            onOpen={handleOpenTest}
            workflowNameById={workflowNameById}
            workflows={initialWorkflows}
            allReferences={initialReferences}
            styleOptions={styleOptions}
            comparisonIds={comparisonIds}
            onToggleComparison={handleToggleComparison}
            onNotesSaved={handleNotesSaved}
            onStatusChanged={handleStatusChanged}
            onDeleted={handleResultDeleted}
            onDuplicated={handleDuplicated}
            onQueued={handleRerunQueued}
            onPublished={handleRerunPublished}
          />
        </div>
      </section>
    </div>
  );
}
