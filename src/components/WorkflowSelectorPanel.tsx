import Link from "next/link";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import EmptyState from "@/components/EmptyState";

type WorkflowOption = {
  id: number;
  name: string;
  kind: string;
  description: string | null;
};

type Props = {
  workflows: WorkflowOption[];
  basePanelUrl: string;
  closeUrl: string;
  context: "asset" | "shot";
};

function WorkflowCard({ wf, href }: { wf: WorkflowOption; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 rounded border border-[#232629] bg-[#1a1d20] px-4 py-3 hover:border-[#2c3035] hover:bg-[#212529] transition-colors group"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <WorkflowKindBadge kind={wf.kind} />
          <span className="text-sm font-medium text-[#e7e9ec]">{wf.name}</span>
        </div>
        {wf.description && (
          <p className="text-xs text-[#6e767d] line-clamp-2">{wf.description}</p>
        )}
      </div>
      <span className="text-[#3a4046] text-sm group-hover:text-[#6e767d] transition-colors shrink-0 mt-0.5">
        →
      </span>
    </Link>
  );
}

function WorkflowGroup({
  label,
  workflows,
  basePanelUrl,
}: {
  label: string;
  workflows: WorkflowOption[];
  basePanelUrl: string;
}) {
  const count = workflows.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">{label}</p>
        <span className="text-[10px] text-[#4b5158]">
          · {count} {count === 1 ? "workflow" : "workflows"}
        </span>
      </div>
      {workflows.map((wf) => (
        <WorkflowCard key={wf.id} wf={wf} href={`${basePanelUrl}&workflowId=${wf.id}`} />
      ))}
    </div>
  );
}

export default function WorkflowSelectorPanel({
  workflows,
  basePanelUrl,
  closeUrl,
  context,
}: Props) {
  const imageWorkflows = workflows.filter((wf) => wf.kind === "image");
  const videoWorkflows = workflows.filter((wf) => wf.kind === "video");
  const isEmpty = workflows.length === 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#232629]">
        <span className="text-sm font-medium text-[#e7e9ec]">Generate Content</span>
        <Link
          href={closeUrl}
          className="text-[#4b5158] hover:text-[#a4abb2] transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
          aria-label="Close panel"
        >
          ×
        </Link>
      </div>

      <div className="px-5 py-4 flex flex-col gap-5">
        {isEmpty ? (
          <EmptyState
            title={
              context === "asset"
                ? "No image workflows available."
                : "No workflows available."
            }
            description={
              context === "asset"
                ? "Upload a ComfyUI image workflow in Settings to enable asset generation."
                : "Upload a ComfyUI workflow in Settings to enable generation."
            }
            action={
              <Link
                href="/settings/workflows"
                className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Manage Workflows →
              </Link>
            }
          />
        ) : context === "asset" ? (
          <WorkflowGroup
            label="Image Workflows"
            workflows={workflows}
            basePanelUrl={basePanelUrl}
          />
        ) : (
          <>
            {imageWorkflows.length > 0 && (
              <WorkflowGroup
                label="Keyframe & Image"
                workflows={imageWorkflows}
                basePanelUrl={basePanelUrl}
              />
            )}
            {videoWorkflows.length > 0 && (
              <WorkflowGroup
                label="Video"
                workflows={videoWorkflows}
                basePanelUrl={basePanelUrl}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
