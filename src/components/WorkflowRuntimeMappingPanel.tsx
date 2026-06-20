import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";
import ReferenceImageRoleBadge from "@/components/ReferenceImageRoleBadge";
import EmptyState from "@/components/EmptyState";

type Props = {
  mappings: WorkflowInputMapping[];
  workflowKind: "image" | "video";
  timelinePromptText: string;
};

export default function WorkflowRuntimeMappingPanel({
  mappings,
  workflowKind,
  timelinePromptText,
}: Props) {
  if (mappings.length === 0) {
    return (
      <EmptyState
        title="No workflow inputs detected."
        description="Add (Input) to node titles in the ComfyUI API JSON to expose them here."
      />
    );
  }

  const hasTimeline = workflowKind === "video" && timelinePromptText.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      {mappings.map((mapping) => (
        <div key={mapping.input.nodeId} className="flex flex-col gap-2">
          {/* Input header */}
          <div className="flex items-center gap-2">
            <WorkflowInputKindBadge kind={mapping.input.kind} />
            <span className="text-sm font-medium text-[#e7e9ec]">
              {mapping.input.label || mapping.input.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#6e767d]">{mapping.input.classType}</span>
            <span className="text-[10px] text-[#4b5158]">· node {mapping.input.nodeId}</span>
          </div>

          {/* Text mapping */}
          {mapping.mappingKind === "text" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                  Suggested Text
                </p>
                <textarea
                  readOnly
                  value={mapping.suggestedText ?? ""}
                  rows={10}
                  className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none cursor-default focus:outline-none leading-relaxed"
                />
              </div>

              {hasTimeline && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                    Timeline Prompt
                  </p>
                  <p className="text-[10px] text-[#4b5158]">
                    Timeline prompt is also available for video workflows.
                  </p>
                  <textarea
                    readOnly
                    value={timelinePromptText}
                    rows={5}
                    className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#a4abb2] font-mono resize-none cursor-default focus:outline-none leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}

          {/* Image mapping */}
          {mapping.mappingKind === "image" && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                Available Reference Images
              </p>
              {mapping.availableImages.length === 0 ? (
                <p className="text-sm text-[#4b5158]">
                  No reference images available for this shot or its cast.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {mapping.availableImages.map((image) => (
                    <div
                      key={image.id}
                      className="flex flex-col gap-1.5 rounded border border-[#2c3035] bg-[#0d0e10] p-2"
                    >
                      <img
                        src={`/${image.imagePath}`}
                        alt={image.label}
                        className="w-full aspect-square object-cover rounded"
                      />
                      <p className="text-xs text-[#a4abb2] truncate leading-tight">
                        {image.label}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <ReferenceImageRoleBadge role={image.role} />
                        {image.source === "shot" ? (
                          <span className="text-[10px] text-[#4b5158]">Shot reference</span>
                        ) : (
                          <span className="text-[10px] text-[#4b5158]">
                            {image.assetName} / {image.assetType}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unknown mapping */}
          {mapping.mappingKind === "unknown" && (
            <div className="rounded border border-[#232629] bg-[#0d0e10] px-4 py-3">
              <p className="text-sm text-[#4b5158]">
                No runtime suggestion available for this input type.
              </p>
              <p className="text-xs font-mono text-[#3a4046] mt-0.5">
                {mapping.input.classType}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
