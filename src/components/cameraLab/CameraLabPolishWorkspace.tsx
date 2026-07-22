"use client";

// ---------------------------------------------------------------------------
// CameraLabPolishWorkspace.tsx — CAMLAB.POLISH.1
//
// Three-column guided workspace, additive above the existing "Setup"
// section: Column 1 queues a Gaussian PLY generation, Column 2 refreshes the
// PlayCanvas viewer against Column 1's own tracked job and captures an exact
// snapshot draft, Column 3 queues a Gaussian-to-image generation from that
// draft. Every queue call goes through the canonical `runWorkflowGeneration`
// pipeline via the thin wrappers in `src/actions/cameraLabGeneration.ts` —
// no second patcher, no second job runner.
//
// Partner Node cost confirmation here uses a plain `window.confirm()` gate
// on a button `onClick` handler rather than `PartnerNodeConfirmForm`: there
// is deliberately no `<form>` anywhere in this component (Refresh/Generate
// are imperative button handlers, not form submissions), so the Enter-key
// and pre-hydration native-submit bypass classes that motivated
// `PartnerNodeConfirmForm` do not apply here — there is no native
// submission path to bypass. Without JS, these buttons do nothing at all
// (same as the rest of this WebGL-only viewer).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { refImageUrl } from "@/lib/refImageUrl";
import GenerationJobStatusPanel from "@/components/GenerationJobStatusPanel";
import ImageSourcePicker from "@/components/ImageSourcePicker";
import {
  queueGaussianPlyGeneration,
  refreshGaussianViewer,
  queueGaussianToImageGeneration,
} from "@/actions/cameraLabGeneration";
import { attachOutputAsShotReference } from "@/actions/generation";
import { LOAD_IMAGE_GAUSSIAN_LABEL, LOAD_IMAGE_LABEL, type ClassifiedNonImageInput } from "@/lib/cameraLab/workflowInputContract";

const GaussianViewerPanel = dynamic(() => import("./GaussianViewerPanel"), {
  ssr: false,
  loading: () => <p className="text-xs text-[#6e767d]">Loading Gaussian viewer…</p>,
});

type ReferenceImageOption = {
  id: number;
  imagePath: string;
  label: string | null;
  sourceFilename: string | null;
  imageRole: string | null;
};

type WorkflowRef = { id: number; name: string } | null;

type Props = {
  /** Verified server-side by the Camera Lab page — never derived client-side. */
  projectId: number;
  sequenceId: number;
  shotId: number;
  referenceImages: ReferenceImageOption[];
  gaussianPlyWorkflow: WorkflowRef;
  gaussianToImageWorkflow: WorkflowRef;
  /** CAMLAB.POLISH.1 retake round 2 — every non-image `(Input)` node of the configured Default Gaussian PLY workflow, re-derived server-side. */
  gaussianPlyNonImageInputs: ClassifiedNonImageInput[];
  /** Set instead of `gaussianPlyNonImageInputs` when the workflow's structure could not be revalidated (unparseable JSON, wrong image-input count, or an unrecognized input kind) — Column 1 must block on this, never render a silently empty control list. */
  gaussianPlyInputsError: string | null;
  /** CAMLAB.POLISH.2 — every non-image `(Input)` node of the configured Default Gaussian-to-image workflow, re-derived server-side. */
  gaussianToImageNonImageInputs: ClassifiedNonImageInput[];
  /** Set instead of `gaussianToImageNonImageInputs` when the workflow's structure could not be revalidated (unparseable JSON, wrong image-node mapping, or an unrecognized input kind) — Column 3 must block on this. */
  gaussianToImageInputsError: string | null;
  /** CAMLAB.POLISH.1 retake — feedback from `attachOutputAsShotReference`'s redirect, read server-side from the URL. */
  attachedReference: boolean;
  attachError: string | null;
};

