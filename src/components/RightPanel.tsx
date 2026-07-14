"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarLLMChat from "@/components/SidebarLLMChat";
import ResizableRightPanelShell from "@/components/ResizableRightPanelShell";
import Collapsible from "@/components/Collapsible";

type SidebarShot = { id: number; shotCode: string | null; title: string; orderIndex: number };
type SidebarSequence = { id: number; title: string; orderIndex: number; shots: SidebarShot[] };
type SidebarProject = { id: number; name: string; status: string; sequences: SidebarSequence[] };

type Props = { tree: SidebarProject[] };

function RightPanelShell({ children }: { children: React.ReactNode }) {
  return (
    <ResizableRightPanelShell>
      <div className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <SidebarLLMChat />
      </div>
    </ResizableRightPanelShell>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-widest text-[#4b5158] px-3 mb-1 mt-4 first:mt-0">
      {label}
    </div>
  );
}

function QuickLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[#3a4046] cursor-not-allowed select-none">
        <span>{label}</span>
        <span className="text-[9px] font-mono border border-[#232629] rounded px-1 text-[#3a4046]">
          later
        </span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center px-3 py-1.5 text-[11px] text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20] rounded transition-colors"
    >
      {label}
    </Link>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-1">
      <div className="text-[9px] uppercase tracking-wider text-[#4b5158] mb-0.5">{label}</div>
      <div className="text-[11px] text-[#a4abb2]">{value}</div>
    </div>
  );
}

