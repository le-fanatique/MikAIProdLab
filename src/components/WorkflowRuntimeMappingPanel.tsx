import type { WorkflowInputMapping } from "@/lib/comfy/mapWorkflowInputs";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";
import EmptyState from "@/components/EmptyState";
import WorkflowScalarInputsForm from "@/components/WorkflowScalarInputsForm";
import WorkflowTextOverrideForm from "@/components/WorkflowTextOverrideForm";

const SCALAR_KINDS = new Set(["integer", "float", "boolean", "select", "seed", "string"]);

type Props = {
  mappings: WorkflowInputMapping[];
  scalarValueByNodeId: Record<string, string>;
  textOverrideByNodeId: Record<string, string>;
  currentSearchParams: Record<string, string>;
  basePath: string;
};

export default function WorkflowRuntimeMappingPanel({
  mappings,
  scalarValueByNodeId,
  textOverrideByNodeId,
  currentSearchParams,
  basePath,
}: Props) {
  if (mappings.length === 0) {
    return (
      <EmptyState
        title="No workflow inputs detected."
        description="Add (Input) to node titles in the ComfyUI API JSON to expose them here."
      />
    );
  }

  const hasScalars = mappings.some((m) => SCALAR_KINDS.has(m.input.kind));
  const textMappings = mappings.filter((m) => m.mappingKind === "text");
  const hasTexts = textMappings.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Text and image mappings */}
      {mappings.map((mapping) => {
        // Scalars are rendered in the dedicated section below
        if (SCALAR_KINDS.has(mapping.input.kind)) return null;

        return (
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

            {/* Image mapping — show count or empty state; selection is in Image Inputs card */}
            {mapping.mappingKind === "image" && mapping.availableImages.length === 0 && (
              <p className="text-sm text-[#4b5158]">
                No reference images available. Add reference images to this shot or its cast.
              </p>
            )}
            {mapping.mappingKind === "image" && mapping.availableImages.length > 0 && (
              <p className="text-xs text-[#4b5158]">
                {mapping.availableImages.length}{" "}
                {mapping.availableImages.length === 1 ? "image" : "images"} available — select
                below in Image Inputs.
              </p>
            )}

            {/* Unknown mapping (truly unknown, not a scalar) */}
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
        );
      })}

      {/* Text inputs section */}
      {hasTexts && (
        <div className="flex flex-col gap-3 pt-4 border-t border-[#232629]">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Text Inputs
          </p>
          <WorkflowTextOverrideForm
            textMappings={textMappings}
            textOverrideByNodeId={textOverrideByNodeId}
            currentSearchParams={currentSearchParams}
            basePath={basePath}
          />
        </div>
      )}

      {/* Scalar inputs section */}
      {hasScalars && (
        <div className="flex flex-col gap-3 pt-4 border-t border-[#232629]">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Scalar Inputs
          </p>
          <WorkflowScalarInputsForm
            mappings={mappings}
            scalarValueByNodeId={scalarValueByNodeId}
            currentSearchParams={currentSearchParams}
            basePath={basePath}
          />
        </div>
      )}
    </div>
  );
}
