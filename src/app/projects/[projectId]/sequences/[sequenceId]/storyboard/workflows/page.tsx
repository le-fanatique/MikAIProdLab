import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, comfyWorkflows } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import WorkflowTemplateGallery from "@/components/WorkflowTemplateGallery";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

/**
 * SEQGEN.STORYBOARD.3 — Sequence-level workflow selector, the twin of the
 * per-Shot `.../shots/[shotId]/workflows/page.tsx` and
 * `.../assets/[assetId]/workflows/page.tsx`. Only image workflows are
 * offered (a Sequence Storyboard is a single contact-sheet image), and the
 * Storyboard Assets reference selection is forwarded unchanged into each
 * workflow's generate link — no new selection mechanism.
 */
export default async function SequenceStoryboardWorkflowListPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const search = sp(resolvedSearchParams["q"]) ?? "";

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

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
      isFavorite: comfyWorkflows.isFavorite,
    })
    .from(comfyWorkflows)
    .orderBy(desc(comfyWorkflows.updatedAt));

  const storyboardRefs = sp(resolvedSearchParams["storyboardRefs"]) ?? "";
  const linkSuffix = storyboardRefs ? `?storyboardRefs=${encodeURIComponent(storyboardRefs)}` : "";
  // SEQGEN.STORYBOARD.3 (retake 2) — every link back to Storyboard must
  // carry the current storyboardRefs selection (same fix as the generate
  // page), otherwise casting-reference checkboxes appear deselected on return.
  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}${
    storyboardRefs ? `&storyboardRefs=${encodeURIComponent(storyboardRefs)}` : ""
  }`;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardWorkspaceReturnTo },
          { label: "Generate Sequence Storyboard" },
        ]}
      />

      <PageHeader title="Generate Sequence Storyboard" meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title} />

      <p className="text-xs text-[#6e767d] mb-4">
        Choose an image workflow to generate a single contact-sheet storyboard for{" "}
        <span className="text-[#a4abb2]">{sequence.title}</span>.
      </p>

      <WorkflowTemplateGallery
        workflows={workflows}
        contexts={["storyboard"]}
        search={search}
        emptyTitle="No image workflows available."
        emptyDescription="Upload a ComfyUI API image workflow in Settings to enable Sequence Storyboard generation."
        emptyAction={
          <Link
            href="/settings/workflows"
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Manage Workflows
          </Link>
        }
        hiddenFields={
          storyboardRefs ? <input type="hidden" name="storyboardRefs" value={storyboardRefs} /> : undefined
        }
        renderActions={(wf) => (
          <Link
            href={`/projects/${pid}/sequences/${sid}/storyboard/workflows/${wf.id}/generate${linkSuffix}`}
            className="inline-block rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm text-center hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
          >
            Generate →
          </Link>
        )}
        favoritePagePath={`/projects/${pid}/sequences/${sid}/storyboard/workflows`}
      />

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={storyboardWorkspaceReturnTo}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
