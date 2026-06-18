import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
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

  const deleteAction = deleteProject.bind(null, id);

  return (
    <div>
      <Breadcrumb crumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          {project.pitch && (
            <p className="text-neutral-400 text-sm mb-2">{project.pitch}</p>
          )}
          {project.description && (
            <p className="text-neutral-600 text-xs whitespace-pre-wrap">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/projects/${id}/edit`}
            className="rounded border border-neutral-700 text-neutral-400 px-3 py-1.5 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Edit
          </Link>
          <DeleteButton
            action={deleteAction}
            confirm="Delete this project and all its sequences/shots?"
            className="rounded border border-red-900 text-red-500 px-3 py-1.5 text-sm hover:border-red-700 hover:text-red-400 transition-colors"
          />
        </div>
      </div>

      {project.story && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 mb-2">Story</p>
          <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed border-l-2 border-neutral-800 pl-4">
            {project.story}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
          Sequences ({seqs.length})
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${id}/outline`}
            className="rounded border border-neutral-800 text-neutral-500 px-3 py-1.5 text-sm hover:border-neutral-600 hover:text-neutral-300 transition-colors"
          >
            Outline
          </Link>
          <Link
            href={`/projects/${id}/sequences/new`}
            className="rounded bg-neutral-800 text-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors"
          >
            + Add Sequence
          </Link>
        </div>
      </div>

      {seqs.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 border-dashed px-6 py-10 text-center text-neutral-600 text-sm">
          No sequences yet.{" "}
          <Link
            href={`/projects/${id}/sequences/new`}
            className="underline hover:text-neutral-400"
          >
            Add the first one.
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {seqs.map((seq, i) => (
            <Link
              key={seq.id}
              href={`/projects/${id}/sequences/${seq.id}`}
              className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-3.5 hover:border-neutral-700 hover:bg-neutral-800/60 transition-colors group"
            >
              <span className="text-neutral-700 text-sm font-mono w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-neutral-100 group-hover:text-white">
                  {seq.title}
                </span>
                {seq.summary && (
                  <p className="text-sm text-neutral-500 truncate mt-0.5">{seq.summary}</p>
                )}
              </div>
              <span className="text-neutral-700 text-sm shrink-0">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
