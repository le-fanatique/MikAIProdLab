import EmptyState from "@/components/EmptyState";
import type { ComposedShotPrompt } from "@/lib/prompts/composeShotPrompt";

type Props = {
  composed: ComposedShotPrompt;
};

export default function ShotPromptDraftPanel({ composed }: Props) {
  if (!composed.hasContent) {
    return (
      <EmptyState
        title="No shot data to compose a prompt draft."
        description="Add casting, prompt segments, or references to build a draft."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <pre className="whitespace-pre-wrap font-mono text-sm text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-4 leading-relaxed">
        {composed.text}
      </pre>
      {composed.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {composed.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-[#4b5158]">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
