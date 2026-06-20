import { WorkflowInput } from "@/lib/comfy/parseWorkflow";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";

type Props = {
  inputs: WorkflowInput[];
};

export default function WorkflowInputPreviewPanel({ inputs }: Props) {
  return (
    <Card title="Input Mapping Preview" className="mb-4">
      <p className="text-xs text-[#4b5158] mb-4">
        Preview only — no data will be saved.
      </p>

      {inputs.length === 0 ? (
        <EmptyState
          title="No workflow inputs detected."
          description="Add (Input) to a node title in the ComfyUI API JSON to expose it here."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {inputs.map((input) => (
            <div key={input.nodeId} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <WorkflowInputKindBadge kind={input.kind} />
                <span className="text-sm font-medium text-[#e7e9ec]">{input.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#6e767d]">{input.classType}</span>
                <span className="text-[10px] text-[#4b5158]">· node {input.nodeId}</span>
              </div>

              {input.kind === "text" && (
                <textarea
                  readOnly
                  defaultValue={input.defaultValue ?? ""}
                  placeholder="Prompt text will be mapped here."
                  rows={3}
                  className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#6e767d] placeholder-[#3a4046] resize-none cursor-default focus:outline-none"
                />
              )}

              {input.kind === "image" && (
                <div className="rounded border border-dashed border-[#2c3035] px-4 py-5 flex flex-col gap-1 select-none">
                  <p className="text-sm text-[#6e767d]">Image input placeholder</p>
                  <p className="text-xs text-[#4b5158]">
                    Asset and reference image selection will be added later.
                  </p>
                </div>
              )}

              {input.kind === "unknown" && (
                <div className="rounded border border-[#232629] bg-[#0d0e10] px-4 py-3 flex flex-col gap-1">
                  <p className="text-sm text-[#4b5158]">Unsupported input type</p>
                  <p className="text-xs font-mono text-[#3a4046]">{input.classType}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