export default function RightPanel({ tree }: Props) {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);

  const isSettings = segs[0] === "settings";
  const isProjects = segs[0] === "projects";
  const projectId = isProjects && segs[1] ? parseInt(segs[1]) : null;
  const sequenceId =
    isProjects && segs[2] === "sequences" && segs[3] ? parseInt(segs[3]) : null;
  const shotId =
    isProjects && segs[4] === "shots" && segs[5] ? parseInt(segs[5]) : null;
  const isAssets = isProjects && segs[2] === "assets";

  const project = projectId ? (tree.find((p) => p.id === projectId) ?? null) : null;
  const sequence =
    project && sequenceId
      ? (project.sequences.find((s) => s.id === sequenceId) ?? null)
      : null;
  const shot =
    sequence && shotId
      ? (sequence.shots.find((s) => s.id === shotId) ?? null)
      : null;

  // ── Settings context ──────────────────────────────────────────────
  if (isSettings) {
    return (
      <RightPanelShell>
        <SectionLabel label="Settings" />
        <QuickLink href="/settings" label="General" />
        <QuickLink href="/settings/workflows" label="Workflow Library" />
        <div className="border-t border-[#232629] mx-3 my-3" />
        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Coming later">
            <div className="-mx-3">
              <QuickLink href="#" label="Export / Muse Studio" disabled />
              <QuickLink href="#" label="Team & Sharing" disabled />
            </div>
          </Collapsible>
        </div>
      </RightPanelShell>
    );
  }

  // ── Shot context ──────────────────────────────────────────────────
  if (shot && sequence && project) {
    const shotBase = `/projects/${project.id}/sequences/${sequence.id}/shots/${shot.id}`;
    const totalShots = sequence.shots.length;
    const shotIdx = sequence.shots.findIndex((s) => s.id === shot.id);

    return (
      <RightPanelShell>
        <SectionLabel label="Shot" />
        <MetaRow label="Code" value={shot.shotCode ?? "—"} />
        <MetaRow label="Title" value={shot.title} />
        <MetaRow
          label="Sequence"
          value={`${sequence.title} · ${shotIdx + 1} of ${totalShots}`}
        />

        <div className="border-t border-[#232629] mx-3 my-3" />

        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Actions">
            <div className="-mx-3">
              <QuickLink href={`${shotBase}/edit`} label="Edit Shot" />
              <QuickLink href={`${shotBase}/workflows`} label="Workflows →" />
              <QuickLink
                href={`/projects/${project.id}/sequences/${sequence.id}`}
                label={`← ${sequence.title}`}
              />
            </div>
          </Collapsible>
        </div>

        <div className="border-t border-[#232629] mx-3 my-3" />

        <SectionLabel label="Shots in sequence" />
        {sequence.shots.map((s) => (
          <Link
            key={s.id}
            href={`/projects/${project.id}/sequences/${sequence.id}/shots/${s.id}`}
            className={`flex items-center px-3 py-1 rounded text-[11px] transition-colors ${
              s.id === shot.id
                ? "text-[#a4abb2] bg-[#1a1d20]"
                : "text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20]"
            }`}
          >
            <span className="font-mono text-[10px] mr-2 shrink-0 text-[#4b5158]">
              {s.shotCode ?? "—"}
            </span>
            <span className="truncate">{s.title}</span>
          </Link>
        ))}
      </RightPanelShell>
    );
  }

  // ── Sequence context (no shot) ─────────────────────────────────────
  if (sequence && project && !shotId) {
    return (
      <RightPanelShell>
        <SectionLabel label="Sequence" />
        <MetaRow label="Title" value={sequence.title} />
        <MetaRow
          label="Shots"
          value={`${sequence.shots.length} shot${sequence.shots.length !== 1 ? "s" : ""}`}
        />

        <div className="border-t border-[#232629] mx-3 my-3" />

        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Actions">
            <div className="-mx-3">
              <QuickLink
                href={`/projects/${project.id}/sequences/${sequence.id}/shots/new`}
                label="+ New Shot"
              />
              <QuickLink
                href={`/projects/${project.id}/sequences/${sequence.id}/edit`}
                label="Edit Sequence"
              />
              <QuickLink href={`/projects/${project.id}`} label={`← ${project.name}`} />
            </div>
          </Collapsible>
        </div>

        {sequence.shots.length > 0 && (
          <>
            <div className="border-t border-[#232629] mx-3 my-3" />
            <SectionLabel label="Shots" />
            {sequence.shots.map((s) => (
              <Link
                key={s.id}
                href={`/projects/${project.id}/sequences/${sequence.id}/shots/${s.id}`}
                className="flex items-center px-3 py-1 rounded text-[11px] text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20] transition-colors"
              >
                <span className="font-mono text-[10px] mr-2 shrink-0 text-[#4b5158]">
                  {s.shotCode ?? "—"}
                </span>
                <span className="truncate">{s.title}</span>
              </Link>
            ))}
          </>
        )}
      </RightPanelShell>
    );
  }

  // ── Assets context ────────────────────────────────────────────────
  if (isAssets && project) {
    return (
      <RightPanelShell>
        <SectionLabel label="Assets" />
        <MetaRow label="Project" value={project.name} />

        <div className="border-t border-[#232629] mx-3 my-3" />

        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Actions">
            <div className="-mx-3">
              <QuickLink href={`/projects/${project.id}/assets/new`} label="+ New Asset" />
              <QuickLink href={`/projects/${project.id}`} label={`← ${project.name}`} />
            </div>
          </Collapsible>
        </div>

        <div className="border-t border-[#232629] mx-3 my-3" />
        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Coming later">
            <div className="-mx-3">
              <QuickLink href="#" label="Asset Library Import" disabled />
              <QuickLink href="#" label="Batch Generate References" disabled />
            </div>
          </Collapsible>
        </div>
      </RightPanelShell>
    );
  }

  // ── Project context (not in seq/shot/assets) ──────────────────────
  if (project && !sequenceId) {
    const totalShots = project.sequences.reduce((n, s) => n + s.shots.length, 0);

    return (
      <RightPanelShell>
        <SectionLabel label="Project" />
        <MetaRow label="Name" value={project.name} />
        <MetaRow label="Status" value={project.status} />
        <MetaRow
          label="Structure"
          value={`${project.sequences.length} seq · ${totalShots} shots`}
        />

        <div className="border-t border-[#232629] mx-3 my-3" />

        <div className="px-3 mt-4 first:mt-0">
          <Collapsible label="Actions">
            <div className="-mx-3">
              <QuickLink href={`/projects/${project.id}/sequences/new`} label="+ New Sequence" />
              <QuickLink href={`/projects/${project.id}/story`} label="Story" />
              <QuickLink href={`/projects/${project.id}/assets`} label="Assets" />
              <QuickLink href={`/projects/${project.id}/edit`} label="Edit Project" />
            </div>
          </Collapsible>
        </div>

        {project.sequences.length > 0 && (
          <>
            <div className="border-t border-[#232629] mx-3 my-3" />
            <SectionLabel label="Sequences" />
            {project.sequences.map((s) => (
              <Link
                key={s.id}
                href={`/projects/${project.id}/sequences/${s.id}`}
                className="flex items-center justify-between px-3 py-1 rounded text-[11px] text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20] transition-colors"
              >
                <span className="truncate">{s.title}</span>
                <span className="text-[9px] text-[#4b5158] ml-2 shrink-0">
                  {s.shots.length}
                </span>
              </Link>
            ))}
          </>
        )}
      </RightPanelShell>
    );
  }

  // ── Projects list or no context ───────────────────────────────────
  return (
    <RightPanelShell>
      <SectionLabel label="Projects" />
      {tree.length === 0 ? (
        <p className="px-3 text-[11px] text-[#4b5158]">No projects yet.</p>
      ) : (
        tree.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center justify-between px-3 py-1.5 rounded text-[11px] text-[#6e767d] hover:text-[#a4abb2] hover:bg-[#1a1d20] transition-colors"
          >
            <span className="truncate">{p.name}</span>
            <span className="text-[9px] text-[#4b5158] ml-2 shrink-0">
              {p.sequences.length} seq
            </span>
          </Link>
        ))
      )}
      <div className="border-t border-[#232629] mx-3 my-3" />
      <QuickLink href="/projects/new" label="+ New Project" />
    </RightPanelShell>
  );
}
