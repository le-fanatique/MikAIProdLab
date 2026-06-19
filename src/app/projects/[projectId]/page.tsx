import { db } from "@/db";
import { projects, sequences, shots, assets } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import { deleteProject } from "@/actions/projects";

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, id))
    .orderBy(asc(sequences.orderIndex));

  const seqIds = seqs.map((s) => s.id);
  let totalShots = 0;
  if (seqIds.length > 0) {
    const shotRows = await db
      .select({ id: shots.id })
      .from(shots)
      .where(inArray(shots.sequenceId, seqIds));
    totalShots = shotRows.length;
  }

  const assetRows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.projectId, id));
  const totalAssets = assetRows.length;

  const deleteAction = deleteProject.bind(null, id);

  return (
    <div>
      <Breadcrumb
        crumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
      />

      <PageHeader
        title={project.name}
        badge={<StatusBadge status={project.status} />}
        meta={`${seqs.length} sequence${seqs.length !== 1 ? "s" : ""} · ${totalShots} shot${totalShots !== 1 ? "s" : ""} · ${totalAssets} asset${totalAssets !== 1 ? "s" : ""}`}
        actions={
          <>
            <Link
              href={`/projects/${id}/story`}
              className="rounded border border-[#2c3035] text-[#6e767d] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
            >
              Story
            </Link>
            <Link
              href={`/projects/${id}/outline`}
              className="rounded border border-[#2c3035] text-[#6e767d] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
            >
              Outline
            </Link>
            <Link
              href={`/projects/${id}/edit`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Edit
            </Link>
            <DeleteButton
              action={deleteAction}
              confirm="Delete this project and all its sequences/shots?"
              className="rounded border border-[#cf7b6b]/30 text-[#cf7b6b] px-3 py-1.5 text-sm hover:border-[#cf7b6b]/60 hover:text-[#e0a194] transition-colors"
            />
          </>
        }
      />

      {/* Pitch */}
      {project.pitch && (
        <p className="text-[#a4abb2] text-sm mb-4 leading-relaxed">{project.pitch}</p>
      )}

      {/* Story preview */}
      {project.story && (
        <div className="mb-8 border-l-2 border-[#232629] pl-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
            Story
          </p>
          <p className="text-sm text-[#6e767d] whitespace-pre-wrap leading-relaxed line-clamp-3">
            {project.story}
          </p>
          <Link
            href={`/projects/${id}/story`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors mt-2 inline-block"
          >
            View full story →
          </Link>
        </div>
      )}

      {/* Visual tabs */}
      <div className="flex items-center gap-0 mb-6 border-b border-[#232629]">
        <div className="px-4 py-2 text-sm font-medium text-[#e7e9ec] border-b-2 border-[#5b93d6] -mb-px">
          Sequences
        </div>
        <Link
          href={`/projects/${id}/assets`}
          className="px-4 py-2 text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Assets
        </Link>
        <div className="px-4 py-2 text-sm text-[#4b5158] cursor-not-allowed opacity-50 select-none">
          Project Style
        </div>
        <div className="ml-auto pb-2">
          <Link
            href={`/projects/${id}/sequences/new`}
            className="rounded bg-[#212529] text-[#a4abb2] px-3 py-1.5 text-sm hover:bg-[#2c3035] hover:text-[#e7e9ec] transition-colors"
          >
            + Add Sequence
          </Link>
        </div>
      </div>

      {seqs.length === 0 ? (
        <EmptyState
          title="No sequences yet."
          action={
            <Link
              href={`/projects/${id}/sequences/new`}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Add the first sequence →
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {seqs.map((seq, i) => (
            <Link
              key={seq.id}
              href={`/projects/${id}/sequences/${seq.id}`}
              className="flex items-center gap-4 rounded-lg border border-[#232629] bg-[#1a1d20] px-5 py-3.5 hover:border-[#2c3035] hover:bg-[#212529] transition-colors group"
            >
              <span className="text-[#4b5158] text-sm font-mono w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[#e7e9ec] group-hover:text-white transition-colors">
                  {seq.title}
                </span>
                {seq.summary && (
                  <p className="text-xs text-[#6e767d] truncate mt-0.5">{seq.summary}</p>
                )}
                {(seq.mood || seq.locationHint) && (
                  <div className="flex gap-3 mt-1">
                    {seq.mood && (
                      <span className="text-[10px] text-[#4b5158]">
                        <span className="text-[#3a4046]">Mood </span>
                        {seq.mood}
                      </span>
                    )}
                    {seq.locationHint && (
                      <span className="text-[10px] text-[#4b5158]">
                        <span className="text-[#3a4046]">Location </span>
                        {seq.locationHint}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[#3a4046] text-sm shrink-0 group-hover:text-[#6e767d] transition-colors">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
