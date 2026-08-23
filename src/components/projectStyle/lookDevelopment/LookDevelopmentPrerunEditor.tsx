"use client";

// ---------------------------------------------------------------------------
// LookDevelopmentPrerunEditor.tsx — STYLE.1.G.UI.2
//
// Configure-and-run surface for a pre-run Look Test definition (created by
// `duplicateLookTestAction`, or reopened after navigation/reload before it
// was ever run). Source, mode, subject, action and workflow are frozen and
// displayed read-only; only Style source, reference selection/order,
// mappings and supported overrides may be changed. The preview and the
// queued request are built from the SAME pure helpers UI.1 uses
// (parseComfyWorkflow, detectDynamicBatchUiInfo, resolveLookWorkflowInputSelections,
// buildGenerationPayload, compileLookPrompt) — never a second patcher. The
// relaunch calls `runExistingLookTestAction` only, and reuses the exact same
// frozen-fingerprint Partner Node gate contract as the main Bench (UI.1):
// no opt-in in SSR HTML, any relevant edit invalidates a pending
// confirmation, Cancel creates no job, double-submit is impossible.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import { runExistingLookTestAction, publishLookResultAction, type RunExistingLookTestInput } from "@/actions/lookDevelopment";
import {
  isValidLookWorkflowInputSelections,
  type LookMode,
  type LookStyleSourceKind,
  type LookStyleSourceRequest,
  type LookTestSource,
  type LookWorkflowInputSelections,
} from "@/lib/lookDevelopment/contracts";
import { compileLookPrompt } from "@/lib/lookDevelopment/compileLookPrompt";
import { resolveLookWorkflowInputSelections } from "@/lib/lookDevelopment/resolveWorkflowInputSelections";
import { restoreLookTestSnapshotSelections } from "@/lib/lookDevelopment/restoreLookTestSnapshotSelections";
import type { ResolvedLookReference } from "@/lib/lookDevelopment/resolveLookReferences";
import { parseComfyWorkflow, type WorkflowInput } from "@/lib/comfy/parseWorkflow";
import { buildGenerationPayload, detectDynamicBatchUiInfo } from "@/lib/comfy/buildGenerationPayload";
import type { RuntimeImageOption } from "@/lib/comfy/mapWorkflowInputs";
import type { GenerationSnapshot } from "@/lib/comfy/generationSnapshot";
import ImageSourcePicker from "@/components/ImageSourcePicker";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import { refImageUrl } from "@/lib/refImageUrl";
import { computeImageAssignmentUpdate } from "./LookDevelopmentBench";

type WorkflowRow = { id: number; name: string; kind: "image" | "video"; workflowJson: string };
type StyleSourceOption = { key: string; label: string; request: LookStyleSourceRequest; compiledText: string };

