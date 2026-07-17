import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, comfyWorkflows, sequenceStoryboardImages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import { refImageUrl } from "@/lib/refImageUrl";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

/**
 * SEQGEN.VIDEO.1 — Sequence-level VIDEO workflow selector, the twin of
 * `.../storyboard/workflows/page.tsx` (image). Only `kind="video"`
 * workflows are offered. The source Sequence Storyboard board is chosen
 * BEFORE reaching this page (Lot A, on the Storyboard workspace itself) and
 * is never implicit — `sourceStoryboardImageId` is required and re-validated
 * here against the active Sequence on every render, never assumed from a
 * single/approved draft.
 */
export default async function SequenceVideoWorkflowListPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const sourceStoryboardImageIdRaw = sp(resolvedSearchParams["sourceStoryboardImageId"]);
  const sourceStoryboardImageId = sourceStoryboardImageIdRaw ? parseInt(sourceStoryboardImageIdRaw, 10) : null;

  const storyboardWorkspaceReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;

  if (!Number.isInteger(sourceStoryboardImageId) || sourceStoryboardImageId === null || sourceStoryboardImageId <= 0) {
    return (
      <div>
        <Breadcrumb
          crumbs={[
            { label: "Projects", href: "/projects" },
            { label: project.name, href: `/projects/${pid}` },
            { label: "Storyboard", href: storyboardWorkspaceReturnTo },
            { label: "Generate Sequence Video" },
          ]}
        />
        <PageHeader title="Generate Sequence Video" meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title} />
        <EmptyState
          title="No Sequence Storyboard board chosen."
          description="Generate Sequence Video always starts from an explicitly chosen Sequence Storyboard draft. Go back to Storyboard and use “Generate Sequence Video” on the board you want to use."
          action={
            <Link href={storyboardWorkspaceReturnTo} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
              ← Back to Storyboard
            </Link>
          }
        />
      </div>
    );
  }

  const [board] = await db.select().from(sequenceStoryboardImages).where(eq(sequenceStoryboardImages.id, sourceStoryboardImageId));
  if (!board || board.sequenceId !== sid) notFound();

  const videoWorkflows = await db
    .select({
      id: comfyWorkflows.id,
      name: comfyWorkflows.name,
      kind: comfyWorkflows.kind,
      description: comfyWorkflows.description,
      sourceFilename: comfyWorkflows.sourceFilename,
      updatedAt: comfyWorkflows.updatedAt,
    })
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.kind, "video"))
    .orderBy(desc(comfyWorkflows.updatedAt));

  const storyboardRefs = sp(resolvedSearchParams["storyboardRefs"]) ?? "";
  const linkParams = new URLSearchParams({ sourceStoryboardImageId: String(sourceStoryboardImageId) });
  if (storyboardRefs) linkParams.set("storyboardRefs", storyboardRefs);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardWorkspaceReturnTo },
          { label: "Generate Sequence Video" },
        ]}
      />

      <PageHeader title="Generate Sequence Video" meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title} />

      <Card title="Source board" className="mb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-28 aspect-video bg-[#0d0e10] shrink-0 overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={refImageUrl(board.imagePath)} alt="" className="w-full h-full object-cover" />
          </div>
          <p className="text-xs text-[#a4abb2]">
            This Sequence Video will be generated from this Sequence Storyboard board, used as the visual plan for
            every Shot in order. Choose a different board from Storyboard if this is not the right one.
          </p>
        </div>
      </Card>

      <p className="text-xs text-[#6e767d] mb-4">
        Choose a video workflow to generate one continuous video for <span className="text-[#a4abb2]">{sequence.title}</span>.
      </p>

      {videoWorkflows.length === 0 ? (
        <EmptyState
          title="No video workflows available."
          description="Upload a ComfyUI API video workflow (kind: video) in Settings to enable Sequence Video generation."
          action={
            <Link href="/settings/workflows" className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
              Manage Workflows
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {videoWorkflows.map((wf) => (
            <Card key={wf.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <WorkflowKindBadge kind={wf.kind} />
                    <span className="text-sm font-medium text-[#e7e9ec] truncate">{wf.name}</span>
                  </div>
                  {wf.description && <p className="text-xs text-[#a4abb2] mb-1">{wf.description}</p>}
                  {wf.sourceFilename && <p className="text-xs font-mono text-[#6e767d]">{wf.sourceFilename}</p>}
                  <p className="text-[10px] text-[#4b5158] mt-1">Updated {fmtDate(wf.updatedAt)}</p>
                </div>
                <Link
                  href={`/projects/${pid}/sequences/${sid}/storyboard/video/workflows/${wf.id}/generate?${linkParams.toString()}`}
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
        <Link href={storyboardWorkspaceReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
