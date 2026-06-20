import Link from "next/link";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import WorkflowInputKindBadge from "@/components/WorkflowInputKindBadge";
import WorkflowOutputKindBadge from "@/components/WorkflowOutputKindBadge";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { deleteComfyWorkflow } from "@/actions/comfyWorkflows";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ workflowId: string }>;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { workflowId } = await params;
  const wid = parseInt(workflowId, 10);
  if (isNaN(wid)) notFound();

  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();

  const parsed = parseComfyWorkflow(workflow.workflowJson);
  const deleteAction = deleteComfyWorkflow.bind(null, wid);

  const kindMismatch =
    parsed !== null &&
    parsed.inferredKind !== "unknown" &&
    parsed.inferredKind !== workflow.kind;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Workflows", href: "/settings/workflows" },
          { label: workflow.name },
        ]}
      />
      <PageHeader
        title={workflow.name}
        badge={<WorkflowKindBadge kind={workflow.kind} />}
        actions={
          <Link
            href={`/settings/workflows/${wid}/edit`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Edit Workflow
          </Link>
        }
      />

      {parsed === null && (
        <p className="mb-4 text-sm text-[#cf7b6b]">
          This workflow JSON could not be parsed.
        </p>
      )}

      {kindMismatch && parsed !== null && (
        <p className="mb-4 text-sm text-[#cda24f]">
          {workflow.kind === "image"
            ? "This workflow is marked as Image, but detected outputs suggest Video."
            : "This workflow is marked as Video, but detected outputs suggest Image."}
        </p>
      )}

      {/* Details */}
      <Card title="Details" className="mb-4">
        <dl className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <dt className="text-xs text-[#6e767d] w-28 shrink-0">Kind</dt>
            <dd><WorkflowKindBadge kind={workflow.kind} /></dd>
          </div>
          {workflow.description && (
            <div className="flex items-start gap-4">
              <dt className="text-xs text-[#6e767d] w-28 shrink-0">Description</dt>
              <dd className="text-sm text-[#a4abb2]">{workflow.description}</dd>
            </div>
          )}
          {workflow.sourceFilename && (
            <div className="flex items-start gap-4">
              <dt className="text-xs text-[#6e767d] w-28 shrink-0">Source file</dt>
              <dd className="text-xs font-mono text-[#a4abb2]">{workflow.sourceFilename}</dd>
            </div>
          )}
          <div className="flex items-start gap-4">
            <dt className="text-xs text-[#6e767d] w-28 shrink-0">Created</dt>
            <dd className="text-xs text-[#a4abb2]">{fmtDate(workflow.createdAt)}</dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="text-xs text-[#6e767d] w-28 shrink-0">Updated</dt>
            <dd className="text-xs text-[#a4abb2]">{fmtDate(workflow.updatedAt)}</dd>
          </div>
          {parsed !== null && (
            <div className="flex items-start gap-4">
              <dt className="text-xs text-[#6e767d] w-28 shrink-0">Node count</dt>
              <dd className="text-xs text-[#a4abb2]">{parsed.nodeCount}</dd>
            </div>
          )}
          {parsed !== null && (
            <div className="flex items-start gap-4">
              <dt className="text-xs text-[#6e767d] w-28 shrink-0">Inferred kind</dt>
              <dd><WorkflowKindBadge kind={parsed.inferredKind === "unknown" ? "unknown" : parsed.inferredKind} /></dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Detected Inputs */}
      <Card title="Detected Inputs" className="mb-4">
        {parsed === null || parsed.inputs.length === 0 ? (
          <EmptyState title="No inputs detected." />
        ) : (
          <div className="flex flex-col">
            {parsed.inputs.map((input) => (
              <div
                key={input.nodeId}
                className="border-b border-[#232629] last:border-0 py-2.5 flex items-start gap-3"
              >
                <WorkflowInputKindBadge kind={input.kind} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e7e9ec]">{input.label}</p>
                  <p className="text-xs font-mono text-[#6e767d]">{input.classType}</p>
                  <p className="text-[10px] text-[#4b5158]">node {input.nodeId}</p>
                  {input.defaultValue !== null && input.defaultValue !== "" && (
                    <p className="text-xs text-[#a4abb2] mt-0.5 truncate">
                      Default: <span className="font-mono">{input.defaultValue}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Detected Outputs */}
      <Card title="Detected Outputs" className="mb-6">
        {parsed === null || parsed.outputs.length === 0 ? (
          <EmptyState title="No outputs detected." />
        ) : (
          <div className="flex flex-col">
            {parsed.outputs.map((output) => (
              <div
                key={output.nodeId}
                className="border-b border-[#232629] last:border-0 py-2.5 flex items-start gap-3"
              >
                <WorkflowOutputKindBadge kind={output.kind} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e7e9ec]">{output.label}</p>
                  <p className="text-xs font-mono text-[#6e767d]">{output.classType}</p>
                  <p className="text-[10px] text-[#4b5158]">node {output.nodeId}</p>
                  {output.filenamePrefix && (
                    <p className="text-xs text-[#a4abb2] mt-0.5 truncate">
                      Prefix: <span className="font-mono">{output.filenamePrefix}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[#232629]">
        <Link
          href="/settings/workflows"
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Workflows
        </Link>
        <DeleteButton
          action={deleteAction}
          confirm="Delete this workflow?"
          label="Delete Workflow"
          className="text-sm text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
        />
      </div>
    </div>
  );
}