const SCALAR_KINDS = new Set<WorkflowInput["kind"]>(["integer", "float", "boolean", "select", "seed", "string"]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildRerunFingerprint(request: RunExistingLookTestInput): string {
  const { confirmPartnerNodeCost: _ignored, ...rest } = request;
  void _ignored;
  return stableStringify(rest);
}

type Props = {
  projectId: number;
  lookTestId: number;
  // WF.DETACH.1 — null once this Look Test's workflow has been deleted
  // (detached). `workflow` is then also null (see the caller's lookup by
  // this id), and `diagnostics` below already refuses Run in that case.
  frozen: { source: LookTestSource; mode: LookMode; subject: string; action: string; workflowId: number | null };
  workflow: WorkflowRow | null;
  allReferences: ProjectStyleReferenceView[];
  initialReferenceIds: number[];
  styleOptions: StyleSourceOption[];
  /** The duplicate's OWN frozen Style identity (from `lookTests.styleSourceKind`/`styleDraftRevision`/`styleVersionId`) — the selector must start on this exact source, never an arbitrary default. */
  initialStyleSourceKind: LookStyleSourceKind;
  initialStyleDraftRevision: number | null;
  initialStyleVersionId: number | null;
  restoreSourceContext: { sourceLookTestId: number; snapshot: GenerationSnapshot | null } | null;
  /**
   * Codex Round 3 (P1, "queuedJobId stays local to the child, lost on
   * remount") — the job id of an ALREADY-queued rerun for this exact Look
   * Test, known by the parent orchestration (`LookDevelopmentRecentTests`)
   * across a Close -> open-a-different-row -> reopen cycle that fully
   * unmounts/remounts this component. When set, this component starts
   * DIRECTLY on the poll/publish view for that job — the pre-run
   * configuration form and `Run` never reappear for a Look Test that
   * already has a submitted job. `null` for a genuine not-yet-run
   * definition (fresh duplicate, or one reopened after navigation/reload
   * before ever being run).
   */
  resumeJobId: number | null;
  onQueued: (lookTestId: number, jobId: number) => void;
  onPublished: (lookTestId: number, resultId: number, filePath: string, generationJobId: number) => void;
  onCancelEditing?: () => void;
};

export default function LookDevelopmentPrerunEditor({
  projectId,
  lookTestId,
  frozen,
  workflow,
  allReferences,
  initialReferenceIds,
  styleOptions,
  initialStyleSourceKind,
  initialStyleDraftRevision,
  initialStyleVersionId,
  restoreSourceContext,
  resumeJobId,
  onQueued,
  onPublished,
  onCancelEditing,
}: Props) {
  // The duplicate's own frozen Style identity — never `styleOptions[0]`, and
  // for Working Draft never just the CURRENT draft: Codex Round 2 — a test
  // duplicated from Working Draft revision N must reopen against that EXACT
  // revision, not silently against whatever revision M the draft has become
  // since. `frozenSourceAvailable` is true only when a real, matching option
  // exists today (kind AND revision/versionId, never kind alone).
  const frozenSourceAvailable = useMemo(() => {
    if (initialStyleSourceKind === "working-draft") {
      const draftOption = styleOptions.find((o) => o.key === "working-draft");
      return draftOption !== undefined && draftOption.request.kind === "working-draft" && draftOption.request.expectedRevision === initialStyleDraftRevision;
    }
    return styleOptions.some((o) => o.request.kind === "published-version" && o.request.versionId === initialStyleVersionId);
  }, [initialStyleSourceKind, initialStyleDraftRevision, initialStyleVersionId, styleOptions]);

  const initialStyleKey = useMemo(() => {
    if (!frozenSourceAvailable) return null;
    return initialStyleSourceKind === "working-draft" ? "working-draft" : `version-${initialStyleVersionId}`;
  }, [frozenSourceAvailable, initialStyleSourceKind, initialStyleVersionId]);

  const [styleSourceKey, setStyleSourceKey] = useState<string | null>(initialStyleKey);
  const selectedStyleOption = styleOptions.find((o) => o.key === styleSourceKey) ?? null;
  // True only while the user has NOT yet made an explicit choice AND the
  // frozen source doesn't (or no longer) match a real option — blocks Run
  // via the diagnostic below instead of silently running against a
  // different Working Draft revision or falling back to any other option.
  const frozenStyleSourceMissing = !frozenSourceAvailable && styleSourceKey === initialStyleKey;

  const [selectedReferenceIds, setSelectedReferenceIds] = useState<number[]>(initialReferenceIds);
  const [imageAssignments, setImageAssignments] = useState<Record<string, number | null>>({});
  const [textOverrideEnabled, setTextOverrideEnabled] = useState<Record<string, boolean>>({});
  const [textOverrideValue, setTextOverrideValue] = useState<Record<string, string>>({});
  const [scalarOverrideValue, setScalarOverrideValue] = useState<Record<string, string>>({});
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const referenceById = useMemo(() => new Map(allReferences.map((r) => [r.reference.id, r])), [allReferences]);

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
    setSelectedReferenceIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : prev.length >= 12 ? prev : [...prev, id]));
    setImageAssignments((prev) => {
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

  const parsedWorkflow = useMemo(() => (workflow ? parseComfyWorkflow(workflow.workflowJson) : null), [workflow]);
  const batchInfo = useMemo(() => (workflow ? detectDynamicBatchUiInfo(workflow.workflowJson) : { kind: "none" as const }), [workflow]);
  const imageInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => i.kind === "image") ?? [], [parsedWorkflow]);
  const textInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => i.kind === "text") ?? [], [parsedWorkflow]);
  const scalarInputs = useMemo(() => parsedWorkflow?.inputs.filter((i) => SCALAR_KINDS.has(i.kind)) ?? [], [parsedWorkflow]);
  const templateChainNodeIds = useMemo(() => new Set(batchInfo.kind === "ready" ? batchInfo.templateChainNodeIds : []), [batchInfo]);
  const ordinaryImageInputs = useMemo(() => imageInputs.filter((i) => !templateChainNodeIds.has(i.nodeId)), [imageInputs, templateChainNodeIds]);

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

  const handleRestorePriorSettings = useCallback(() => {
    if (!restoreSourceContext || !workflow) return;
    const restored = restoreLookTestSnapshotSelections({
      snapshot: restoreSourceContext.snapshot,
      expectedContextId: restoreSourceContext.sourceLookTestId,
      // `workflow` is non-null here (guarded above), which is exactly the
      // "still exists" case where `frozen.workflowId` is guaranteed
      // non-null too — reading it off `workflow` itself sidesteps that
      // without a redundant null check.
      expectedWorkflowId: workflow.id,
      availableReferenceIds: selectedReferenceIds,
      workflowInputs: parsedWorkflow?.inputs ?? [],
      batchInfo,
    });
    if (!restored.ok) {
      setRestoreMessage(restored.reason);
      return;
    }
    const nextAssignments: Record<string, number | null> = {};
    for (const a of restored.selections.imageAssignments ?? []) nextAssignments[a.nodeId] = a.referenceId;
    setImageAssignments(nextAssignments);
    const batchOrder = restored.selections.dynamicBatchReferenceIds ?? [];
    const assignedSet = new Set(Object.values(nextAssignments).filter((v): v is number => v !== null));
    setSelectedReferenceIds((prev) => {
      const rest = prev.filter((id) => !assignedSet.has(id) && !batchOrder.includes(id));
      return [...prev.filter((id) => assignedSet.has(id)), ...batchOrder, ...rest];
    });
    const nextTextEnabled: Record<string, boolean> = {};
    for (const nodeId of restored.textOverrideEnabledNodeIds) nextTextEnabled[nodeId] = true;
    setTextOverrideEnabled(nextTextEnabled);
    setTextOverrideValue(restored.selections.textOverrideByNodeId ?? {});
    setScalarOverrideValue(restored.selections.scalarOverrideByNodeId ?? {});
    setRestoreMessage("Prior settings restored.");
  }, [restoreSourceContext, workflow, selectedReferenceIds, parsedWorkflow, batchInfo]);

  const compiledPrompt = useMemo(() => {
    if (!selectedStyleOption) return null;
    return compileLookPrompt({ subject: frozen.subject, action: frozen.action, styleCompiledText: selectedStyleOption.compiledText, references: selectedReferences });
  }, [frozen.subject, frozen.action, selectedStyleOption, selectedReferences]);

  const mappingResolution = useMemo(() => {
    if (!parsedWorkflow) return null;
    return resolveLookWorkflowInputSelections({ inputs: parsedWorkflow.inputs, batchInfo, references: selectedReferences, selections: workflowInputSelections });
  }, [parsedWorkflow, batchInfo, selectedReferences, workflowInputSelections]);

  const buildPreview = useMemo(() => {
    if (!workflow || !parsedWorkflow || !mappingResolution?.ok || !compiledPrompt) return null;
    const availableImages: RuntimeImageOption[] = selectedReferences.map((ref) => ({ id: `look-ref-${ref.id}`, source: "board" as const, imagePath: ref.imagePath, label: ref.label ?? "Reference", role: null }));
    return buildGenerationPayload({
      workflowJson: workflow.workflowJson,
      inputs: parsedWorkflow.inputs,
      suggestedText: compiledPrompt.prompt,
      availableImages,
      selectedImageByNodeId: mappingResolution.result.selectedImageByNodeId,
      batchSelectedImages: mappingResolution.result.batchSelectedImages,
      textOverrideByNodeId: mappingResolution.result.textOverrideByNodeId,
      scalarOverrideByNodeId: mappingResolution.result.scalarOverrideByNodeId,
    });
  }, [workflow, parsedWorkflow, mappingResolution, compiledPrompt, selectedReferences]);

  const diagnostics: string[] = useMemo(() => {
    const list: string[] = [];
    if (!workflow) list.push("Original workflow is no longer available.");
    if (frozenStyleSourceMissing) list.push("The original Style source used for this Look Test is no longer available — choose one explicitly before running.");
    else if (!selectedStyleOption) list.push("No usable Style source is available for this Project.");
    if (!isValidLookWorkflowInputSelections(workflowInputSelections)) list.push("The current reference mapping is contradictory — adjust it before running.");
    if (mappingResolution && !mappingResolution.ok) list.push(mappingResolution.error);
    if (buildPreview && !buildPreview.ok) list.push(buildPreview.error);
    if (buildPreview?.ok && buildPreview.displayMappings.some((m) => m.mappingKind === "video")) list.push("This workflow requires a video input, which is not supported yet.");
    if (buildPreview?.ok && !buildPreview.patch.patches.some((p) => p.kind === "text")) list.push("This workflow has no compatible text input.");
    return list;
  }, [workflow, selectedStyleOption, frozenStyleSourceMissing, mappingResolution, buildPreview, workflowInputSelections]);

  const canRun = diagnostics.length === 0 && selectedStyleOption !== null;

  // ── Run ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Codex Round 3 — seeded from `resumeJobId` so a remount (Close -> open a
  // different row -> reopen this one) resumes DIRECTLY on the poll/publish
  // view for the already-known job, instead of losing it and falling back
  // to the pre-run configuration form (which would only hit a CORE refusal:
  // this Look Test already has a job).
  const [queuedJobId, setQueuedJobId] = useState<number | null>(resumeJobId);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ fingerprint: string; request: RunExistingLookTestInput; apiNodeClasses: string[] } | null>(null);

  const liveRequest: RunExistingLookTestInput | null = useMemo(() => {
    if (!selectedStyleOption) return null;
    return {
      projectId,
      lookTestId,
      styleSource: selectedStyleOption.request,
      referenceImageIds: selectedReferenceIds.length > 0 ? selectedReferenceIds : undefined,
      workflowInputSelections,
      confirmPartnerNodeCost: false,
    };
  }, [selectedStyleOption, projectId, lookTestId, selectedReferenceIds, workflowInputSelections]);

  const liveFingerprint = useMemo(() => (liveRequest ? buildRerunFingerprint(liveRequest) : null), [liveRequest]);
  const activePendingConfirmation = pendingConfirmation && pendingConfirmation.fingerprint === liveFingerprint ? pendingConfirmation : null;

  const submitRunLockRef = useRef(false);

  const submitRun = useCallback(
    async (request: RunExistingLookTestInput) => {
      try {
        const result = await runExistingLookTestAction(request);
        if (result.ok) {
          setPendingConfirmation(null);
          setQueuedJobId(result.jobId);
          onQueued(lookTestId, result.jobId);
        } else if (result.requiresPartnerNodeConfirmation) {
          setPendingConfirmation({ fingerprint: buildRerunFingerprint(request), request, apiNodeClasses: result.apiNodeClasses ?? [] });
        } else {
          setError(result.error);
        }
      } catch {
        setError("Failed to submit this run. Check your connection and try again — your configuration was not cleared.");
      }
    },
    [onQueued, lookTestId]
  );

  const handleRun = useCallback(async () => {
    if (submitRunLockRef.current) return;
    if (!liveRequest) return;
    submitRunLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitRun(liveRequest);
    } finally {
      submitRunLockRef.current = false;
      setSubmitting(false);
    }
  }, [liveRequest, submitRun, submitRunLockRef]);

  const handleConfirm = useCallback(async () => {
    if (submitRunLockRef.current) return;
    if (!activePendingConfirmation) return;
    const request = { ...activePendingConfirmation.request, confirmPartnerNodeCost: true };
    submitRunLockRef.current = true;
    setPendingConfirmation(null);
    setSubmitting(true);
    setError(null);
    try {
      await submitRun(request);
    } finally {
      submitRunLockRef.current = false;
      setSubmitting(false);
    }
  }, [activePendingConfirmation, submitRun, submitRunLockRef]);

  const handleCancel = useCallback(() => setPendingConfirmation(null), []);

  // ── Publish — reuses the exact CORE `publishLookResultAction` and the same
  // job-status polling panel as the main Bench (UI.1); no second poller or
  // publisher. Idempotent server-side (UNIQUE `generation_job_id`), so a
  // retry after a failed publish attempt is safe and is never a "replay of
  // an already-succeeded mutation" — it is the SAME not-yet-succeeded call.
  const [jobStatus, setJobStatus] = useState<{ status: string; outputPath: string | null } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publishLockRef = useRef(false);
  const [publishedResult, setPublishedResult] = useState<{ resultId: number; filePath: string } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handleSaveLookResult = useCallback(async () => {
    if (queuedJobId === null) return;
    if (publishLockRef.current) return;
    publishLockRef.current = true;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishLookResultAction(projectId, lookTestId, queuedJobId);
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      setPublishedResult({ resultId: result.resultId, filePath: result.filePath });
      onPublished(lookTestId, result.resultId, result.filePath, queuedJobId);
    } catch {
      setPublishError("Failed to save the Look Result. Check your connection and try again — click Save Look Result to retry.");
    } finally {
      publishLockRef.current = false;
      setPublishing(false);
    }
  }, [projectId, lookTestId, queuedJobId, onPublished]);

  if (queuedJobId !== null) {
    return (
      <div className="flex flex-col gap-3 border-t border-[#232629] pt-2">
        <GenerationJobStatusPanel jobId={queuedJobId} onStatusChange={setJobStatus} />
        {jobStatus?.status === "done" && (
          <div className="flex flex-col gap-2">
            {publishedResult ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] text-[#6b9e72]">Look Result saved.</p>
                {publishedResult.filePath.match(/\.(mp4|webm|mov)$/i) ? (
                  <video src={refImageUrl(publishedResult.filePath)} controls className="max-w-full rounded border border-[#2c3035]" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={refImageUrl(publishedResult.filePath)} alt="Look Result" className="max-w-full rounded border border-[#2c3035]" />
                )}
              </div>
            ) : (
              <button
                type="button"
                className="rounded border border-[#2c3035] px-3 py-1.5 text-xs text-[#a4abb2] hover:border-[#3a4046] disabled:opacity-40 disabled:cursor-not-allowed self-start"
                disabled={publishing}
                onClick={handleSaveLookResult}
              >
                {publishing ? "Saving…" : "Save Look Result"}
              </button>
            )}
            {publishError && <p className="text-[10px] text-[#cf7b6b]">{publishError}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[#232629] pt-2">
      <div className="flex flex-wrap gap-3 text-[10px] text-[#6e767d]">
        <span>Source: {frozen.source}</span>
        <span>Mode: {frozen.mode}</span>
        <span>Subject: {frozen.subject}</span>
        <span>Action: {frozen.action}</span>
        <span>Workflow: {workflow?.name ?? (frozen.workflowId !== null ? `#${frozen.workflowId}` : "deleted")}</span>
      </div>

      {restoreSourceContext && (
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2]" onClick={handleRestorePriorSettings}>
            Restore prior settings
          </button>
          {restoreMessage && <span className="text-[10px] text-[#a4abb2]">{restoreMessage}</span>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-[#6e767d]">Style source</span>
        {styleOptions.length === 0 ? (
          <p className="text-xs text-[#cf7b6b]">No usable Style source is available.</p>
        ) : (
          <select value={styleSourceKey ?? ""} onChange={(e) => setStyleSourceKey(e.target.value)} className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 w-full">
            {frozenStyleSourceMissing && (
              <option value="" disabled>
                — Select a Style source (original is no longer available) —
              </option>
            )}
            {styleOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-[#6e767d]">Reference Board ({selectedReferenceIds.length}/12)</span>
        <ImageSourcePicker items={allReferences.map((v) => ({ id: String(v.reference.id), imagePath: v.reference.imagePath, label: v.reference.label ?? "Reference" }))} selectedId="" onSelect={(id) => toggleReference(Number(id))} />
        {selectedReferenceIds.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {selectedReferenceIds.map((id, idx) => {
              const view = referenceById.get(id);
              return (
                <div key={id} className="flex items-center gap-2 text-[10px] text-[#a4abb2] border border-[#2c3035] rounded px-2 py-1">
                  <span className="font-mono text-[#6e767d]">{idx + 1}</span>
                  <span className="flex-1 truncate">{view?.reference.label ?? `Reference ${id}`}</span>
                  <button type="button" disabled={idx === 0} onClick={() => moveReference(id, "up")}>↑</button>
                  <button type="button" disabled={idx === selectedReferenceIds.length - 1} onClick={() => moveReference(id, "down")}>↓</button>
                  <button type="button" onClick={() => toggleReference(id)}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {parsedWorkflow && ordinaryImageInputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#6e767d]">Ordinary image mapping</span>
          {ordinaryImageInputs.map((input) => (
            <div key={input.nodeId} className="flex items-center gap-2">
              <span className="text-[10px] text-[#a4abb2] w-32 truncate">{input.label}</span>
              <select
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 w-full"
                value={imageAssignments[input.nodeId] ?? ""}
                onChange={(e) => {
                  const nextRefId = e.target.value === "" ? null : Number(e.target.value);
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
        <p className="text-[10px] text-[#a4abb2]">
          Dynamic Batch: {remainingReferences.length} reference(s) in order: {remainingReferences.map((r) => r.label ?? `#${r.id}`).join(" → ") || "(none)"}
        </p>
      )}

      {textInputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#6e767d]">Text overrides (optional)</span>
          {textInputs.map((input) => (
            <div key={input.nodeId} className="flex flex-col gap-1 border border-[#2c3035] rounded p-2">
              <label className="flex items-center gap-2 text-[10px] text-[#a4abb2]">
                <input type="checkbox" checked={textOverrideEnabled[input.nodeId] ?? false} onChange={(e) => setTextOverrideEnabled((prev) => ({ ...prev, [input.nodeId]: e.target.checked }))} />
                Override &quot;{input.label}&quot;
              </label>
              {textOverrideEnabled[input.nodeId] && (
                <textarea value={textOverrideValue[input.nodeId] ?? ""} onChange={(e) => setTextOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))} rows={2} maxLength={20000} className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 w-full" />
              )}
            </div>
          ))}
        </div>
      )}

      {scalarInputs.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#6e767d]">Scalar / select / seed overrides (optional)</span>
          {scalarInputs.map((input) => (
            <div key={input.nodeId} className="flex items-center gap-2">
              <span className="text-[10px] text-[#a4abb2] w-32 truncate">{input.label}</span>
              {input.kind === "select" && input.inputOptions ? (
                <select className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 w-full" value={scalarOverrideValue[input.nodeId] ?? input.defaultValue ?? ""} onChange={(e) => setScalarOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))}>
                  {input.inputOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 w-full" value={scalarOverrideValue[input.nodeId] ?? input.defaultValue ?? ""} onChange={(e) => setScalarOverrideValue((prev) => ({ ...prev, [input.nodeId]: e.target.value }))} maxLength={500} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-[#6e767d]">Compiled Look prompt</span>
        <pre className="text-[10px] text-[#a4abb2] whitespace-pre-wrap font-mono bg-[#0d0e10] border border-[#2c3035] rounded p-2 max-h-32 overflow-auto">{compiledPrompt?.prompt || "(nothing compiled yet)"}</pre>
      </div>

      {diagnostics.length > 0 && (
        <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-2 py-1.5 flex flex-col gap-1">
          {diagnostics.map((d, i) => (
            <p key={i} className="text-[10px] text-[#cf7b6b]">
              {d}
            </p>
          ))}
        </div>
      )}
      {error && <p className="text-[10px] text-[#cf7b6b]">{error}</p>}

      {activePendingConfirmation ? (
        <div className="rounded border border-[#3d3320] bg-[#1a1712] px-2 py-1.5 flex flex-col gap-2">
          <p className="text-[10px] text-[#c9a24b]">This will call paid Comfy Cloud Partner Node(s): {activePendingConfirmation.apiNodeClasses.join(", ")}. Continue and incur cost?</p>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#a4abb2]" disabled={submitting} onClick={handleConfirm}>
              Confirm and Run
            </button>
            <button type="button" className="rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#a4abb2]" disabled={submitting} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-[#2c3035] px-3 py-1.5 text-xs text-[#a4abb2] hover:border-[#3a4046] disabled:opacity-40 disabled:cursor-not-allowed" disabled={!canRun || submitting} onClick={handleRun}>
            {submitting ? "Submitting…" : "Run"}
          </button>
          {onCancelEditing && (
            <button type="button" className="rounded border border-[#2c3035] px-2 py-1 text-[10px] text-[#6e767d]" onClick={onCancelEditing}>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
