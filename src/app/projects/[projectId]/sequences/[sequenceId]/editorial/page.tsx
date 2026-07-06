import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import SequenceTimelineEditor from "@/components/SequenceTimelineEditor";
import EditorialShotList from "@/components/EditorialShotList";
import SequencePreviewPlayer from "@/components/SequencePreviewPlayer";
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

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <SectionLabel label="Timeline" />
      <Card>
        {shotList.length > 0 ? (
          <SequenceTimelineEditor
            shots={shotList.map((s) => ({
              id: s.id,
              shotCode: s.shotCode,
              title: s.title,
              durationSeconds: s.durationSeconds,
            }))}
            projectId={pid}
            sequenceId={sid}
            returnTo={editorialReturnTo}
          />
        ) : (
          <p className="text-xs text-[#4b5158]">
            No shots yet. Add a placeholder shot below to start blocking the rhythm.
          </p>
        )}
      </Card>

      {/* ── Sequence Preview ─────────────────────────────────────── */}
      <SectionLabel label="Sequence Preview" />
      <Card>
        <SequencePreviewPlayer
          shots={shotList.map((s) => ({
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            durationSeconds: s.durationSeconds,
            videoUrl: s.approvedVideoPath ? refImageUrl(s.approvedVideoPath) : null,
            isPlaceholder: s.title === "Placeholder",
            trimInSeconds: s.trimInSeconds,
            trimOutSeconds: s.trimOutSeconds,
          }))}
          projectId={pid}
          sequenceId={sid}
        />
      </Card>

      {/* ── Shot Order ───────────────────────────────────────────── */}
      <SectionLabel label="Shot Order" />
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
        />
      </Card>
    </div>
  );
}
