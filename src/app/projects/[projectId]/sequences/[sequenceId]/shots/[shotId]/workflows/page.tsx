import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, shots, comfyWorkflows } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import SectionLabel from "@/components/SectionLabel";
import WorkflowTemplateGallery from "@/components/WorkflowTemplateGallery";
import type { WorkflowContextId } from "@/lib/comfy/workflowCatalog";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function WorkflowPickerPage({ params, searchParams }: Props) {
  const { projectId, sequenceId, shotId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  // SEQGEN.STORYBOARD.2: when arriving from the Storyboard workspace, only
  // image workflows are relevant (storyboard is an image-only step). Both
  // the `storyboard` flag and the `storyboardRefs` selection (retake fix —
  // previously dropped here) must be forwarded into the generate page: the
  // former lets ShotGenerationPanel offer "Save as Storyboard Draft", the
  // latter is the actual reference-selection transport it filters
  // `availableImages` against. Both flow through that page's existing
  // currentSearchParams passthrough — no other file needs to change for
  // that part. WF.GALLERY.1 — narrowing to the "shot-keyframe" context alone
  // (image-only, by WORKFLOW_CONTEXTS) reproduces the same restriction via
  // `isWorkflowOfferedIn` instead of a separate `kind === "image"` filter.
  const isStoryboardContext = resolvedSearchParams["storyboard"] === "1";
  const storyboardRefsValue = sp(resolvedSearchParams["storyboardRefs"]);
  const workflowLinkSuffix = isStoryboardContext
    ? `?storyboard=1${storyboardRefsValue ? `&storyboardRefs=${encodeURIComponent(storyboardRefsValue)}` : ""}`
    : "";
  const search = sp(resolvedSearchParams["q"]) ?? "";

  const contexts: WorkflowContextId[] = isStoryboardContext
    ? ["shot-keyframe"]
    : ["shot-keyframe", "shot-video"];

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

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

  const shotLabel = shot.shotCode
    ? `${shot.shotCode} — ${shot.title}`
    : shot.title;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          {
            label: shot.shotCode ?? shot.title,
            href: `/projects/${pid}/sequences/${sid}/shots/${shid}`,
          },
          { label: "Shot Workflows" },
        ]}
      />

      <PageHeader
        title="Shot Workflows"
        meta={shotLabel}
      />

      <SectionLabel label="Select Workflow" />
      <p className="text-xs text-[#6e767d] mb-4">
        Choose a workflow to generate output for{" "}
        <span className="text-[#a4abb2]">{shotLabel}</span>.
      </p>

      <WorkflowTemplateGallery
        workflows={workflows}
        contexts={contexts}
        search={search}
        emptyTitle={isStoryboardContext ? "No image workflows saved." : "No workflows saved."}
        emptyDescription="Upload a ComfyUI API workflow in Settings before mapping shot inputs."
        emptyAction={
          <Link
            href="/settings/workflows"
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Manage Workflows
          </Link>
        }
        hiddenFields={
          <>
            {isStoryboardContext && <input type="hidden" name="storyboard" value="1" />}
            {storyboardRefsValue && (
              <input type="hidden" name="storyboardRefs" value={storyboardRefsValue} />
            )}
          </>
        }
        renderActions={(wf) => (
          <div className="flex flex-col gap-1.5">
            {wf.kind === "video" && (
              <p className="text-[10px] text-[#6e767d]">
                Uses shot prompt and timeline segments.
              </p>
            )}
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}/workflows/${wf.id}/map${workflowLinkSuffix}`}
              className="inline-block rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm text-center hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
            >
              {wf.kind === "video" ? "Generate Video →" : "Generate Keyframe →"}
            </Link>
          </div>
        )}
      />

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Shot
        </Link>
      </div>
    </div>
  );
}
