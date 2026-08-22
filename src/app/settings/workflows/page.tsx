import Link from "next/link";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { desc } from "drizzle-orm";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import WorkflowTemplateGallery, { type WorkflowGalleryEntry } from "@/components/WorkflowTemplateGallery";
import { deleteComfyWorkflow } from "@/actions/comfyWorkflows";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; q?: string }>;
};

function DefaultBadges({ workflow, defaults }: { workflow: WorkflowGalleryEntry & { id: number }; defaults: Awaited<ReturnType<typeof getWorkflowDefaults>> }) {
  return (
    <>
      {defaults.assetImageId === workflow.id && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#5b93d6]/30 text-[#5b93d6] bg-[#1a2535]">
          Asset Default
        </span>
      )}
      {defaults.shotImageId === workflow.id && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#5b93d6]/30 text-[#5b93d6] bg-[#1a2535]">
          Shot Keyframe Default
        </span>
      )}
      {defaults.shotVideoId === workflow.id && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#5b93d6]/30 text-[#5b93d6] bg-[#1a2535]">
          Shot Video Default
        </span>
      )}
    </>
  );
}

export default async function WorkflowsListPage({ searchParams }: Props) {
  const { error, q } = await searchParams;
  const search = q ?? "";
  const [allWorkflows, defaults] = await Promise.all([
    db
      .select({
        id: comfyWorkflows.id,
        name: comfyWorkflows.name,
        kind: comfyWorkflows.kind,
        status: comfyWorkflows.status,
        description: comfyWorkflows.description,
        category: comfyWorkflows.category,
        tags: comfyWorkflows.tags,
        contexts: comfyWorkflows.contexts,
        thumbnailPath: comfyWorkflows.thumbnailPath,
      })
      .from(comfyWorkflows)
      .orderBy(desc(comfyWorkflows.id)),
    getWorkflowDefaults(),
  ]);

  // WF.GALLERY.1 §3 — Settings is the manager, not the showcase: `status`
  // filters nothing here (unlike the four production galleries, which never
  // offer an archived workflow at all). Active and archived are shown in two
  // visibly separate groups instead.
  const activeWorkflows = allWorkflows.filter((wf) => wf.status === "active");
  const archivedWorkflows = allWorkflows.filter((wf) => wf.status === "archived");

  const renderActions = (wf: WorkflowGalleryEntry) => {
    const deleteAction = deleteComfyWorkflow.bind(null, wf.id);
    return (
      <div className="flex items-center gap-3">
        <Link
          href={`/settings/workflows/${wf.id}`}
          className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
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
    );
  };

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
        <div className="mb-4 rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">Workflow not found.</p>
        </div>
      )}

      {allWorkflows.length === 0 ? (
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
        <div className="flex flex-col gap-8">
          <form method="get" className="flex items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Search by name, description or tag…"
              className="w-full max-w-sm rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors"
            />
            <button
              type="submit"
              className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Search
            </button>
          </form>

          <div>
            {/* "Active" only means something opposite an "Archived" group —
                with none today, the label reads as an empty section header
                (retake feedback). Shown only once there is something to
                contrast it with. */}
            {archivedWorkflows.length > 0 && <SectionLabel label="Active" />}
            <WorkflowTemplateGallery
              workflows={activeWorkflows}
              search={search}
              emptyTitle="No active workflows."
              renderActions={renderActions}
              renderBadges={(wf) => <DefaultBadges workflow={wf} defaults={defaults} />}
              renderSearchForm={false}
            />
          </div>

          {archivedWorkflows.length > 0 && (
            <div>
              <SectionLabel label="Archived" />
              <WorkflowTemplateGallery
                workflows={archivedWorkflows}
                search={search}
                emptyTitle="No archived workflows."
                renderActions={renderActions}
                renderBadges={(wf) => <DefaultBadges workflow={wf} defaults={defaults} />}
                renderSearchForm={false}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href="/settings"
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Settings
        </Link>
      </div>
    </div>
  );
}
