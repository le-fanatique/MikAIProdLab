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

const FUTURE_MODULES = ["Assets", "References", "Prompt Packages", "Project Style"] as const;

export default function Sidebar({ tree }: Props) {
  const pathname = usePathname();

  const segments = pathname.split("/");
  const activeProjectId = segments[2] ? parseInt(segments[2]) : null;
  const activeSequenceId = segments[4] ? parseInt(segments[4]) : null;
  const activeShotId = segments[6] ? parseInt(segments[6]) : null;

  const isSettingsActive = pathname === "/settings";

  return (
    <aside className="w-56 shrink-0 h-screen overflow-y-auto bg-[#141618] border-r border-[#232629] flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#232629]">
        <Link
          href="/projects"
          className="block text-[11px] font-semibold uppercase tracking-widest text-[#e7e9ec] hover:text-white transition-colors leading-tight"
        >
          MikAI<br />
          <span className="text-[#5b93d6]">Production Lab</span>
        </Link>
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto py-3 px-2">

        {/* Projects section */}
        <div className="px-2 mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Projects
          </span>
        </div>

        <nav className="flex flex-col gap-px mb-3">
          {tree.map((project) => {
            const isProjectActive =
              activeProjectId === project.id && !isSettingsActive;

            return (
              <div key={project.id}>
                {/* Project row */}
                <Link
                  href={`/projects/${project.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    isProjectActive
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

                {/* Sequences — shown when project active */}
                {isProjectActive &&
                  project.sequences.map((seq) => {
                    const isSeqActive = activeSequenceId === seq.id;
                    return (
                      <div key={seq.id}>
                        {/* Sequence row */}
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

        {/* Settings */}
        <nav className="flex flex-col gap-px mb-3">
          <Link
            href="/settings"
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
              isSettingsActive
                ? "text-[#e7e9ec] bg-[#5b93d6]/10"
                : "text-[#a4abb2] hover:text-[#e7e9ec] hover:bg-[#1a1d20]"
            }`}
          >
            <span className="text-xs">Settings</span>
          </Link>
        </nav>

        <div className="border-t border-[#232629] mx-1 my-2" />

        {/* Future modules (disabled) */}
        <div className="px-2 mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Modules
          </span>
        </div>
        <div className="flex flex-col gap-px">
          {FUTURE_MODULES.map((label) => (
            <div
              key={label}
              aria-disabled="true"
              className="flex items-center justify-between px-2 py-1.5 rounded text-xs opacity-40 cursor-not-allowed select-none"
            >
              <span className="text-[#6e767d] truncate">{label}</span>
              <span className="ml-2 shrink-0 text-[9px] font-mono border border-[#3a4046] rounded px-1 text-[#4b5158]">
                later
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
