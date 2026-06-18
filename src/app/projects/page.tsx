import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

export default async function ProjectsPage() {
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
        >
          + New Project
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <div className="text-center py-20 text-neutral-600">
          <p className="text-lg mb-2">No projects yet.</p>
          <p className="text-sm">
            <Link href="/projects/new" className="underline hover:text-neutral-400">
              Create your first project
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {allProjects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-4 hover:border-neutral-700 hover:bg-neutral-800/60 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium text-neutral-100 group-hover:text-white truncate">
                      {project.name}
                    </span>
                    <StatusBadge status={project.status} />
                  </div>
                  {project.pitch && (
                    <p className="text-sm text-neutral-500 line-clamp-2">
                      {project.pitch}
                    </p>
                  )}
                </div>
                <span className="text-neutral-700 text-sm shrink-0 mt-0.5">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
