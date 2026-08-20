import WorkflowRuntimeMappingPanel from "@/components/WorkflowRuntimeMappingPanel";
import ShotPanelImagePreviewForm from "@/components/ShotPanelImagePreviewForm";
import type { ShotPanelImageNode } from "@/components/ShotPanelImagePreviewForm";
import ShotPanelVideoSelectionForm from "@/components/ShotPanelVideoSelectionForm";
import type { ShotPanelVideoNode } from "@/components/ShotPanelVideoSelectionForm";
import DynamicBatchImageList from "@/components/DynamicBatchImageList";
import type { BatchImageGroup, BatchExpansionPreview } from "@/components/DynamicBatchImageList";
import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import type { FillSource } from "@/lib/textInputKind";

type Props = {
  parsed: unknown;
  mappings: WorkflowInputMapping[];
  effectiveScalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  currentSearchParams: Record<string, string>;
  basePath: string;
  fillSources: FillSource[];
  displayImageMappings: WorkflowInputMapping[];
  panelImageNodes: ShotPanelImageNode[];
  projectId: number;
  shotId: number;
  sequenceId: number;
  videoMappings: WorkflowInputMapping[];
  panelVideoNodes: ShotPanelVideoNode[];
  batchDetectionOk: boolean;
  batchNodeId: string;
  batchPreview: BatchExpansionPreview | null;
  batchError: { kind: "detection"; message: string } | null;
  batchImageGroups: BatchImageGroup[];
  batchSelectedIds: string[];
  workflowId: number;
};

/** "Suggested Inputs" children of WorkflowProfilePanel: runtime mappings, image/video sources, Dynamic Batch (IND.CLIENTSPLIT.1, moved verbatim from ShotGenerationPanel.tsx). */
export default function SuggestedInputsBody({
  parsed,
  mappings,
  effectiveScalarValueByNodeId,
  textOverrideByNodeId,
  currentSearchParams,
  basePath,
  fillSources,
  displayImageMappings,
  panelImageNodes,
  projectId: pid,
  shotId: shid,
  sequenceId: sid,
  videoMappings,
  panelVideoNodes,
  batchDetectionOk,
  batchNodeId,
  batchPreview,
  batchError,
  batchImageGroups,
  batchSelectedIds,
  workflowId: wid,
}: Props) {
  return parsed === null ? (
    <p className="text-sm text-[#cf7b6b]">Workflow JSON could not be parsed.</p>
  ) : (
    <>
      <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Suggested Inputs
        </p>
        <WorkflowRuntimeMappingPanel
          mappings={mappings}
          scalarValueByNodeId={effectiveScalarValueByNodeId}
          textOverrideByNodeId={textOverrideByNodeId}
          currentSearchParams={currentSearchParams}
          basePath={basePath}
          fillSources={fillSources}
        />
      </div>

      {displayImageMappings.length > 0 && (
        <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Image Sources
          </p>
          <ShotPanelImagePreviewForm
            nodes={panelImageNodes}
            passthroughParams={currentSearchParams}
            basePath={basePath}
            projectId={pid}
            shotId={shid}
            sequenceId={sid}
          />
        </div>
      )}

      {/* SHOT.VIDEO.LIBRARY.1, Lot C — renders only when the workflow
          has a real, structurally-detected video input node. No such
          workflow exists in this library today (see the audit in
          claude_report.md), so this block is a no-op on every current
          workflow. */}
      {videoMappings.length > 0 && (
        <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Video Sources
          </p>
          <ShotPanelVideoSelectionForm nodes={panelVideoNodes} passthroughParams={currentSearchParams} basePath={basePath} />
        </div>
      )}

      {/* Dynamic Image Batch (WFBUILD.1A) */}
      {batchDetectionOk && (
        <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
          <DynamicBatchImageList
            batchNodeId={batchNodeId}
            preview={batchPreview}
            error={batchError}
            availableImages={batchImageGroups}
            selectedImageIds={batchSelectedIds}
            passthroughParams={currentSearchParams}
            basePath={basePath}
            contextType="shot"
            projectId={pid}
            workflowId={String(wid)}
            shotId={shid}
            sequenceId={sid}
          />
        </div>
      )}

      {/* Batch detection error (non-fatal, but informative) */}
      {batchError && !batchDetectionOk && (
        <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
          <DynamicBatchImageList
            batchNodeId=""
            preview={null}
            error={batchError}
            availableImages={[]}
            selectedImageIds={[]}
            passthroughParams={currentSearchParams}
            basePath={basePath}
            contextType="shot"
            projectId={pid}
            workflowId={String(wid)}
            shotId={shid}
            sequenceId={sid}
          />
        </div>
      )}
    </>
  );
}
