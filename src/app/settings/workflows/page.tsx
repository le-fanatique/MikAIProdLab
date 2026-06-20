import Link from "next/link";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { desc } from "drizzle-orm";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import { deleteComfyWorkflow } from "@/actions/comfyWorkflows";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function WorkflowsListPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const workflows = await db
    .select()
    .from(comfyWorkflows)
    .orderBy(desc(comfyWorkflows.id));

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Workflows" },
        ]}
      />
      <PageHeader
        title="Workflows"
        actions={
          <Link
            href="/settings/workflows/new"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            + Add Workflow
          </Link>
        }
      />

      {error === "not_found" && (
        <p className="mb-4 text-sm text-[#cf7b6b]">Workflow not found.</p>
      )}

      {workflows.length === 0 ? (
        <EmptyState
          title="No workflows saved yet."
          action={
            <Link
              href="/settings/workflows/new"
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              + Add Workflow
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {workflows.map((wf) => {
            const deleteAction = deleteComfyWorkflow.bind(null, wf.id);
            return (
              <Card key={wf.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <WorkflowKindBadge kind={wf.kind} />
                      <span className="text-sm font-medium text-[#e7e9ec] truncate">
                        {wf.name}
                      </span>
                    </div>
                    {wf.description && (
                      <p className="text-xs text-[#a4abb2] mb-1">{wf.description}</p>
                    )}
                    {wf.sourceFilename && (
                      <p className="text-xs font-mono text-[#6e767d]">{wf.sourceFilename}</p>
                    )}
                    <p className="text-[10px] text-[#4b5158] mt-1">
                      Updated {fmtDate(wf.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/settings/workflows/${wf.id}`}
                      className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                    >
                      View
                    </Link>
                    <Link
                      href={`/settings/workflows/${wf.id}/edit`}
                      className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                    >
                      Edit
                    </Link>
                    <DeleteButton
                      action={deleteAction}
                      confirm="Delete this workflow?"
                      label="Delete"
                      className="text-xs text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
