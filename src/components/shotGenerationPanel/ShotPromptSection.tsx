import Link from "next/link";
import CompiledShotPromptPreviewPanel from "@/components/prompts/CompiledShotPromptPreviewPanel";
import InlineShotPromptEditor from "@/components/InlineShotPromptEditor";
import type { ComposedShotGenerationPrompt } from "@/lib/prompts/composeShotGenerationPrompt";

type Props = {
  /** SHOTPROMPT.SHOT.1 — the shared composer's output (Style/Subject Definition/six parts/Timeline), never the bare `compileShotPrompt` result. */
  compiledShotPrompt: ComposedShotGenerationPrompt;
  workflowKind: string;
  projectId: number;
  sequenceId: number;
  shotId: number;
  currentShotPrompt: string | null;
  returnTo: string;
  shotPromptSaved: boolean | undefined;
  shotPromptError: string | null | undefined;
};

/** "Shot Prompt" block: compiled preview, inline editor, link to Shot Detail (IND.CLIENTSPLIT.1, moved verbatim from ShotGenerationPanel.tsx). */
export default function ShotPromptSection({
  compiledShotPrompt,
  workflowKind,
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  currentShotPrompt,
  returnTo,
  shotPromptSaved,
  shotPromptError,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        Shot Prompt
      </p>
      <CompiledShotPromptPreviewPanel
        compiled={compiledShotPrompt}
        workflowKind={workflowKind}
      />
      <InlineShotPromptEditor
        projectId={pid}
        sequenceId={sid}
        shotId={shid}
        currentShotPrompt={currentShotPrompt}
        returnTo={returnTo}
        saved={shotPromptSaved}
        error={shotPromptError}
      />
      <Link
        href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
        className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
      >
        Open Shot Detail →
      </Link>
    </div>
  );
}
