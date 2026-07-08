import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import NlePrototypeWorkspace from "@/components/NlePrototypeWorkspace";
import type { PreviewShot, PreviewItem } from "@/components/SequencePreviewPlayer";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  buildEditorialDocument,
  type EditorialDocumentInputItem,
} from "@/lib/editorial/editorialDocument";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
};

export default async function NlePrototypePage({ params }: Props) {
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

  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid))
    .orderBy(
      asc(sequenceEditorialItems.trackIndex),
      asc(sequenceEditorialItems.orderIndex)
    );

  const shotById = new Map(shotList.map((s) => [s.id, s]));

  const inputItems: EditorialDocumentInputItem[] = itemRows.map((item) => {
    const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
    return {
      id: item.id,
      sequenceId: item.sequenceId,
      type: item.type,
      shotId: item.shotId,
      orderIndex: item.orderIndex,
      trackIndex: item.trackIndex,
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
      shot: shot
        ? {
            id: shot.id,
            shotCode: shot.shotCode,
            title: shot.title,
            approvedVideoPath: shot.approvedVideoPath,
            isPlaceholder: shot.title === "Placeholder",
          }
        : null,
      mediaUrl: shot?.approvedVideoPath ? refImageUrl(shot.approvedVideoPath) : null,
    };
  });

  const document = buildEditorialDocument({
    projectId: pid,
    sequenceId: sid,
    items: inputItems,
  });

  // Same pattern as /editorial: fallback shots list + item-driven playlist,
  // shaped for SequencePreviewPlayer (reused as-is, no changes to that component).
  const previewShots: PreviewShot[] = shotList.map((s) => ({
    id: s.id,
    shotCode: s.shotCode,
    title: s.title,
    durationSeconds: s.durationSeconds,
    videoUrl: s.approvedVideoPath ? refImageUrl(s.approvedVideoPath) : null,
    isPlaceholder: s.title === "Placeholder",
    trimInSeconds: s.trimInSeconds,
    trimOutSeconds: s.trimOutSeconds,
  }));

  const previewItems: PreviewItem[] = itemRows.map((item) => {
    const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
    return {
      itemId: item.id,
      type: item.type,
      shotId: item.shotId,
      shotCode: shot?.shotCode ?? null,
      title: shot?.title ?? null,
      videoUrl: shot?.approvedVideoPath ? refImageUrl(shot.approvedVideoPath) : null,
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
      isPlaceholder: shot ? shot.title === "Placeholder" : false,
    };
  });

  const editorialHref = `/projects/${pid}/sequences/${sid}/editorial`;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: "NLE Prototype" },
        ]}
      />

      <PageHeader
        title="NLE Prototype"
        actions={
          <Link
            href={editorialHref}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            ← Editorial
          </Link>
        }
      />

      <p className="text-xs text-[#6e767d] -mt-4 mb-4">
        {sequence.sequenceCode ? `${sequence.sequenceCode} · ` : ""}
        {sequence.title}
      </p>

      {itemRows.length === 0 ? (
        <Card>
          <p className="text-xs text-[#4b5158]">
            No editorial items yet. Initialize the editorial timeline on the{" "}
            <Link href={editorialHref} className="text-[#5b93d6] hover:text-[#8fbbe8]">
              Editorial
            </Link>{" "}
            page first.
          </p>
        </Card>
      ) : (
        <NlePrototypeWorkspace
          projectId={pid}
          sequenceId={sid}
          previewShots={previewShots}
          previewItems={previewItems}
          document={document}
        />
      )}
    </div>
  );
}
