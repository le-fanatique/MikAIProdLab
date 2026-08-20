import Link from "next/link";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";

type Props = {
  workflowKind: string;
  workflowName: string;
  projectId: number;
  sequenceId: number;
  shotId: number;
  workflowId: number;
  selectorUrl: string;
  closeUrl: string;
};

/** Panel header: workflow badge/name, "Open page", "Change Workflow", close (IND.CLIENTSPLIT.1, moved verbatim from ShotGenerationPanel.tsx). */
export default function ShotPanelHeader({
  workflowKind,
  workflowName,
  projectId: pid,
  sequenceId: sid,
  shotId: shid,
  workflowId: wid,
  selectorUrl,
  closeUrl,
}: Props) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#232629]">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-[#e7e9ec]">Generate Content</span>
        <div className="flex items-center gap-2">
          <WorkflowKindBadge kind={workflowKind} />
          <span className="text-xs text-[#a4abb2] truncate">{workflowName}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wid}/map`}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Open page ↗
        </Link>
        <Link
          href={selectorUrl}
          className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
        >
          Change Workflow
        </Link>
        <Link
          href={closeUrl}
          className="text-[#6e767d] hover:text-[#a4abb2] transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
          aria-label="Close panel"
        >
          ×
        </Link>
      </div>
    </div>
  );
}
