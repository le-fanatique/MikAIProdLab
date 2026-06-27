import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import OutlineEditorForm from "@/components/OutlineEditorForm";
import OutlineGenerationPanel from "@/components/OutlineGenerationPanel";
import SequencesGenerationPanel from "@/components/SequencesGenerationPanel";
import SequenceContextEditor from "@/components/SequenceContextEditor";
import DeleteButton from "@/components/DeleteButton";
import { deleteSequenceAndReturn } from "@/actions/sequences";
import { getLLMSettings } from "@/lib/settings";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OutlinePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSP = await searchParams;
  const pid = parseInt(projectId, 10);

  const rawSequencesCreated = resolvedSP["sequencesCreated"];
  const sequencesCreated =
    typeof rawSequencesCreated === "string" ? parseInt(rawSequencesCreated, 10) : null;

  const [project, llmSettings] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, pid)).then((r) => r[0]),
    getLLMSettings(),
  ]);
  if (!project) notFound();

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  const seqIds = seqs.map((s) => s.id);
  const allShots =
    seqIds.length > 0
      ? await db
          .select()
          .from(shots)
          .where(inArray(shots.sequenceId, seqIds))
          .orderBy(asc(shots.orderIndex))
      : [];

  const shotsBySeq = new Map<number, typeof allShots>();
  for (const shot of allShots) {
    const list = shotsBySeq.get(shot.sequenceId) ?? [];
    list.push(shot);
    shotsBySeq.set(shot.sequenceId, list);
  }

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Outline" },
        ]}
      />

      <PageHeader
        title="Outline Builder"
        meta={project.name}
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

      {/* ── 1. Story Context ── */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
              Story Context
            </p>
            {project.pitch ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-1">
                  Pitch
                </p>
                <p className="text-sm text-[#a4abb2]">{project.pitch}</p>
              </div>
            ) : (
              <p className="text-sm text-[#4b5158] italic">No pitch yet.</p>
            )}
            {project.story && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-1">
                  Story
                </p>
                <p className="text-sm text-[#6e767d] line-clamp-3 leading-relaxed">
                  {project.story}
                </p>
              </div>
            )}
          </div>
          <Link
            href={`/projects/${pid}/story`}
            className="shrink-0 text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors whitespace-nowrap"
          >
            Open Story Workspace →
          </Link>
        </div>
      </Card>

      {/* ── 2. Project Outline Editor ── */}
      <Card title="Project Outline" className="mb-6">
        <OutlineEditorForm projectId={pid} initialOutline={project.outline} />
      </Card>

      {/* ── 3. Generate Outline Draft ── */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-3">
          Generate Outline Draft
        </p>
        <OutlineGenerationPanel
          projectId={pid}
          pitch={project.pitch}
          story={project.story}
          existingOutline={project.outline}
          isConfigured={!!llmSettings.model.trim()}
        />
      </div>

      {/* ── 4. Sequence Builder ── */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-3">
          Sequence Builder
        </p>
        <SequencesGenerationPanel
          projectId={pid}
          pitch={project.pitch}
          story={project.story}
          outline={project.outline}
          existingSequencesCount={seqs.length}
          isConfigured={!!llmSettings.model.trim()}
        />
      </div>

      {/* ── 5. Sequence Structure ── */}
      {sequencesCreated != null && Number.isFinite(sequencesCreated) && sequencesCreated > 0 && (
        <p className="mb-3 text-xs text-[#6b9e72]">
          Created {sequencesCreated} sequence{sequencesCreated !== 1 ? "s" : ""}.
        </p>
      )}
      <Card title="Sequence Structure" className="mb-6">
        {seqs.length === 0 ? (
          <EmptyState
            title="No sequences yet."
            description="Generate sequences using the Sequence Builder above."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {seqs.map((seq, seqIndex) => {
              const seqShots = shotsBySeq.get(seq.id) ?? [];
              return (
                <div key={seq.id}>
                  <div className="flex items-baseline gap-3 mb-1.5 pb-1.5 border-b border-[#232629]">
                    <span className="text-[#4b5158] font-mono text-xs shrink-0 w-6">
                      {String(seqIndex + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/projects/${pid}/sequences/${seq.id}`}
                      className="font-semibold text-[#e7e9ec] hover:text-white transition-colors truncate text-sm"
                    >
                      {seq.title}
                    </Link>
                    <span className="flex-1" />
                    <span className="text-xs text-[#4b5158] shrink-0 font-mono">
                      {seqShots.length} shot{seqShots.length !== 1 ? "s" : ""}
                    </span>
                    <DeleteButton
                      action={deleteSequenceAndReturn.bind(
                        null,
                        seq.id,
                        `/projects/${pid}/outline`
                      )}
                      confirm={`Delete "${seq.title}" and all its shots?`}
                      label="Delete"
                      className="text-[10px] text-[#3a4046] hover:text-red-400 transition-colors"
                    />
                  </div>

                  <SequenceContextEditor
                    sequenceId={seq.id}
                    projectId={pid}
                    summary={seq.summary}
                    description={seq.description}
                    narrativePurpose={seq.narrativePurpose}
                    mood={seq.mood}
                    locationHint={seq.locationHint}
                  />

                  {seqShots.length > 0 && (
                    <div className="flex flex-col gap-1.5 pl-9">
                      {seqShots.map((shot) => (
                        <div key={shot.id} className="flex items-baseline gap-3">
                          <span className="font-mono text-xs text-[#4b5158] w-20 shrink-0">
                            {shot.shotCode ?? "—"}
                          </span>
                          <Link
                            href={`/projects/${pid}/sequences/${seq.id}/shots/${shot.id}/edit`}
                            className="text-sm text-[#a4abb2] hover:text-[#e7e9ec] transition-colors truncate"
                          >
                            {shot.title}
                          </Link>
                          {shot.durationSeconds != null && (
                            <span className="text-xs text-[#4b5158] font-mono shrink-0">
                              {shot.durationSeconds}s
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        )}
      </Card>

      <div className="mt-6 pt-4 border-t border-[#232629]">
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
