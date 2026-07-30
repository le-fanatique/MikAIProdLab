import { db } from "@/db";
import { projects, comfyWorkflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { getWorkingDraft, getVersionHistory, type WorkingDraftView, type ActiveVersionView } from "@/actions/projectStyle";
import { listProjectStyleReferences, type ProjectStyleReferenceView } from "@/actions/projectStyleReferences";
import { listLookTestsAction, type LookTestListItem } from "@/actions/lookDevelopment";
import LookDevelopmentBench from "@/components/projectStyle/lookDevelopment/LookDevelopmentBench";

type Props = {
  params: Promise<{ projectId: string }>;
};

type WorkflowRow = { id: number; name: string; kind: "image" | "video"; workflowJson: string };

export type LookDevelopmentLoadErrors = {
  draft?: string;
  versions?: string;
  references?: string;
  workflows?: string;
  tests?: string;
};

// ---------------------------------------------------------------------------
// STYLE.1.G.UI.1 — Look Development Bench entry.
//
// Server-side ownership validation is strict: an invalid or unknown Project
// id 404s before any Look Development data is read. Every read below is
// independent and its OWN failure is recorded as an explicit, sanitized
// diagnostic in `loadErrors` — never silently downgraded to "no Style"/"no
// references"/"no workflows" — while every other, independent, healthy
// section still renders normally. Never touches unrelated Project Style
// content (a separate route/page).
// ---------------------------------------------------------------------------

export default async function LookDevelopmentPage({ params }: Props) {
  const { projectId } = await params;
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isInteger(pid) || pid <= 0) notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const loadErrors: LookDevelopmentLoadErrors = {};

  const [draftOutcome, versionsOutcome, referencesOutcome, workflowsOutcome, testsOutcome] = await Promise.allSettled([
    getWorkingDraft(pid),
    getVersionHistory(pid),
    listProjectStyleReferences(pid),
    db
      .select({ id: comfyWorkflows.id, name: comfyWorkflows.name, kind: comfyWorkflows.kind, workflowJson: comfyWorkflows.workflowJson })
      .from(comfyWorkflows),
    listLookTestsAction(pid),
  ]);

  let draftView: WorkingDraftView | null = null;
  if (draftOutcome.status === "fulfilled") {
    draftView = draftOutcome.value;
  } else {
    loadErrors.draft = "Failed to load the Working Draft. Style-source selection may be incomplete.";
  }

  let versionView: ActiveVersionView = { pointer: null, activeVersion: null, history: [] };
  if (versionsOutcome.status === "fulfilled") {
    versionView = versionsOutcome.value;
  } else {
    loadErrors.versions = "Failed to load Published Style versions. Style-source selection may be incomplete.";
  }

  let references: ProjectStyleReferenceView[] = [];
  if (referencesOutcome.status === "fulfilled") {
    references = referencesOutcome.value;
  } else {
    loadErrors.references = "Failed to load the Reference Board.";
  }

  let workflows: WorkflowRow[] = [];
  if (workflowsOutcome.status === "fulfilled") {
    workflows = workflowsOutcome.value;
  } else {
    loadErrors.workflows = "Failed to load the workflow library. Workflow selection may be incomplete.";
  }

  let tests: LookTestListItem[] = [];
  if (testsOutcome.status === "fulfilled" && testsOutcome.value.ok) {
    tests = testsOutcome.value.tests;
  } else {
    loadErrors.tests = "Failed to load Recent Look Tests.";
  }

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Project Style", href: `/projects/${pid}/style` },
          { label: "Look Development" },
        ]}
      />
      <PageHeader title="Look Development Bench" meta={project.name} />
      <LookDevelopmentBench
        projectId={pid}
        project={{ name: project.name, pitch: project.pitch, description: project.description, story: project.story }}
        initialDraft={draftView}
        initialVersions={versionView}
        initialReferences={references}
        initialWorkflows={workflows}
        initialTests={tests}
        initialLoadErrors={loadErrors}
      />
    </div>
  );
}
