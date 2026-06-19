import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import LLMActionButton from "@/components/LLMActionButton";
import StoryGenerationPanel from "@/components/StoryGenerationPanel";
import { getLLMSettings } from "@/lib/settings";

type Props = { params: Promise<{ projectId: string }> };

export default async function StoryPage({ params }: Props) {
  const { projectId } = await params;
  const pid = parseInt(projectId, 10);

  const [project, llmSettings] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, pid)).then((r) => r[0]),
    getLLMSettings(),
  ]);
  const isLlmConfigured = llmSettings.isConfigured;
  if (!project) notFound();

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Story" },
        ]}
      />

      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
        <Link
          href={`/projects/${pid}/edit`}
          className="rounded border border-neutral-700 text-neutral-400 px-3 py-1.5 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors shrink-0"
        >
          Edit Project
        </Link>
      </div>

      {/* Pitch */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 mb-2">
          Pitch
        </p>
        {project.pitch ? (
          <p className="text-sm text-neutral-300 mb-3">{project.pitch}</p>
        ) : (
          <p className="text-sm text-neutral-700 italic mb-3">No pitch yet.</p>
        )}
        <StoryGenerationPanel
          projectId={pid}
          pitch={project.pitch}
          existingStory={project.story}
          isConfigured={isLlmConfigured}
        />
      </div>

      {/* Story */}
      <div className="mb-8 mt-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 mb-2">
          Story
        </p>
        {project.story ? (
          <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed border-l-2 border-neutral-800 pl-4">
            {project.story}
          </p>
        ) : (
          <p className="text-sm text-neutral-700 italic border-l-2 border-neutral-800 pl-4">
            No story yet — edit the project to add a narrative.
          </p>
        )}
      </div>

      {/* Generate sequences — placeholder */}
      <div className="mb-10">
        <LLMActionButton
          label="Generate Sequences from Story"
          hint="Requires LLM provider configuration in .env.local"
        />
      </div>

      {/* Sequences narrative overview */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 mb-4">
          Sequences ({seqs.length})
        </p>

        {seqs.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 border-dashed px-6 py-10 text-center text-neutral-600 text-sm">
            No sequences yet.{" "}
            <Link
              href={`/projects/${pid}/sequences/new`}
              className="underline hover:text-neutral-400"
            >
              Add the first one.
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {seqs.map((seq, i) => (
              <div key={seq.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-neutral-700 font-mono text-xs shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/projects/${pid}/sequences/${seq.id}`}
                      className="font-semibold text-neutral-100 hover:text-white transition-colors truncate"
                    >
                      {seq.title}
                    </Link>
                  </div>
                  <LLMActionButton label="Generate Shots" />
                </div>

                {seq.summary && (
                  <p className="text-sm text-neutral-500 mb-3 ml-7">{seq.summary}</p>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 ml-7 text-xs">
                  {seq.narrativePurpose && (
                    <span>
                      <span className="text-neutral-600">Purpose </span>
                      <span className="text-neutral-400">{seq.narrativePurpose}</span>
                    </span>
                  )}
                  {seq.mood && (
                    <span>
                      <span className="text-neutral-600">Mood </span>
                      <span className="text-neutral-400">{seq.mood}</span>
                    </span>
                  )}
                  {seq.locationHint && (
                    <span>
                      <span className="text-neutral-600">Location </span>
                      <span className="text-neutral-400">{seq.locationHint}</span>
                    </span>
                  )}
                  {!seq.narrativePurpose && !seq.mood && !seq.locationHint && (
                    <span className="text-neutral-700 italic">No narrative context yet.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 pt-4 border-t border-neutral-900">
        <Link
          href={`/projects/${pid}`}
          className="text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          ← Back to project
        </Link>
      </div>
    </div>
  );
}
