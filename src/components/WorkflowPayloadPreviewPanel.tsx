import type { WorkflowPayloadPatchResult } from "@/lib/comfy/patchWorkflowPayload";
import EmptyState from "@/components/EmptyState";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";

type Props = {
  result: WorkflowPayloadPatchResult;
};

function formatValuePreview(value: unknown): string {
  const str = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  const trimmed = str.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? trimmed.slice(0, 117) + "…" : trimmed;
}

export default function WorkflowPayloadPreviewPanel({ result }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {/* Patches */}
      {result.patches.length === 0 ? (
        <EmptyState
          title="No payload patches applied."
          description="This workflow has no text or image inputs that can be patched automatically."
        />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-2">
            Applied Patches
          </p>
          <div className="flex flex-col">
            {result.patches.map((patch, i) => (
              <div
                key={i}
                className="border-b border-[#232629] last:border-0 py-2.5 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <WorkflowInputKindBadge kind={patch.kind} />
                  <span className="text-sm font-medium text-[#e7e9ec]">{patch.label}</span>
                  <span className="text-[10px] text-[#4b5158]">· node {patch.nodeId}</span>
                  <span className="text-[10px] font-mono text-[#4b5158]">
                    .inputs.{patch.inputKey}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 pl-1">
                  <p className="text-xs text-[#6e767d]">
                    <span className="font-mono text-[#4b5158]">before: </span>
                    {formatValuePreview(patch.previousValue) || (
                      <span className="italic text-[#3a4046]">empty</span>
                    )}
                  </p>
                  <p className="text-xs text-[#a4abb2]">
                    <span className="font-mono text-[#6e767d]">after: </span>
                    {formatValuePreview(patch.nextValue) || (
                      <span className="italic text-[#3a4046]">empty</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
            Warnings
          </p>
          {result.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-[#4b5158] leading-relaxed">
              {warning}
            </p>
          ))}
        </div>
      )}

    </div>
  );
}
