import { updateShotPrompt } from "@/actions/shots";
import type { ComposedShotPrompt } from "@/lib/prompts/composeShotPrompt";

type Props = {
  composed: ComposedShotPrompt;
  projectId: number;
  sequenceId: number;
  shotId: number;
  returnTo: string;
  hasExistingShotPrompt: boolean;
};

export default function PromptComposerPanel({
  composed,
  projectId,
  sequenceId,
  shotId,
  returnTo,
  hasExistingShotPrompt,
}: Props) {
  const proposalText = composed.sections
    .map((s) => `${s.title}:\n${s.content}`)
    .join("\n\n");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#6e767d] leading-relaxed">
        Use the shot context, continuity, cast, references, and timeline segments to
        compose a draft prompt. Nothing is applied until you choose Apply to Shot Prompt.
      </p>

      {!composed.hasContent ? (
        <div className="rounded border border-dashed border-[#2c3035] px-4 py-6 text-center">
          <p className="text-sm text-[#6e767d]">No shot data to compose a prompt draft.</p>
          <p className="text-xs text-[#4b5158] mt-1">
            Add casting, prompt segments, or references to build a draft.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
              Composer Preview
            </p>
            <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed">
              {proposalText}
            </pre>
            <p className="text-[10px] text-[#4b5158]">
              Source: Shot context + continuity + cast + prompt segments
            </p>
          </div>

          {composed.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {composed.warnings.map((warning, i) => (
                <p key={i} className="text-xs text-[#4b5158]">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 border-t border-[#1e2124]">
            {hasExistingShotPrompt && (
              <p className="text-xs text-[#b89a5a]">
                Applying this composer result will replace the current Shot Prompt.
              </p>
            )}
            <form action={updateShotPrompt}>
              <input type="hidden" name="projectId" value={String(projectId)} />
              <input type="hidden" name="sequenceId" value={String(sequenceId)} />
              <input type="hidden" name="shotId" value={String(shotId)} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="shotPrompt" value={proposalText} />
              <button
                type="submit"
                className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
              >
                Apply to Shot Prompt
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
