import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";

type Props = { params: Promise<{ projectId: string }> };

export default async function OutlinePage({ params }: Props) {
  const { projectId } = await params;
  const pid = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
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

  // Group shots by sequenceId
  const shotsBySeq = new Map<number, typeof allShots>();
  for (const shot of allShots) {
    const list = shotsBySeq.get(shot.sequenceId) ?? [];
    list.push(shot);
    shotsBySeq.set(shot.sequenceId, list);
  }

  const totalDuration = allShots.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Outline" },
        ]}
      />

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {project.pitch && (
            <p className="text-neutral-500 text-sm">{project.pitch}</p>
          )}
        </div>
        <div className="text-right text-xs text-neutral-600 shrink-0 space-y-0.5">
          <div>{seqs.length} sequence{seqs.length !== 1 ? "s" : ""}</div>
          <div>{allShots.length} shot{allShots.length !== 1 ? "s" : ""}</div>
          {totalDuration > 0 && <div>{totalDuration.toFixed(1)}s total</div>}
        </div>
      </div>

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
        <div className="flex flex-col gap-8">
          {seqs.map((seq, seqIndex) => {
            const seqShots = shotsBySeq.get(seq.id) ?? [];
            const seqDuration = seqShots.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

            return (
              <div key={seq.id}>
                {/* Sequence header */}
                <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-neutral-800">
                  <span className="text-neutral-600 font-mono text-xs w-6 shrink-0">
                    {String(seqIndex + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={`/projects/${pid}/sequences/${seq.id}`}
                    className="font-semibold text-neutral-100 hover:text-white transition-colors"
                  >
                    {seq.title}
                  </Link>
                  {seq.summary && (
                    <span className="text-neutral-500 text-sm truncate flex-1">
                      {seq.summary}
                    </span>
                  )}
                  <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-600">
                    <span>{seqShots.length} shot{seqShots.length !== 1 ? "s" : ""}</span>
                    {seqDuration > 0 && <span>{seqDuration.toFixed(1)}s</span>}
                  </div>
                </div>

                {/* Shot rows */}
                {seqShots.length === 0 ? (
                  <p className="text-xs text-neutral-700 pl-9 italic">No shots yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 pl-9">
                    {seqShots.map((shot) => (
                      <div key={shot.id}>
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-xs text-neutral-500 w-24 shrink-0">
                            {shot.shotCode ?? "—"}
                          </span>
                          <Link
                            href={`/projects/${pid}/sequences/${seq.id}/shots/${shot.id}/edit`}
                            className="text-sm text-neutral-300 hover:text-white transition-colors"
                          >
                            {shot.title}
                          </Link>
                          {shot.durationSeconds != null && (
                            <span className="text-xs text-neutral-600 font-mono shrink-0">
                              {shot.durationSeconds}s
                            </span>
                          )}
                        </div>
                        {shot.actionPitch && (
                          <p className="text-xs text-neutral-600 mt-0.5 ml-[108px] line-clamp-1">
                            {shot.actionPitch}
                          </p>
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
