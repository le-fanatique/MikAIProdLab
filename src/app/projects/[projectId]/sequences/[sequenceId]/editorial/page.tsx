import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EditorialShotList from "@/components/EditorialShotList";
import EditorialWorkspace from "@/components/EditorialWorkspace";
import { refImageUrl } from "@/lib/refImageUrl";

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

      {/* EDITORIAL.UX.1: Publish/Advanced Editor/Export live on the
          Sequence page now — this page stays reachable for the per-shot
          trim-in/out and gap-aware fallback controls below, which have no
          equivalent there yet. */}
      <p className="text-xs text-[#4b5158] mb-4">
        Most editorial actions have moved to the{" "}
        <Link href={`/projects/${pid}/sequences/${sid}`} className="text-[#5b93d6] hover:text-[#8fbbe8]">
          Sequence page
        </Link>
        . This page provides advanced trim-in/out and fallback controls.
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

      {/* ── Shot Order & fallback controls ───────────────────────── */}
      <SectionLabel label="Shot Order & Fallback Controls" />
      <Card>
        <EditorialShotList
          shots={shotList.map((s) => ({
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            hasApprovedVideo: s.approvedVideoPath !== null,
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          }))}
          projectId={pid}
          sequenceId={sid}
          returnTo={editorialReturnTo}
          editorialLayerActive={editorialItems.length > 0}
        />
      </Card>
    </div>
  );
}
