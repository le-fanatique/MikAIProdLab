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
  deriveEmptySpaces,
  getEmptySpacePreviewItemId,
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
      startSeconds: item.startSeconds,
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

  // PHASEC.NLE.C.M1.R1 — legacy gap rows are technical-only data now that
  // shot positions are real (startSeconds). The preview's gap entries and
  // playback order are derived from shot positions instead, consistent
  // with how the timeline treats empty space — never from the legacy rows,
  // so a move can never leave the preview out of sync with the timeline.
  const shotStartById = new Map<number, number>();
  for (const track of document.tracks) {
    for (const it of track.items) {
      if (it.sourceType === "shot") shotStartById.set(it.id, it.start);
    }
  }

  const shotPreviewEntries = itemRows
    .filter((item) => item.type === "shot")
    .map((item) => {
      const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
      const previewItem: PreviewItem = {
        itemId: item.id,
        type: "shot",
        shotId: item.shotId,
        shotCode: shot?.shotCode ?? null,
        title: shot?.title ?? null,
        videoUrl: shot?.approvedVideoPath ? refImageUrl(shot.approvedVideoPath) : null,
        durationSeconds: item.durationSeconds,
        trimInSeconds: item.trimInSeconds,
        trimOutSeconds: item.trimOutSeconds,
        isPlaceholder: shot ? shot.title === "Placeholder" : false,
      };
      return { start: shotStartById.get(item.id) ?? 0, previewItem };
    });

  const emptySpaceEntries = deriveEmptySpaces(document).map((space) => {
    const previewItem: PreviewItem = {
      itemId: getEmptySpacePreviewItemId(space), // synthetic — shared with the timeline/scrubber, never a legacy gap DB id
      type: "gap",
      shotId: null,
      shotCode: null,
      title: null,
      videoUrl: null,
      durationSeconds: space.duration,
      trimInSeconds: null,
      trimOutSeconds: null,
      isPlaceholder: false,
    };
    return { start: space.start, previewItem };
  });

  const previewItems: PreviewItem[] = [...shotPreviewEntries, ...emptySpaceEntries]
    .sort((a, b) => a.start - b.start)
    .map((entry) => entry.previewItem);

  const editorialHref = `/projects/${pid}/sequences/${sid}/editorial`;
  const editorialExportHref = `/api/projects/${pid}/sequences/${sid}/editorial-export`;

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
          <div className="flex items-center gap-2">
            <Link
              href={editorialExportHref}
              target="_blank"
              className="rounded border border-[#2c3035] text-[#6e767d] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors shrink-0"
            >
              Export Editorial JSON
            </Link>
            <Link
              href={editorialHref}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
            >
              ← Editorial
            </Link>
          </div>
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
