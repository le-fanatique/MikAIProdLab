"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarShot = { id: number; shotCode: string | null; title: string; orderIndex: number };
type SidebarSequence = { id: number; title: string; orderIndex: number; shots: SidebarShot[] };
type SidebarProject = { id: number; name: string; status: string; sequences: SidebarSequence[] };

type Props = { tree: SidebarProject[] };

export default function TopBar({ tree }: Props) {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);

  const projectId = segs[0] === "projects" && segs[1] ? parseInt(segs[1]) : null;
  const sequenceId = segs[2] === "sequences" && segs[3] ? parseInt(segs[3]) : null;
  const shotId = segs[4] === "shots" && segs[5] ? parseInt(segs[5]) : null;

  const project = projectId ? (tree.find((p) => p.id === projectId) ?? null) : null;
  const sequence =
    project && sequenceId
      ? (project.sequences.find((s) => s.id === sequenceId) ?? null)
      : null;
  const shot =
    sequence && shotId
      ? (sequence.shots.find((s) => s.id === shotId) ?? null)
      : null;

  const isSettings = pathname.startsWith("/settings");

  return (
    <header className="h-11 flex items-center gap-3 px-4 border-b border-[#232629] bg-[#141618] shrink-0">
      {/* Logo */}
      <Link href="/projects" className="flex items-center gap-2.5 shrink-0">
        <div className="w-6 h-6 rounded-md bg-[#5b93d6] flex items-center justify-center text-[10px] font-bold text-white leading-none select-none">
          M
        </div>
        <div className="leading-none">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#e7e9ec]">
            MikAI
          </div>
          <div className="text-[9px] uppercase tracking-widest text-[#5b93d6]">
            Production Lab
          </div>
        </div>
      </Link>

      <div className="w-px h-5 bg-[#232629] shrink-0" />

      {/* Context breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[11px] flex-1 min-w-0">
        {isSettings ? (
          <span className="text-[#6e767d]">Settings</span>
        ) : project ? (
          <>
            <Link
              href={`/projects/${project.id}`}
              className="text-[#6e767d] hover:text-[#a4abb2] transition-colors truncate max-w-[200px]"
            >
              {project.name}
            </Link>
            {sequence && (
              <>
                <span className="text-[#3a4046] shrink-0">/</span>
                <Link
                  href={`/projects/${project.id}/sequences/${sequence.id}`}
                  className="text-[#6e767d] hover:text-[#a4abb2] transition-colors truncate max-w-[160px]"
                >
                  {sequence.title}
                </Link>
              </>
            )}
            {shot && (
              <>
                <span className="text-[#3a4046] shrink-0">/</span>
                <span className="text-[#a4abb2] truncate max-w-[120px]">
                  {shot.shotCode ?? shot.title}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-[#6e767d]">Projects</span>
        )}
      </nav>

      {/* Settings link */}
      <Link
        href="/settings"
        className={`text-[11px] shrink-0 transition-colors ${
          isSettings ? "text-[#a4abb2]" : "text-[#6e767d] hover:text-[#a4abb2]"
        }`}
      >
        Settings
      </Link>
    </header>
  );
}
