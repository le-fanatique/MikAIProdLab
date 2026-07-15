import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import EditorialWorkspace from "@/components/EditorialWorkspace";
import PublishBasicSequenceResultButton from "@/components/PublishBasicSequenceResultButton";
import { refImageUrl } from "@/lib/refImageUrl";
import { getMikAIPublicBaseUrl, getOpenReelSidecarUrl } from "@/lib/settings";
import { buildAdvancedEditorHref, editorialExportHrefFor } from "@/lib/editorial/advancedEditorLink";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
};

function SectionLabel({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4 flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
      {action}
    </div>
  );
}

export default async function SequenceEditorialPage({ params }: Props) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  // EDITORIAL.NAV.1: full Sequence list of the project, for the top
  // selector — reuses the `sequences` table already imported here, no new
  // DB access pattern.
  const projectSequences = await db
    .select({ id: sequences.id, title: sequences.title, sequenceCode: sequences.sequenceCode })
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  const mikaiOrigin = await getMikAIPublicBaseUrl();
  const sidecarOrigin = await getOpenReelSidecarUrl();
  const advancedEditorHref = buildAdvancedEditorHref({ mikaiOrigin, sidecarOrigin, projectId: pid, sequenceId: sid });
  const editorialExportHref = editorialExportHrefFor(pid, sid);

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  // Gap-aware editorial layer — empty until explicitly initialized
  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid))
    .orderBy(
      asc(sequenceEditorialItems.trackIndex),
      asc(sequenceEditorialItems.orderIndex)
    );

  const shotById = new Map(shotList.map((s) => [s.id, s]));

  const editorialItems = itemRows.map((item) => {
    const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
    return {
      id: item.id,
      type: item.type,
      orderIndex: item.orderIndex,
      trackIndex: item.trackIndex,
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
      shotId: item.shotId,
      shotCode: shot?.shotCode ?? null,
      title: shot?.title ?? null,
      hasApprovedVideo: shot ? shot.approvedVideoPath !== null : false,
      isPlaceholder: shot ? shot.title === "Placeholder" : false,
      videoUrl: shot?.approvedVideoPath ? refImageUrl(shot.approvedVideoPath) : null,
    };
  });

  const editorialReturnTo = `/projects/${pid}/sequences/${sid}/editorial`;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: "Editorial" },
        ]}
      />

      <PageHeader
        title="Sequence Editorial"
        actions={
          <Link
            href={`/projects/${pid}/sequences/${sid}`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            ← Sequence
          </Link>
        }
      />

      <p className="text-xs text-[#6e767d] -mt-4 mb-2">
        {sequence.sequenceCode ? `${sequence.sequenceCode} · ` : ""}
        {sequence.title}
      </p>

      {/* ── Sequence selector — EDITORIAL.NAV.1 ─────────────────────
          Plain server-rendered links, no client state: switching
          sequence is a full route navigation, so the timeline, Shot
          list and fallback controls below always reload fresh for the
          selected sequence — no stale visual state to manage. */}
      {projectSequences.length > 0 && (
        <nav aria-label="Sequences" className="flex flex-wrap gap-1.5 mb-4">
          {projectSequences.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${pid}/sequences/${s.id}/editorial`}
              className={`rounded border px-2.5 py-1 text-xs font-mono transition-colors ${
                s.id === sid
                  ? "border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#8fbbe8]"
                  : "border-[#2c3035] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2]"
              }`}
              title={s.title}
            >
              {s.sequenceCode ?? s.title}
            </Link>
          ))}
        </nav>
      )}

      {/* EDITORIAL.POLISH.1: Publish/Export/OpenReel are also available on
          this page now (Editorial Actions, below the timeline) — the
          Sequence page keeps its own copy for the Story/Production
          workflow, this one is scoped to montage. */}
      <p className="text-xs text-[#4b5158] mb-4">
        Frame-aware preview, gap-aware trim and fallback controls, plus{" "}
        Publish/Export/OpenReel Advanced below the timeline. The{" "}
        <Link href={`/projects/${pid}/sequences/${sid}`} className="text-[#5b93d6] hover:text-[#8fbbe8]">
          Sequence page
        </Link>{" "}
        remains the Production entry point.
      </p>

      {/* ── Timeline + Sequence Preview (shared selection) ───────── */}
      <EditorialWorkspace
        shots={shotList.map((s) => ({
          id: s.id,
          shotCode: s.shotCode,
          title: s.title,
          durationSeconds: s.durationSeconds,
          hasApprovedVideo: s.approvedVideoPath !== null,
          isPlaceholder: s.title === "Placeholder",
          trimInSeconds: s.trimInSeconds,
          trimOutSeconds: s.trimOutSeconds,
          videoUrl: s.approvedVideoPath ? refImageUrl(s.approvedVideoPath) : null,
        }))}
        projectId={pid}
        sequenceId={sid}
        returnTo={editorialReturnTo}
        editorialItems={editorialItems}
      />

      {/* ── Editorial Actions — below the timeline (EDITORIAL.CLEANUP.1) ──
          Same helpers/contract as Sequence Detail's own Editorial Actions
          card: PublishBasicSequenceResultButton, editorialExportHrefFor,
          buildAdvancedEditorHref. OpenReel Advanced is visually emphasized
          (accent border) as the Advanced mode, Publish/Export stay neutral
          and distinct. */}
      <SectionLabel label="Editorial Actions" />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <PublishBasicSequenceResultButton projectId={pid} sequenceId={sid} />
          <Link
            href={editorialExportHref}
            target="_blank"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Export Editorial JSON
          </Link>
          <Link
            href={advancedEditorHref}
            target="_blank"
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
            title="Opens the OpenReel sidecar editor in a new tab and loads this sequence"
          >
            Open in Advanced Editor
          </Link>
        </div>
        <p className="text-xs text-[#4b5158] mt-3">
          OpenReel must be running at {sidecarOrigin}.
        </p>
        <Collapsible label="Show OpenReel start command">
          <pre className="text-xs text-[#6e767d] bg-[#101214] border border-[#232629] rounded p-3 overflow-x-auto">
{`cd F:/AI/mikai-openreel-sidecar
npx -y pnpm@9.0.0 dev`}
          </pre>
        </Collapsible>
      </Card>
    </div>
  );
}
