import EmptyState from "@/components/EmptyState";
import type { CompiledPrompt } from "@/lib/prompts/compilePromptSegments";

type Props = {
  compiled: CompiledPrompt;
};

export default function CompiledPromptPanel({ compiled }: Props) {
  if (compiled.lines.length === 0) {
    return (
      <EmptyState
        title="No prompt segments to compile."
        description="Add prompt segments to preview the generated timeline prompt."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <pre className="whitespace-pre-wrap font-mono text-sm text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-4 leading-relaxed">
        {compiled.text}
      </pre>
      {compiled.hasMissingTiming && (
        <p className="text-xs text-[#4b5158]">
          Some segments have no complete timing — fallback labels are used.
        </p>
      )}
    </div>
  );
}
