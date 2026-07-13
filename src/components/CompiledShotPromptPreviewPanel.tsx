import type { CompiledShotPrompt } from "@/lib/prompts/compileShotPrompt";

type Props = {
  compiled: CompiledShotPrompt;
  workflowKind: string;
};

export default function CompiledShotPromptPreviewPanel({ compiled, workflowKind }: Props) {
  const finalTextLabel =
    compiled.kind === "video"
      ? compiled.usedTimeline
        ? "Final text for video — Shot Prompt + Timeline."
        : "Final text for video — Shot Prompt only (no Timeline included)."
      : "Final text for image — Shot Prompt only. Timeline is never included for image workflows.";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs">
        <span>
          <span className="text-[#4b5158]">Workflow kind </span>
          <span className="text-[#a4abb2] font-mono">{workflowKind}</span>
        </span>
        {compiled.usedTimeline && (
          <span className="text-[#6b9e72]">Timeline included</span>
        )}
      </div>

      {compiled.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {compiled.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-[#b89a5a]">{warning}</p>
          ))}
        </div>
      )}

      {/* Sections actually used — reflects only real, non-empty inputs */}
      {compiled.sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
            Sections used
          </p>
          <div className="flex flex-col gap-2">
            {compiled.sections.map((section) => (
              <div key={section.id} className="flex flex-col gap-1">
                <span className="text-[10px] text-[#6e767d]">{section.label}</span>
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
                  {section.text}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
          Final Text
        </p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed min-h-[3rem]">
          {compiled.text || <span className="text-[#4b5158]">(empty)</span>}
        </pre>
      </div>

      <p className="text-xs text-[#4b5158]">
        {finalTextLabel} This is the exact text sent to Text Prompt inputs for this workflow.
      </p>
    </div>
  );
}
