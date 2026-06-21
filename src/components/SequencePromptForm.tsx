import { updateSequencePrompt } from "@/actions/sequences";
import SequencePromptLLMAssistPanel from "@/components/SequencePromptLLMAssistPanel";

type Props = {
  projectId: number;
  sequenceId: number;
  initialSequencePrompt: string | null;
  returnTo: string;
  saved?: boolean;
  error?: string | null;
};

export default function SequencePromptForm({
  projectId,
  sequenceId,
  initialSequencePrompt,
  returnTo,
  saved,
  error,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {saved && (
        <p className="text-xs text-[#6b9e72]">Sequence prompt saved.</p>
      )}
      {error && (
        <p className="text-xs text-[#cf7b6b]">{error}</p>
      )}

      <form action={updateSequencePrompt} className="flex flex-col gap-3">
        <input type="hidden" name="projectId" value={String(projectId)} />
        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="sequence-prompt-textarea"
            className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]"
          >
            Prompt
          </label>
          <textarea
            id="sequence-prompt-textarea"
            name="sequencePrompt"
            defaultValue={initialSequencePrompt ?? ""}
            placeholder="Describe the sequence as a visual prompt..."
            rows={4}
            className="w-full rounded border border-[#2c3035] bg-[#141618] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#4b5158] resize-y focus:outline-none focus:border-[#3a4046] leading-relaxed"
          />
        </div>

        <p className="text-xs text-[#4b5158]">
          This prompt describes the visual and narrative direction of the sequence. It can guide shot generation and future prompt tools.
        </p>

        <div>
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Save Sequence Prompt
          </button>
        </div>
      </form>

      <SequencePromptLLMAssistPanel
        projectId={projectId}
        sequenceId={sequenceId}
        currentSequencePrompt={initialSequencePrompt}
        returnTo={returnTo}
      />
    </div>
  );
}