// ---------------------------------------------------------------------------
// NonImageInputsFieldset — CAMLAB.POLISH.2
//
// Shared rendering for the "Other inputs" section of both Column 1 and
// Column 3: same controls and ergonomic conventions (textarea/number/
// boolean/select), each column keeping its own separate override state.
// ---------------------------------------------------------------------------
function NonImageInputsFieldset({
  nonImageInputs,
  textOverrideByNodeId,
  scalarOverrideByNodeId,
  onTextChange,
  onScalarChange,
  disabled,
}: {
  nonImageInputs: ClassifiedNonImageInput[];
  textOverrideByNodeId: Record<string, string>;
  scalarOverrideByNodeId: Record<string, string>;
  onTextChange: (nodeId: string, value: string) => void;
  onScalarChange: (nodeId: string, value: string) => void;
  disabled: boolean;
}) {
  if (nonImageInputs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-[#232629] pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        Other inputs ({nonImageInputs.length})
      </p>
      {nonImageInputs.map(({ input, formKind }) => {
        const nodeId = input.nodeId;
        const badge = `${input.kind} · node ${nodeId}`;
        if (formKind === "text") {
          const value = textOverrideByNodeId[nodeId] ?? input.defaultValue ?? "";
          return (
            <div key={nodeId} className="flex flex-col gap-1">
              <label className="text-[10px] text-[#6e767d]" title={badge}>
                {input.label} <span className="text-[#4b5158]">({badge})</span>
              </label>
              <textarea
                value={value}
                onChange={(e) => onTextChange(nodeId, e.target.value)}
                disabled={disabled}
                rows={2}
                className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046] resize-y"
              />
            </div>
          );
        }
        // Scalar kinds: integer, float, boolean, select, seed.
        const scalarValue = scalarOverrideByNodeId[nodeId] ?? input.defaultValue ?? "";
        return (
          <div key={nodeId} className="flex flex-col gap-1">
            <label className="text-[10px] text-[#6e767d]" title={badge}>
              {input.label} <span className="text-[#4b5158]">({badge})</span>
            </label>
            {input.kind === "boolean" ? (
              <select
                value={scalarValue === "true" ? "true" : "false"}
                onChange={(e) => onScalarChange(nodeId, e.target.value)}
                disabled={disabled}
                className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : input.kind === "select" && input.inputOptions ? (
              <select
                value={scalarValue}
                onChange={(e) => onScalarChange(nodeId, e.target.value)}
                disabled={disabled}
                className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                {input.inputOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                step={input.kind === "float" ? "any" : "1"}
                value={scalarValue}
                onChange={(e) => onScalarChange(nodeId, e.target.value)}
                disabled={disabled}
                className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

type RefreshedViewer = {
  jobId: number;
  plyUrl: string;
  plyFilename: string;
  sourceImagePath: string;
  sourceReferenceId: number;
  sourceLabel: string;
};

type SnapshotDraft = { objectUrl: string; width: number; height: number };

function refLabel(ref: ReferenceImageOption): string {
  return ref.label ?? ref.sourceFilename ?? `Reference #${ref.id}`;
}

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

async function confirmPartnerNodeAndRetry<T extends { ok: boolean; error?: string; requiresPartnerNodeConfirmation?: boolean; apiNodeClasses?: string[] }>(
  call: (confirmPartnerNodeCost?: boolean) => Promise<T>
): Promise<T> {
  const first = await call(undefined);
  if (first.ok || !first.requiresPartnerNodeConfirmation) return first;
  const proceed = window.confirm(
    `This workflow calls paid Comfy Cloud Partner Node(s): ${(first.apiNodeClasses ?? []).join(", ")}. Continue?`
  );
  if (!proceed) {
    return { ...first, error: "Cancelled — Partner Node cost not confirmed." };
  }
  return call(true);
}

/** Measures the refreshed source image's intrinsic resolution and mounts the viewer, mirroring CameraLabWorkspace's own dimension-measuring step for the legacy flow. */
function RefreshedViewerColumn({
  projectId,
  sequenceId,
  shotId,
  refreshed,
  onSnapshotChange,
}: {
  projectId: number;
  sequenceId: number;
  shotId: number;
  refreshed: RefreshedViewer;
  onSnapshotChange: (snapshot: SnapshotDraft | null) => void;
}) {
  const [dims, setDims] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; width: number; height: number }>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    setDims({ status: "loading" });
    const url = refImageUrl(refreshed.sourceImagePath);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDims({ status: "ready", width: img.naturalWidth, height: img.naturalHeight });
      } else {
        setDims({ status: "error" });
      }
    };
    img.onerror = () => {
      if (!cancelled) setDims({ status: "error" });
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
  }, [refreshed.sourceImagePath]);

  if (dims.status === "loading") {
    return <p className="text-xs text-[#6e767d]">Reading source image dimensions…</p>;
  }
  if (dims.status === "error") {
    return (
      <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
        The refreshed source image could not be loaded.
      </p>
    );
  }

  return (
    <GaussianViewerPanel
      key={`${refreshed.jobId}-${refreshed.sourceReferenceId}`}
      projectId={projectId}
      sequenceId={sequenceId}
      shotId={shotId}
      jobId={refreshed.jobId}
      refId={refreshed.sourceReferenceId}
      plyUrl={refreshed.plyUrl}
      plyLabel={`Job #${refreshed.jobId} — ${refreshed.plyFilename}`}
      sourceImageLabel={refreshed.sourceLabel}
      sourceWidth={dims.width}
      sourceHeight={dims.height}
      onSnapshotChange={onSnapshotChange}
    />
  );
}

export default function CameraLabPolishWorkspace({
  projectId,
  sequenceId,
  shotId,
  referenceImages,
  gaussianPlyWorkflow,
  gaussianToImageWorkflow,
  gaussianPlyNonImageInputs,
  gaussianPlyInputsError,
  gaussianToImageNonImageInputs,
  gaussianToImageInputsError,
  attachedReference,
  attachError,
}: Props) {
  // ── Column 1 — Generate Gaussian PLY ────────────────────────────────────
  const cameraLabPath = `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/camera-lab`;
  const uploadSourceHref = `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/reference-images/new?returnTo=${encodeURIComponent(cameraLabPath)}`;
  const [sourceReferenceId, setSourceReferenceId] = useState<number | null>(referenceImages[0]?.id ?? null);
  const [col1JobId, setCol1JobId] = useState<number | null>(null);
  const [col1Submitting, setCol1Submitting] = useState(false);
  const [col1Error, setCol1Error] = useState<string | null>(null);
  // CAMLAB.POLISH.1 retake round 2 — non-image `(Input)` node drafts. Only
  // populated once the user actually changes a value away from its
  // workflow default; an absent key means "use the workflow's own
  // default", never an explicitly-sent empty override.
  const [textOverrideByNodeId, setTextOverrideByNodeId] = useState<Record<string, string>>({});
  const [scalarOverrideByNodeId, setScalarOverrideByNodeId] = useState<Record<string, string>>({});

  const handleGeneratePly = useCallback(async () => {
    if (!gaussianPlyWorkflow || sourceReferenceId === null) return;
    setCol1Submitting(true);
    setCol1Error(null);
    const result = await confirmPartnerNodeAndRetry((confirmPartnerNodeCost) =>
      queueGaussianPlyGeneration({
        projectId,
        sequenceId,
        shotId,
        sourceReferenceId,
        textOverrideByNodeId: Object.keys(textOverrideByNodeId).length > 0 ? textOverrideByNodeId : undefined,
        scalarOverrideByNodeId: Object.keys(scalarOverrideByNodeId).length > 0 ? scalarOverrideByNodeId : undefined,
        confirmPartnerNodeCost,
      })
    );
    setCol1Submitting(false);
    if (result.ok) {
      setCol1JobId(result.jobId);
    } else {
      setCol1Error(result.error ?? "Generation failed.");
    }
  }, [gaussianPlyWorkflow, sourceReferenceId, textOverrideByNodeId, scalarOverrideByNodeId, projectId, sequenceId, shotId]);

  // ── Column 2 — Gaussian Viewer (Refresh + capture) ──────────────────────
  const [refreshed, setRefreshed] = useState<RefreshedViewer | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [snapshotDraft, setSnapshotDraft] = useState<SnapshotDraft | null>(null);

  const stale = refreshed !== null && col1JobId !== null && refreshed.jobId !== col1JobId;

  const handleRefresh = useCallback(async () => {
    if (col1JobId === null) return;
    setRefreshing(true);
    setRefreshError(null);
    const result = await refreshGaussianViewer({ projectId, sequenceId, shotId, jobId: col1JobId });
    setRefreshing(false);
    if (!result.ok) {
      setRefreshError(result.error);
      return;
    }
    setRefreshed({
      jobId: result.jobId,
      plyUrl: `/api/generated-outputs/${result.jobId}/${encodeURIComponent(result.plyFilename)}`,
      plyFilename: result.plyFilename,
      sourceImagePath: result.sourceImagePath,
      sourceReferenceId: result.sourceReferenceId,
      sourceLabel: result.sourceLabel,
    });
    setSnapshotDraft(null);
  }, [col1JobId, projectId, sequenceId, shotId]);

  // ── Column 3 — Gaussian-to-image ────────────────────────────────────────
  const [col3Submitting, setCol3Submitting] = useState(false);
  const [col3Error, setCol3Error] = useState<string | null>(null);
  const [col3JobId, setCol3JobId] = useState<number | null>(null);
  // CAMLAB.POLISH.2 — Column 3's own non-image `(Input)` node drafts, kept
  // strictly separate from Column 1's `textOverrideByNodeId`/
  // `scalarOverrideByNodeId` state above, even though both workflows could
  // in principle reuse the same node id numbering.
  const [col3TextOverrideByNodeId, setCol3TextOverrideByNodeId] = useState<Record<string, string>>({});
  const [col3ScalarOverrideByNodeId, setCol3ScalarOverrideByNodeId] = useState<Record<string, string>>({});
  const [col3CleanupWarning, setCol3CleanupWarning] = useState<string | null>(null);
  const [col3JobDoneImagePath, setCol3JobDoneImagePath] = useState<string | null>(null);
  const handleCol3StatusChange = useCallback((job: { status: string; outputPath: string | null }) => {
    const isImage = !!job.outputPath && /\.(jpg|jpeg|png|webp|gif)$/i.test(job.outputPath);
    setCol3JobDoneImagePath(job.status === "done" && isImage ? job.outputPath : null);
  }, []);

  // CAMLAB.POLISH.1 retake round 2 — snapshot override: an explicit local
  // PNG upload that replaces the captured snapshot for input 1. The
  // captured draft (`snapshotDraft`, lifted from the viewer) is never
  // discarded when an override is active — only `snapshotSource` decides
  // which one is "active" for Generate, so switching back never requires a
  // recapture.
  const [snapshotSource, setSnapshotSource] = useState<"captured-snapshot" | "uploaded-override">("captured-snapshot");
  const [overrideDraft, setOverrideDraft] = useState<{ file: File; objectUrl: string; width: number; height: number } | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const handleSnapshotOverrideFile = useCallback((file: File) => {
    setOverrideError(null);
    if (file.type !== "image/png" && !/\.png$/i.test(file.name)) {
      setOverrideError("Only PNG files are accepted for the snapshot override.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        URL.revokeObjectURL(objectUrl);
        setOverrideError("The uploaded file's dimensions could not be read.");
        return;
      }
      setOverrideDraft((previous) => {
        if (previous) URL.revokeObjectURL(previous.objectUrl);
        return { file, objectUrl, width: img.naturalWidth, height: img.naturalHeight };
      });
      setSnapshotSource("uploaded-override");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setOverrideError("The uploaded file could not be read as an image.");
    };
    img.src = objectUrl;
  }, []);

  useEffect(() => {
    return () => {
      setOverrideDraft((previous) => {
        if (previous) URL.revokeObjectURL(previous.objectUrl);
        return previous;
      });
    };
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideDraft((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
    setSnapshotSource("captured-snapshot");
    setOverrideError(null);
  }, []);

  const effectiveSnapshot = snapshotSource === "uploaded-override" ? overrideDraft : snapshotDraft;

  const handleGenerateGaussianToImage = useCallback(async () => {
    if (!gaussianToImageWorkflow || !refreshed || !effectiveSnapshot) return;
    setCol3Submitting(true);
    setCol3Error(null);
    setCol3CleanupWarning(null);
    try {
      const file =
        snapshotSource === "uploaded-override" && overrideDraft
          ? overrideDraft.file
          : new File([await (await fetch(effectiveSnapshot.objectUrl)).blob()], "gaussian-camera-snapshot.png", { type: "image/png" });
      const result = await confirmPartnerNodeAndRetry((confirmPartnerNodeCost) =>
        queueGaussianToImageGeneration({
          projectId,
          sequenceId,
          shotId,
          sourcePlyJobId: refreshed.jobId,
          snapshotFile: file,
          snapshotSource,
          textOverrideByNodeId: Object.keys(col3TextOverrideByNodeId).length > 0 ? col3TextOverrideByNodeId : undefined,
          scalarOverrideByNodeId: Object.keys(col3ScalarOverrideByNodeId).length > 0 ? col3ScalarOverrideByNodeId : undefined,
          confirmPartnerNodeCost,
        })
      );
      if (result.ok) {
        setCol3JobId(result.jobId);
        setCol3JobDoneImagePath(null);
        if (result.cleanupWarning) setCol3CleanupWarning(result.cleanupWarning);
      } else {
        setCol3Error(result.error ?? "Generation failed.");
      }
    } catch (err) {
      setCol3Error(`Could not read the captured snapshot: ${err instanceof Error ? err.message : "unknown error"}.`);
    } finally {
      setCol3Submitting(false);
    }
  }, [
    gaussianToImageWorkflow,
    refreshed,
    effectiveSnapshot,
    snapshotSource,
    col3TextOverrideByNodeId,
    col3ScalarOverrideByNodeId,
    projectId,
    sequenceId,
    shotId,
  ]);

  const col3Ready =
    refreshed !== null &&
    !stale &&
    effectiveSnapshot !== null &&
    gaussianToImageWorkflow !== null &&
    !gaussianToImageInputsError;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
      {/* ── Column 1 — Generate Gaussian PLY ──────────────────────────── */}
      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">1. Generate Gaussian PLY</h3>
          {!gaussianPlyWorkflow && <StateBadge tone="warn">Missing default</StateBadge>}
          {gaussianPlyWorkflow && col1JobId === null && !col1Submitting && <StateBadge tone="muted">Ready</StateBadge>}
        </div>

        {!gaussianPlyWorkflow ? (
          <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
            No Default Gaussian PLY workflow is configured. Set one in Settings → Generation Defaults.
          </p>
        ) : (
          <>
            <p className="text-[10px] text-[#4b5158] font-mono truncate" title={gaussianPlyWorkflow.name}>
              {gaussianPlyWorkflow.name}
            </p>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[#6e767d]">Source image</label>
                <a
                  href={uploadSourceHref}
                  className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Upload Source
                </a>
              </div>
              {referenceImages.length === 0 ? (
                <p className="text-xs text-[#a4abb2]">
                  This Shot has no reference images yet. Use "Upload Source" above to add one.
                </p>
              ) : (
                <ImageSourcePicker
                  items={referenceImages.map((ref) => ({
                    id: String(ref.id),
                    imagePath: ref.imagePath,
                    label: refLabel(ref),
                  }))}
                  selectedId={sourceReferenceId !== null ? String(sourceReferenceId) : ""}
                  onSelect={(id) => setSourceReferenceId(Number(id))}
                />
              )}
              {sourceReferenceId !== null && (
                <p className="text-[10px] text-[#4b5158]">
                  Node mapping: single image input → {referenceImages.find((r) => r.id === sourceReferenceId) && refLabel(referenceImages.find((r) => r.id === sourceReferenceId)!)}
                </p>
              )}
            </div>

            {gaussianPlyInputsError && (
              <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{gaussianPlyInputsError}</p>
            )}

            {!gaussianPlyInputsError && (
              <NonImageInputsFieldset
                nonImageInputs={gaussianPlyNonImageInputs}
                textOverrideByNodeId={textOverrideByNodeId}
                scalarOverrideByNodeId={scalarOverrideByNodeId}
                onTextChange={(nodeId, value) => setTextOverrideByNodeId((prev) => ({ ...prev, [nodeId]: value }))}
                onScalarChange={(nodeId, value) => setScalarOverrideByNodeId((prev) => ({ ...prev, [nodeId]: value }))}
                disabled={col1Submitting}
              />
            )}

            <button
              type="button"
              onClick={handleGeneratePly}
              disabled={col1Submitting || sourceReferenceId === null || referenceImages.length === 0 || !!gaussianPlyInputsError}
              className="rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start"
            >
              {col1Submitting ? "Queueing…" : "Generate Gaussian PLY"}
            </button>

            {col1Error && (
              <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{col1Error}</p>
            )}

            {col1JobId !== null && (
              <div className="border-t border-[#232629] pt-3">
                <GenerationJobStatusPanel jobId={col1JobId} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Column 2 — Gaussian Viewer ─────────────────────────────────── */}
      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">2. Gaussian Viewer</h3>
          <div className="flex items-center gap-2">
            {stale && <StateBadge tone="warn">Stale</StateBadge>}
            {refreshed && !stale && <StateBadge tone="ok">Refreshed</StateBadge>}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={col1JobId === null || refreshing}
          className="rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start"
        >
          {refreshing ? "Refreshing…" : "Refresh Viewer"}
        </button>

        {refreshError && (
          <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{refreshError}</p>
        )}

        {stale && (
          <p className="text-xs text-[#c9a24b] border border-[#4a3a1f] rounded px-3 py-2 bg-[#1f1a10]">
            Column 1 has a newer job (#{col1JobId}) than the one currently shown (#{refreshed?.jobId}). Refresh to
            update the viewer before capturing.
          </p>
        )}

        {!refreshed && !refreshError && (
          <p className="text-xs text-[#6e767d]">
            Generate a Gaussian PLY in Column 1, then Refresh to load it here.
          </p>
        )}

        {refreshed && (
          <RefreshedViewerColumn
            projectId={projectId}
            sequenceId={sequenceId}
            shotId={shotId}
            refreshed={refreshed}
            onSnapshotChange={setSnapshotDraft}
          />
        )}
      </div>

      {/* ── Column 3 — Gaussian-to-image ───────────────────────────────── */}
      <div className="rounded border border-[#232629] bg-[#101214] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">3. Gaussian-to-image</h3>
          {!gaussianToImageWorkflow && <StateBadge tone="warn">Missing default</StateBadge>}
          {gaussianToImageWorkflow && col3Ready && <StateBadge tone="muted">Ready</StateBadge>}
        </div>

        {!gaussianToImageWorkflow ? (
          <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
            No Default Gaussian-to-image workflow is configured. Set one in Settings → Generation Defaults.
          </p>
        ) : (
          <>
            <p className="text-[10px] text-[#4b5158] font-mono truncate" title={gaussianToImageWorkflow.name}>
              {gaussianToImageWorkflow.name}
            </p>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6e767d]">
                  {LOAD_IMAGE_GAUSSIAN_LABEL} (Input) — active source:{" "}
                  <span className="text-[#a4abb2]">
                    {snapshotSource === "uploaded-override" ? "Uploaded override" : "Captured snapshot"}
                  </span>
                </span>
                <label
                  htmlFor="col3-snapshot-override-input"
                  className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors cursor-pointer"
                >
                  Upload Snapshot Override
                </label>
                <input
                  type="file"
                  id="col3-snapshot-override-input"
                  accept="image/png,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleSnapshotOverrideFile(file);
                  }}
                />
              </div>

              {overrideError && <p className="text-[10px] text-[#cf7b6b]">{overrideError}</p>}

              {effectiveSnapshot ? (
                <div className="flex items-center gap-2 rounded border border-[#2c3035] p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={effectiveSnapshot.objectUrl}
                    alt={snapshotSource === "uploaded-override" ? "Uploaded snapshot override" : "Captured snapshot"}
                    className="h-10 w-14 rounded object-cover border border-[#232629]"
                  />
                  <span className="text-[10px] font-mono text-[#8fc9a0]">
                    {effectiveSnapshot.width} × {effectiveSnapshot.height}
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    {snapshotSource === "uploaded-override" && snapshotDraft && (
                      <button
                        type="button"
                        onClick={() => setSnapshotSource("captured-snapshot")}
                        className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                      >
                        Use Captured Snapshot
                      </button>
                    )}
                    {overrideDraft && (
                      <button
                        type="button"
                        onClick={clearOverride}
                        className="text-[10px] text-[#cf7b6b] hover:text-[#e39d8f] transition-colors"
                      >
                        Clear Override
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-[10px] text-[#cf7b6b]">missing</span>
              )}

              <span className="text-[10px] text-[#6e767d]">
                {LOAD_IMAGE_LABEL} (Input): {refreshed && !stale ? <span className="text-[#8fc9a0]">{refreshed.sourceLabel}</span> : <span className="text-[#cf7b6b]">missing</span>}
              </span>
            </div>

            {gaussianToImageInputsError && (
              <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
                {gaussianToImageInputsError}
              </p>
            )}

            {!gaussianToImageInputsError && (
              <NonImageInputsFieldset
                nonImageInputs={gaussianToImageNonImageInputs}
                textOverrideByNodeId={col3TextOverrideByNodeId}
                scalarOverrideByNodeId={col3ScalarOverrideByNodeId}
                onTextChange={(nodeId, value) => setCol3TextOverrideByNodeId((prev) => ({ ...prev, [nodeId]: value }))}
                onScalarChange={(nodeId, value) => setCol3ScalarOverrideByNodeId((prev) => ({ ...prev, [nodeId]: value }))}
                disabled={col3Submitting}
              />
            )}

            <button
              type="button"
              onClick={handleGenerateGaussianToImage}
              disabled={!col3Ready || col3Submitting}
              className="rounded border border-[#2c3035] px-3 py-1.5 text-sm text-[#a4abb2] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start"
            >
              {col3Submitting ? "Queueing…" : "Generate"}
            </button>

            {col3Error && (
              <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{col3Error}</p>
            )}
            {col3CleanupWarning && (
              <p className="text-xs text-[#c9a24b] border border-[#4a3a1f] rounded px-3 py-2 bg-[#1f1a10]">{col3CleanupWarning}</p>
            )}

            {col3JobId !== null && (
              <div className="border-t border-[#232629] pt-3 flex flex-col gap-2">
                <GenerationJobStatusPanel jobId={col3JobId} onStatusChange={handleCol3StatusChange} />

                {attachedReference && (
                  <p className="text-xs text-[#6b9e72] border border-[#2c6142]/40 rounded px-3 py-2 bg-[#12241a]">
                    Snapshot output added to this Shot's Reference Images.
                  </p>
                )}
                {attachError && (
                  <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{attachError}</p>
                )}

                {col3JobDoneImagePath && (
                  <form action={attachOutputAsShotReference} className="self-start">
                    <input type="hidden" name="projectId" value={String(projectId)} />
                    <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                    <input type="hidden" name="shotId" value={String(shotId)} />
                    <input type="hidden" name="jobId" value={String(col3JobId)} />
                    <input type="hidden" name="returnTo" value={cameraLabPath} />
                    <button
                      type="submit"
                      className="rounded border border-[#2c6142] bg-[#12241a] px-3 py-1.5 text-sm text-[#8fc9a0] hover:border-[#3a8158] transition-colors"
                    >
                      Add to Shot references
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
