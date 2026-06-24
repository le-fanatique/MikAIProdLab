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

      {/* ── 1. Story Foundation ── */}
      <Card title="Story Foundation" className="mb-6">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-1.5">
              Pitch
            </p>
            {project.pitch ? (
              <p className="text-sm text-[#a4abb2]">{project.pitch}</p>
            ) : (
              <p className="text-sm text-[#4b5158] italic">No pitch yet.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-1.5">
              Story
            </p>
            {project.story ? (
              <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">
                {project.story}
              </p>
            ) : (
              <p className="text-sm text-[#4b5158] italic">
                No story yet — generate one below or edit the project.
              </p>
            )}
          </div>

          {project.description && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-1.5">
                Notes
              </p>
              <p className="text-sm text-[#6e767d] whitespace-pre-wrap leading-relaxed">
                {project.description}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── 2. Story Generation ── */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-3">
          Story Generation
        </p>
        <StoryGenerationPanel
          projectId={pid}
          pitch={project.pitch}
          existingStory={project.story}
          isConfigured={isLlmConfigured}
        />
      </div>

      {/* ── 3. Outline Preparation ── */}
      <Card className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Outline Preparation
            </p>
            <p className="text-sm text-[#6e767d] leading-relaxed">
              The project outline maps your story into sequences and scenes before production begins.
              Review and validate the outline as the next step before generating sequences.
            </p>
          </div>
          <Link
            href={`/projects/${pid}/outline`}
            className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Open Outline
          </Link>
        </div>
      </Card>

      {/* ── 4. Existing Sequences ── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-4">
          Sequences ({seqs.length})
        </p>

        {seqs.length === 0 ? (
          <EmptyState
            title="No sequences yet."
            description="Build the outline first — sequences will be generated from it."
            action={
              <Link
                href={`/projects/${pid}/outline`}
                className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Open Outline
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {seqs.map((seq, i) => (
              <Card key={seq.id}>
                <div className="flex items-start justify-between gap-4 mb-2">
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
                  <Link
                    href={`/projects/${pid}/sequences/${seq.id}`}
                    className="shrink-0 text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                  >
                    View →
                  </Link>
                </div>

                {seq.summary && (
                  <p className="text-sm text-[#6e767d] mb-3 ml-7 leading-relaxed">
                    {seq.summary}
                  </p>
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
