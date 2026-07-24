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

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectStylePage({ params }: Props) {
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
      <ProjectStyleWorkspace
        projectId={pid}
        initialDraft={draftView}
        initialVersions={versionView}
        initialReferences={references}
        initialInfluences={influences}
      />
    </div>
  );
}
