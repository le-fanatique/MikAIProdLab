import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import DeleteButton from "@/components/DeleteButton";
import { deleteSequence } from "@/actions/sequences";
import { deleteShot } from "@/actions/shots";

type Props = { params: Promise<{ projectId: string; sequenceId: string }> };

export default async function SequencePage({ params }: Props) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  const totalDuration = shotList.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

  const deleteSeqAction = deleteSequence.bind(null, sid, pid);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title },
        ]}
      />

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{sequence.title}</h1>
          {sequence.summary && (
            <p className="text-neutral-400 text-sm mb-1">{sequence.summary}</p>
          )}
          {sequence.description && (
            <p className="text-neutral-500 text-sm whitespace-pre-wrap">{sequence.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/projects/${pid}/sequences/${sid}/edit`}
            className="rounded border border-neutral-700 text-neutral-400 px-3 py-1.5 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Edit
          </Link>
          <DeleteButton
            action={deleteSeqAction}
            confirm="Delete this sequence and all its shots?"
            className="rounded border border-red-900 text-red-500 px-3 py-1.5 text-sm hover:border-red-700 hover:text-red-400 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            Shots ({shotList.length})
          </h2>
          {totalDuration > 0 && (
            <span className="text-xs text-neutral-600">
              Total: {totalDuration.toFixed(1)}s
            </span>
          )}
        </div>
        <Link
          href={`/projects/${pid}/sequences/${sid}/shots/new`}
          className="rounded bg-neutral-800 text-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors"
        >
          + Add Shot
        </Link>
      </div>

      {shotList.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 border-dashed px-6 py-10 text-center text-neutral-600 text-sm">
          No shots yet.{" "}
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/new`}
            className="underline hover:text-neutral-400"
          >
            Add the first one.
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">Action Pitch</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell">Camera</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-16">Dur.</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {shotList.map((shot, i) => {
                const deleteShotAction = deleteShot.bind(null, shot.id, sid, pid);
                return (
                  <tr
                    key={shot.id}
                    className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-neutral-600 font-mono text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-neutral-100 font-medium">{shot.title}</span>
                      {shot.description && (
                        <p className="text-neutral-600 text-xs mt-0.5 line-clamp-1">{shot.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden md:table-cell max-w-xs">
                      <span className="line-clamp-2">{shot.actionPitch ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell max-w-xs">
                      <span className="line-clamp-2">{shot.cameraPitch ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500 font-mono text-xs">
                      {shot.durationSeconds != null ? `${shot.durationSeconds}s` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/projects/${pid}/sequences/${sid}/shots/${shot.id}/edit`}
                          className="text-neutral-500 hover:text-neutral-200 transition-colors text-xs"
                        >
                          Edit
                        </Link>
                        <DeleteButton
                          action={deleteShotAction}
                          confirm="Delete this shot?"
                          label="Del"
                          className="text-red-800 hover:text-red-500 transition-colors text-xs"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
