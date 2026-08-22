import Link from "next/link";
import { db } from "@/db";
import { projects, assets, comfyWorkflows } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import SectionLabel from "@/components/SectionLabel";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import WorkflowTemplateGallery from "@/components/WorkflowTemplateGallery";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function AssetWorkflowListPage({ params, searchParams }: Props) {
  const { projectId, assetId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);
  const search = sp(resolvedSearchParams["q"]) ?? "";

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const workflows = await db
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

      <WorkflowTemplateGallery
        workflows={workflows}
        contexts={["asset"]}
        search={search}
        emptyTitle="No image workflows available."
        emptyDescription="Upload a ComfyUI API image workflow in Settings to enable asset generation."
        emptyAction={
          <Link
            href="/settings/workflows"
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Manage Workflows
          </Link>
        }
        renderActions={(wf) => (
          <Link
            href={`/projects/${pid}/assets/${aid}/workflows/${wf.id}/generate`}
            className="inline-block rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm text-center hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
          >
            Generate →
          </Link>
        )}
      />

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
