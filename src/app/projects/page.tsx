import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt));

  const allSequences = await db
    .select({ id: sequences.id, projectId: sequences.projectId })
    .from(sequences);

  const allShots = await db
    .select({ id: shots.id, sequenceId: shots.sequenceId })
    .from(shots);

  const seqIdToProjectId = new Map(allSequences.map((s) => [s.id, s.projectId]));

  const seqMap = new Map<number, number>();
  for (const s of allSequences) {
    seqMap.set(s.projectId, (seqMap.get(s.projectId) ?? 0) + 1);
  }

  const shotMap = new Map<number, number>();
  for (const sh of allShots) {
    const pid = seqIdToProjectId.get(sh.sequenceId);
    if (pid != null) {
      shotMap.set(pid, (shotMap.get(pid) ?? 0) + 1);
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        actions={
          <Link
            href="/projects/new"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            + New Project
          </Link>
        }
      />

      {allProjects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          description="Start by creating your first project."
          action={
            <Link
              href="/projects/new"
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Create your first project →
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border border-[#232629] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#232629] bg-[#141618]">
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                  Project
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hidden sm:table-cell">
                  Seq.
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hidden sm:table-cell">
                  Shots
                </th>
              </tr>
            </thead>
            <tbody>
              {allProjects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-[#1a1d20] last:border-0 hover:bg-[#1a1d20] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link href={`/projects/${project.id}`} className="block group">
                      <span className="font-medium text-[#e7e9ec] group-hover:text-white transition-colors">
                        {project.name}
                      </span>
                      {project.pitch && (
                        <p className="text-xs text-[#6e767d] mt-0.5 line-clamp-1">
                          {project.pitch}
                        </p>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#6e767d] hidden sm:table-cell">
                    {seqMap.get(project.id) ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#6e767d] hidden sm:table-cell">
                    {shotMap.get(project.id) ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
