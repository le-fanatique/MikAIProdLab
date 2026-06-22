"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarShot = { id: number; shotCode: string | null; title: string; orderIndex: number };
type SidebarSequence = { id: number; title: string; orderIndex: number; shots: SidebarShot[] };
type SidebarProject = { id: number; name: string; status: string; sequences: SidebarSequence[] };

type Props = { tree: SidebarProject[] };

type Tab = { label: string; href: string; active: boolean; disabled?: boolean };

function buildTabs(pathname: string, tree: SidebarProject[]): Tab[] | null {
  const segs = pathname.split("/").filter(Boolean);

  // Settings
  if (segs[0] === "settings") {
    return [
      {
        label: "General",
        href: "/settings",
        active: pathname === "/settings",
      },
      {
        label: "Workflows",
        href: "/settings/workflows",
        active: pathname.startsWith("/settings/workflows"),
      },
    ];
  }

  if (segs[0] !== "projects" || !segs[1] || isNaN(parseInt(segs[1]))) return null;

  const projectId = parseInt(segs[1]);
  const project = tree.find((p) => p.id === projectId);
  if (!project) return null;

  const pid = project.id;
  const hasSeq = segs[2] === "sequences" && segs[3];
  const sequenceId = hasSeq ? parseInt(segs[3]) : null;
  const hasShot = hasSeq && segs[4] === "shots" && segs[5];
  const shotId = hasShot ? parseInt(segs[5]) : null;

  // Sequence context but no shot — no strip (project tabs would show with no active tab)
  if (hasSeq && !shotId) return null;

  // Shot context — show sibling shots for quick nav + Workflows tab
  if (shotId && sequenceId) {
    const sequence = project.sequences.find((s) => s.id === sequenceId);
    if (sequence && sequence.shots.length > 1) {
      const shotBase = (shid: number) =>
        `/projects/${pid}/sequences/${sequenceId}/shots/${shid}`;
      const shotTabs: Tab[] = sequence.shots.map((sh) => ({
        label: sh.shotCode ?? sh.title,
        href: shotBase(sh.id),
        active: sh.id === shotId && !pathname.startsWith(shotBase(shotId) + "/workflows"),
      }));
      const workflowsHref = `/projects/${pid}/sequences/${sequenceId}/shots/${shotId}/workflows`;
      return [
        ...shotTabs,
        {
          label: "Workflows",
          href: workflowsHref,
          active: pathname.startsWith(workflowsHref),
        },
      ];
    }
    // Single shot — just Workflows tab
    const workflowsHref = `/projects/${pid}/sequences/${sequenceId}/shots/${shotId}/workflows`;
    return [
      {
        label: "Shot",
        href: `/projects/${pid}/sequences/${sequenceId}/shots/${shotId}`,
        active: !pathname.startsWith(workflowsHref),
      },
      {
        label: "Workflows",
        href: workflowsHref,
        active: pathname.startsWith(workflowsHref),
      },
    ];
  }

  // Project context (not in sequence/shot)
  return [
    {
      label: "Overview",
      href: `/projects/${pid}`,
      active:
        pathname === `/projects/${pid}` ||
        pathname === `/projects/${pid}/edit` ||
        pathname === `/projects/${pid}/outline`,
    },
    {
      label: "Story",
      href: `/projects/${pid}/story`,
      active: pathname.startsWith(`/projects/${pid}/story`),
    },
    {
      label: "Assets",
      href: `/projects/${pid}/assets`,
      active: pathname.startsWith(`/projects/${pid}/assets`),
    },
    {
      label: "Project Style",
      href: "#",
      active: false,
      disabled: true,
    },
  ];
}

export default function ContextStrip({ tree }: Props) {
  const pathname = usePathname();
  const tabs = buildTabs(pathname, tree);

  if (!tabs) return <div className="h-px bg-[#141618] shrink-0" />;

  return (
    <div className="flex items-stretch px-3 border-b border-[#232629] bg-[#0d0e10] shrink-0 h-9 overflow-x-auto">
      {tabs.map((tab) =>
        tab.disabled ? (
          <div
            key={tab.label}
            className="flex items-center px-3 text-[11px] text-[#3a4046] cursor-not-allowed select-none shrink-0"
          >
            {tab.label}
          </div>
        ) : (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex items-center px-3 text-[11px] border-b-2 transition-colors shrink-0 ${
              tab.active
                ? "border-[#5b93d6] text-[#e7e9ec]"
                : "border-transparent text-[#6e767d] hover:text-[#a4abb2]"
            }`}
          >
            {tab.label}
          </Link>
        )
      )}
    </div>
  );
}
