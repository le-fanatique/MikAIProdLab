import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { getWorkingDraft, getVersionHistory } from "@/actions/projectStyle";
import { listProjectStyleReferences } from "@/actions/projectStyleReferences";
import { listProjectStyleInfluences } from "@/actions/projectStyleInfluences";
import ProjectStyleWorkspace from "@/components/projectStyle/ProjectStyleWorkspace";
import { styleAdjustDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/styleAdjustDirected";
import InvokePushedBanner from "@/components/invoke/InvokePushedBanner";
import InvokeSyncBanner from "@/components/invoke/InvokeSyncBanner";
import InvokeSyncButton from "@/components/invoke/InvokeSyncButton";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectStylePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isInteger(pid) || pid <= 0) notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [draftView, versionView, references, influences] = await Promise.all([
    getWorkingDraft(pid),
    getVersionHistory(pid),
    listProjectStyleReferences(pid),
    listProjectStyleInfluences(pid),
  ]);

  // INVOKE.STYLE.1 — same search-param contract as every other Invoke-linked
  // entity page (e.g. Asset Detail): the page owns reading these and
  // deciding whether to render, the banners themselves stay stateless.
  const resolvedSearchParams = await searchParams;
  function singleParam(raw: string | string[] | undefined): string | undefined {
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  }
  const invokeError = singleParam(resolvedSearchParams["invokeError"]);
  const invokePushed = singleParam(resolvedSearchParams["invokePushed"]);
  const invokeBoardName = singleParam(resolvedSearchParams["invokeBoardName"]);
  const invokeUrl = singleParam(resolvedSearchParams["invokeUrl"]);
  const invokeSyncImported = singleParam(resolvedSearchParams["invokeSyncImported"]);
  const invokeSyncHref = singleParam(resolvedSearchParams["invokeSyncHref"]);
  const invokeSyncError = singleParam(resolvedSearchParams["invokeSyncError"]);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Project Style" },
        ]}
      />
      <PageHeader title="Project Style" meta={project.name} />
      <InvokeSyncBanner importedMessage={invokeSyncImported} importedHref={invokeSyncHref} error={invokeSyncError} />
      <InvokeSyncButton returnTo={`/projects/${pid}/style`} />
      {invokeError && (
        <div className="mb-4 rounded border border-[#cf7b6b]/30 bg-[#cf7b6b]/5 px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">{invokeError}</p>
        </div>
      )}
      {invokePushed === "1" && invokeBoardName && invokeUrl && (
        <InvokePushedBanner boardName={invokeBoardName} invokeUrl={invokeUrl} />
      )}
      <ProjectStyleWorkspace
        projectId={pid}
        initialDraft={draftView}
        initialVersions={versionView}
        initialReferences={references}
        initialInfluences={influences}
        styleAdjustCommitAdvisory={styleAdjustDirectedDescriptor.commitAdvisory}
      />
    </div>
  );
}
