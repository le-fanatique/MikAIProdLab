"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

type SidebarShot = {
  id: number;
  shotCode: string | null;
  title: string;
  orderIndex: number;
};

type SidebarSequence = {
  id: number;
  title: string;
  orderIndex: number;
  shots: SidebarShot[];
};

type SidebarProject = {
  id: number;
  name: string;
  status: string;
  sequences: SidebarSequence[];
};

type Props = {
  tree: SidebarProject[];
};

const PROJECT_FUTURE = ["Project Style", "Prompt Packages"] as const;

export default function Sidebar({ tree }: Props) {
  const pathname = usePathname();

  const segs = pathname.split("/");
  const activeProjectId = segs[2] ? parseInt(segs[2]) : null;
  const activeSequenceId = segs[3] === "sequences" && segs[4] ? parseInt(segs[4]) : null;
  const activeShotId = segs[5] === "shots" && segs[6] ? parseInt(segs[6]) : null;

  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <aside className="w-56 shrink-0 h-full overflow-y-auto bg-[#141618] border-r border-[#232629] flex flex-col">
      <div className="flex-1 overflow-y-auto py-3 px-2">

        {/* Projects section header */}
        <div className="px-2 mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Projects
          </span>
        </div>

        <nav className="flex flex-col gap-px mb-3">
          {tree.map((project) => {
            const isProjectActive =
              activeProjectId === project.id && !isSettingsActive;
            const isAssetsActive = pathname.startsWith(`/projects/${project.id}/assets`);
            const isStoryActive =
              pathname.startsWith(`/projects/${project.id}/story`) ||
              pathname.startsWith(`/projects/${project.id}/outline`);

            return (
              <div key={project.id}>
                {/* Project row */}
                <Link
                  href={`/projects/${project.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    isProjectActive && !isAssetsActive && !isStoryActive
                      ? "text-[#e7e9ec] bg-[#5b93d6]/10"
                      : "text-[#a4abb2] hover:text-[#e7e9ec] hover:bg-[#1a1d20]"
                  }`}
                >
                  <span
                    className={`text-[10px] leading-none shrink-0 ${
                      isProjectActive ? "text-[#5b93d6]" : "text-[#4b5158]"
                    }`}
                  >
                    ▸
                  </span>
                  <span className="truncate font-medium text-xs">{project.name}</span>
                </Link>

                {/* Project-level nav — shown when project active */}
                {isProjectActive && (
                  <>
                    {/* Story */}
                    <Link
                      href={`/projects/${project.id}/story`}
                      className={`flex items-center gap-1.5 pl-6 pr-2 py-1 rounded text-xs transition-colors ${
                        isStoryActive
                          ? "text-[#a4abb2] bg-[#1a1d20]"
                          : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
                      }`}
                    >
                      Story
                    </Link>

                    {/* Sequences */}
                    {project.sequences.map((seq) => {
                      const isSeqActive = activeSequenceId === seq.id;
                      return (
                        <div key={seq.id}>
                          <Link
                            href={`/projects/${project.id}/sequences/${seq.id}`}
                            className={`flex items-center gap-1.5 pl-6 pr-2 py-1 rounded text-xs transition-colors ${
                              isSeqActive
                                ? "text-[#a4abb2] bg-[#1a1d20]"
                                : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
                            }`}
                          >
                            <span className="text-[9px] text-[#3a4046] shrink-0">▸</span>
                            <span className="truncate">{seq.title}</span>
                          </Link>

                          {/* Shots — shown when sequence active */}
                          {isSeqActive &&
                            seq.shots.map((shot) => {
                              const isShotActive = activeShotId === shot.id;
                              return (
                                <Link
                                  key={shot.id}
                                  href={`/projects/${project.id}/sequences/${seq.id}/shots/${shot.id}`}
                                  className={`flex items-center pl-10 pr-2 py-1 rounded transition-colors ${
                                    isShotActive
                                      ? "text-[#6e767d] bg-[#1a1d20]"
                                      : "text-[#4b5158] hover:text-[#6e767d]"
                                  }`}
                                >
                                  <span className="font-mono text-[10px] truncate">
                                    {shot.shotCode ?? shot.title}
                                  </span>
                                </Link>
                              );
                            })}
                        </div>
                      );
                    })}

                    {/* Divider before project-level modules */}
                    <div className="border-t border-[#232629] mx-1 my-2" />

                    {/* Assets */}
                    <Link
                      href={`/projects/${project.id}/assets`}
                      className={`flex items-center gap-1.5 pl-6 pr-2 py-1 rounded text-xs transition-colors ${
                        isAssetsActive
                          ? "text-[#a4abb2] bg-[#1a1d20]"
                          : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
                      }`}
                    >
                      Assets
                    </Link>

                    {/* Future project-level modules */}
                    {PROJECT_FUTURE.map((label) => (
                      <div
                        key={label}
                        aria-disabled="true"
                        className="flex items-center justify-between pl-6 pr-2 py-1 rounded text-xs opacity-30 cursor-not-allowed select-none"
                      >
                        <span className="text-[#6e767d] truncate">{label}</span>
                        <span className="ml-2 shrink-0 text-[9px] font-mono border border-[#3a4046] rounded px-1 text-[#4b5158]">
                          later
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {/* New Project */}
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#4b5158] hover:text-[#6e767d] hover:bg-[#1a1d20] transition-colors mt-1"
          >
            <span className="text-[#3a4046]">+</span>
            <span>New Project</span>
          </Link>
        </nav>

        <div className="border-t border-[#232629] mx-1 my-2" />

        {/* Global nav */}
        <nav className="flex flex-col gap-px mb-2">
          <Link
            href="/settings"
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
              isSettingsActive
                ? "text-[#e7e9ec] bg-[#5b93d6]/10"
                : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
            }`}
          >
            Settings
          </Link>
          <Link
            href="/settings/workflows"
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
              pathname.startsWith("/settings/workflows")
                ? "text-[#a4abb2] bg-[#1a1d20]"
                : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
            }`}
          >
            Workflows
          </Link>
        </nav>

        <div className="border-t border-[#232629] mx-1 my-2" />

        {/* Global future */}
        <div className="flex flex-col gap-px">
          <div
            aria-disabled="true"
            className="flex items-center justify-between px-2 py-1.5 rounded text-xs opacity-30 cursor-not-allowed select-none"
          >
            <span className="text-[#6e767d]">Export · Muse Studio</span>
            <span className="ml-2 shrink-0 text-[9px] font-mono border border-[#3a4046] rounded px-1 text-[#4b5158]">
              later
            </span>
          </div>
        </div>

      </div>
    </aside>
  );
}
