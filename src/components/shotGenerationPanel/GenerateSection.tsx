import WorkflowPayloadPreviewPanel from "@/components/WorkflowPayloadPreviewPanel";
import PartnerNodeConfirmForm from "@/components/PartnerNodeConfirmForm";
import WorkflowGenerateActions from "@/components/WorkflowGenerateActions";
import DynamicBatchFormSync from "@/components/DynamicBatchFormSync";
import { runWorkflowGenerationFromForm, runShotStoryboardGenerationFromForm } from "@/actions/generation";
import type { WorkflowPayloadPatchResult } from "@/lib/comfy/patchWorkflowPayload";
import type { PanelCloudPreflight } from "@/lib/comfy/cloudPreflight";

type Props = {
  payloadPreview: WorkflowPayloadPatchResult;
  generationError: string | undefined;
  cloudPreflight: PanelCloudPreflight | null;
  cloudPreflightBlocksGeneration: boolean;
  preparedStyleOk: boolean;
  partnerNodeConfirmMessage: string | null;
  isStoryboardContext: boolean;
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
  returnTo: string;
  selectedImageByNodeId: Record<string, string>;
  selectedVideoByNodeId: Record<string, string>;
  effectiveScalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  batchDetectionOk: boolean;
  batchNodeId: string;
  workflowKind: string;
};

/** "Preview" + "Generate" blocks: payload preview, Cloud preflight/Style/error banners, the generation form itself (IND.CLIENTSPLIT.1, moved verbatim from ShotGenerationPanel.tsx). */
export default function GenerateSection({
  payloadPreview,
  generationError,
  cloudPreflight,
  cloudPreflightBlocksGeneration,
  preparedStyleOk,
  partnerNodeConfirmMessage,
  isStoryboardContext,
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  workflowId: wid,
  returnTo,
  selectedImageByNodeId,
  selectedVideoByNodeId,
  effectiveScalarValueByNodeId,
  textOverrideByNodeId,
  batchDetectionOk,
  batchNodeId,
  workflowKind,
}: Props) {
  return (
    <>
      {/* Preview — shows the final expanded+patched JSON */}
      <div className="border-t border-[#232629] pt-4 flex flex-col gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Preview
        </p>
        <WorkflowPayloadPreviewPanel result={payloadPreview} />
      </div>

      {/* Generate */}
      <div className="border-t border-[#232629] pt-4">
        {generationError && (
          <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3">
            <p className="text-xs text-[#cf7b6b] leading-relaxed">{generationError}</p>
          </div>
        )}
        {/* COMFY.PROVIDER.1 — Cloud preflight blocks Generate outright
            when the workflow cannot even be checked or uses a node
            class Comfy Cloud does not expose. Never a silent submission. */}
        {cloudPreflight !== null &&
          ("error" in cloudPreflight || cloudPreflight.missingClasses.length > 0) && (
            <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3">
              <p className="text-xs text-[#cf7b6b] leading-relaxed">
                {"error" in cloudPreflight
                  ? cloudPreflight.error
                  : `This workflow uses node type(s) not available on Comfy Cloud: ${cloudPreflight.missingClasses.join(", ")}. It cannot be generated with Comfy Cloud selected.`}
              </p>
            </div>
          )}
        {cloudPreflight !== null &&
          !("error" in cloudPreflight) &&
          cloudPreflight.missingClasses.length === 0 &&
          cloudPreflight.apiNodeClasses.length > 0 && (
            <div className="rounded border border-[#3d3320] bg-[#1a1712] px-3 py-2 mb-3">
              <p className="text-xs text-[#c9a24b] leading-relaxed">
                This workflow calls paid Comfy Cloud Partner Node(s):{" "}
                <span className="font-mono">{cloudPreflight.apiNodeClasses.join(", ")}</span>. Generating
                will incur Comfy Cloud usage cost. You will be asked to confirm before it runs.
              </p>
            </div>
          )}
        {/* STYLE.1.E.SURFACES.1 — a resolver/corruption error disables
            Generate entirely rather than silently falling back to no
            Style; the error itself is already visible above via
            ProjectStyleGenerationPreview. GEN.PROJECT_STYLE.APPEND.TOGGLE.1
            — but never while the user has unchecked "Append Project
            Style", since no resolution is attempted for that job at all. */}
        {!preparedStyleOk && (
          <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2 mb-3 group-has-[#appendProjectStyle:not(:checked)]/style:hidden">
            <p className="text-xs text-[#cf7b6b] leading-relaxed">
              Generation is disabled: Project Style could not be resolved.
            </p>
          </div>
        )}
        {!cloudPreflightBlocksGeneration && (
        <PartnerNodeConfirmForm
          id="shot-panel-generation-form"
          action={isStoryboardContext ? runShotStoryboardGenerationFromForm : runWorkflowGenerationFromForm}
          partnerNodeConfirmMessage={partnerNodeConfirmMessage}
          className={
            preparedStyleOk
              ? "flex flex-col gap-4"
              : "hidden group-has-[#appendProjectStyle:not(:checked)]/style:flex flex-col gap-4"
          }
        >
          <input type="hidden" name="projectId" value={String(pid)} />
          <input type="hidden" name="sequenceId" value={String(sid)} />
          <input type="hidden" name="shotId" value={String(shid)} />
          <input type="hidden" name="workflowId" value={String(wid)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          {Object.entries(selectedImageByNodeId).map(([nodeId, imageId]) => (
            <input
              key={nodeId}
              type="hidden"
              name={`imageNode_${nodeId}`}
              value={String(imageId)}
            />
          ))}
          {/* SHOT.VIDEO.LIBRARY.1, Lot C */}
          {Object.entries(selectedVideoByNodeId).map(([nodeId, videoId]) => (
            <input key={`video-${nodeId}`} type="hidden" name={`videoNode_${nodeId}`} value={String(videoId)} />
          ))}
          {Object.entries(effectiveScalarValueByNodeId).map(([nodeId, value]) => (
            <input
              key={`scalar-${nodeId}`}
              type="hidden"
              name={`scalarNode_${nodeId}`}
              value={value}
            />
          ))}
          {/* GEN.SEEDANCE.1 — text overrides staged in the panel were
              previously never submitted, so Generate silently dropped
              them and recomputed the prompt from DB state. */}
          {Object.entries(textOverrideByNodeId).map(([nodeId, value]) => (
            <input
              key={`text-${nodeId}`}
              type="hidden"
              name={`textNode_${nodeId}`}
              value={value}
            />
          ))}
          {/* DynamicBatchFormSync replaces the static hidden input — it reads
              the current URL searchParams at submit time, keeping in sync with
              client-side DynamicBatchImageList updates via pushState(). */}
          {batchDetectionOk && (
            <DynamicBatchFormSync batchNodeId={batchNodeId} workflowId={String(wid)} />
          )}
          {/* COMFY.PROVIDER.1 — confirmPartnerNodeCost is deliberately NOT
              rendered here: PartnerNodeConfirmForm sets it itself, only on
              the confirmed submit path, so it never exists in the SSR/
              pre-hydration HTML. */}
          <WorkflowGenerateActions
            initialJsonText={payloadPreview.patchedJsonText}
            buttonLabel={workflowKind === "video" ? "Generate Video" : "Generate Keyframe"}
          />
        </PartnerNodeConfirmForm>
        )}
      </div>
    </>
  );
}
