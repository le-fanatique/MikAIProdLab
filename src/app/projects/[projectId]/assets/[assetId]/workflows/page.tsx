import Link from "next/link";
import { db } from "@/db";
import { projects, assets, comfyWorkflows } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import AssetTypeBadge from "@/components/AssetTypeBadge";

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AssetWorkflowListPage({ params }: Props) {
  const { projectId, assetId } = await params;
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const imageWorkflows = await db
    .select({
      id: comfyWorkflows.id,
      name: comfyWorkflows.name,
      kind: comfyWorkflows.kind,
      description: comfyWorkflows.description,
      sourceFilename: comfyWorkflows.sourceFilename,
      updatedAt: comfyWorkflows.updatedAt,
    })
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.kind, "image"))
    .orderBy(desc(comfyWorkflows.updatedAt));

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name, href: `/projects/${pid}/assets/${aid}` },
          { label: "Image Workflows" },
        ]}
      />

      <PageHeader
        title="Image Workflows"
        badge={<AssetTypeBadge type={asset.type} />}
        meta={asset.name}
      />

      <SectionLabel label="Select Workflow" />
      <p className="text-xs text-[#6e767d] mb-4">
        Choose an image workflow to generate a reference for{" "}
        <span className="text-[#a4abb2]">{asset.name}</span>.
      </p>

      {imageWorkflows.length === 0 ? (
        <EmptyState
          title="No image workflows available."
          description="Upload a ComfyUI API image workflow in Settings to enable asset generation."
          action={
            <Link
              href="/settings/workflows"
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Manage Workflows
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {imageWorkflows.map((wf) => (
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
                <Link
                  href={`/projects/${pid}/assets/${aid}/workflows/${wf.id}/generate`}
                  className="shrink-0 rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
                >
                  Generate →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}/assets/${aid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Asset
        </Link>
      </div>
    </div>
  );
}
