import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
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

      <PageHeader
        title={project.name}
        badge={<StatusBadge status={project.status} />}
        actions={
          <Link
            href={`/projects/${pid}/edit`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            Edit Project
          </Link>
        }
      />

      {/* Pitch */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
          Pitch
        </p>
        {project.pitch ? (
          <p className="text-sm text-[#a4abb2] mb-3">{project.pitch}</p>
        ) : (
          <p className="text-sm text-[#4b5158] italic mb-3">No pitch yet.</p>
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
        <Card title="Story">
          {project.story ? (
            <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">
              {project.story}
            </p>
          ) : (
            <p className="text-sm text-[#4b5158] italic">
              No story yet — edit the project to add a narrative.
            </p>
          )}
        </Card>
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
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-4">
          Sequences ({seqs.length})
        </p>

        {seqs.length === 0 ? (
          <EmptyState
            title="No sequences yet."
            action={
              <Link
                href={`/projects/${pid}/sequences/new`}
                className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Add the first one →
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {seqs.map((seq, i) => (
              <Card key={seq.id}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-[#4b5158] font-mono text-xs shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/projects/${pid}/sequences/${seq.id}`}
                      className="font-semibold text-[#e7e9ec] hover:text-white transition-colors truncate"
                    >
                      {seq.title}
                    </Link>
                  </div>
                  <LLMActionButton label="Generate Shots" />
                </div>

                {seq.summary && (
                  <p className="text-sm text-[#6e767d] mb-3 ml-7">{seq.summary}</p>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1 ml-7 text-xs">
                  {seq.narrativePurpose && (
                    <span>
                      <span className="text-[#4b5158]">Purpose </span>
                      <span className="text-[#a4abb2]">{seq.narrativePurpose}</span>
                    </span>
                  )}
                  {seq.mood && (
                    <span>
                      <span className="text-[#4b5158]">Mood </span>
                      <span className="text-[#a4abb2]">{seq.mood}</span>
                    </span>
                  )}
                  {seq.locationHint && (
                    <span>
                      <span className="text-[#4b5158]">Location </span>
                      <span className="text-[#a4abb2]">{seq.locationHint}</span>
                    </span>
                  )}
                  {!seq.narrativePurpose && !seq.mood && !seq.locationHint && (
                    <span className="text-[#4b5158] italic">No narrative context yet.</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to project
        </Link>
      </div>
    </div>
  );
}
