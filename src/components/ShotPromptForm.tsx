import { updateShotPrompt } from "@/actions/shots";
import ShotPromptLLMAssistPanel from "@/components/ShotPromptLLMAssistPanel";

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  initialShotPrompt: string | null;
  returnTo: string;
  saved?: boolean;
  error?: string | null;
  defaultPromptProposal?: string | null;
};

export default function ShotPromptForm({
  projectId,
  sequenceId,
  shotId,
  initialShotPrompt,
  returnTo,
  saved,
  error,
  defaultPromptProposal,
}: Props) {
  const textareaDefaultValue =
    initialShotPrompt && initialShotPrompt.trim()
      ? initialShotPrompt
      : (defaultPromptProposal ?? "");
  return (
    <div className="flex flex-col gap-3">
      {saved && (
        <p className="text-xs text-[#6b9e72]">Shot prompt saved.</p>
      )}
      {error && (
        <p className="text-xs text-[#cf7b6b]">{error}</p>
      )}

      <form action={updateShotPrompt} className="flex flex-col gap-3">
        <input type="hidden" name="projectId" value={String(projectId)} />
        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
        <input type="hidden" name="shotId" value={String(shotId)} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="shot-prompt-textarea"
            className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]"
          >
            Prompt
          </label>
          <textarea
            id="shot-prompt-textarea"
            name="shotPrompt"
            defaultValue={textareaDefaultValue}
            placeholder="Describe the shot as a clean generation prompt..."
            rows={5}
            className="w-full rounded border border-[#2c3035] bg-[#141618] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#4b5158] resize-y focus:outline-none focus:border-[#3a4046] leading-relaxed"
          />
        </div>

        <p className="text-xs text-[#4b5158]">
          This is the main text prompt used for AI generation. You can write it manually, use LLM Assist later, or apply a Prompt Composer result.
        </p>

        <div>
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Save Shot Prompt
          </button>
        </div>
      </form>

      <ShotPromptLLMAssistPanel
        projectId={projectId}
        sequenceId={sequenceId}
        shotId={shotId}
        currentShotPrompt={initialShotPrompt}
        returnTo={returnTo}
      />
    </div>
  );
}
