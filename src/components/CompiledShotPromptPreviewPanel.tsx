import type { CompiledShotPrompt } from "@/lib/prompts/compileShotPrompt";

type Props = {
  compiled: CompiledShotPrompt;
  workflowKind: string;
};

export default function CompiledShotPromptPreviewPanel({ compiled, workflowKind }: Props) {
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

      <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed min-h-[3rem]">
        {compiled.text || <span className="text-[#4b5158]">(empty)</span>}
      </pre>

      <p className="text-xs text-[#4b5158]">
        This is the final text sent to Text Prompt inputs for this workflow.{" "}
        {workflowKind === "video"
          ? "Shot Prompt and timed segments are both used for video generation."
          : "Shot Prompt remains the source of truth."}
      </p>
    </div>
  );
}
