"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarShot = { id: number; shotCode: string | null; title: string; orderIndex: number };
type SidebarSequence = { id: number; title: string; orderIndex: number; shots: SidebarShot[] };
type SidebarProject = { id: number; name: string; status: string; sequences: SidebarSequence[] };

type Props = { tree: SidebarProject[] };

type Tab = { label: string; href: string; active: boolean; disabled?: boolean; title?: string };

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

  // EDITORIAL.SHORTCUT.1: the same Project-level navigation (Overview,
  // Story, Assets, Editorial, Project Style) is now shown at every level
  // — Project, Sequence, Shot and Shot Workflows — so `Editorial` stays
  // reachable without a route change breaking the active-tab logic below.
  // The Shot-level sibling-shot list and the `Workflows` tab are gone
  // from this strip (Shot Detail and Workflow pages keep their own
  // dedicated navigation to those functions — see RightPanel/ContextStrip
  // callers, unchanged).
  //
  // Editorial points at the current Sequence when one is in the URL
  // (Sequence Detail, Shot Detail, Shot Workflows), or at the project's
  // first Sequence in order when browsing at Project level. `tree`'s
  // `sequences` arrays are already ordered by `orderIndex` (see
  // layout.tsx's query), so `project.sequences[0]` is that first Sequence.
  const editorialSequenceId =
    sequenceId ?? (project.sequences.length > 0 ? project.sequences[0].id : null);
  const editorialHref =
    editorialSequenceId != null ? `/projects/${pid}/sequences/${editorialSequenceId}/editorial` : "#";
  const editorialDisabled = editorialSequenceId == null;

  // SEQGEN.STORYBOARD.2: Storyboard is a project-level route (not nested
  // under /sequences/{id} like Editorial) — the current Sequence is only
  // ever a query param (?sequenceId=), same "current Sequence, or the
  // project's first Sequence" resolution as Editorial above.
  const storyboardSequenceId = editorialSequenceId;
  const storyboardHref =
    storyboardSequenceId != null
      ? `/projects/${pid}/storyboard?sequenceId=${storyboardSequenceId}`
      : "#";
  const storyboardDisabled = storyboardSequenceId == null;

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
      label: "Editorial",
      href: editorialHref,
      active: !editorialDisabled && pathname === editorialHref,
      disabled: editorialDisabled,
      title: editorialDisabled ? "Create a Sequence to use Editorial." : undefined,
    },
    {
      label: "Storyboard",
      href: storyboardHref,
      active: !storyboardDisabled && pathname === `/projects/${pid}/storyboard`,
      disabled: storyboardDisabled,
      title: storyboardDisabled ? "Create a Sequence to use Storyboard." : undefined,
    },
    {
      label: "Project Style",
      href: `/projects/${pid}/style`,
      active: pathname === `/projects/${pid}/style`,
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
            title={tab.title}
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
