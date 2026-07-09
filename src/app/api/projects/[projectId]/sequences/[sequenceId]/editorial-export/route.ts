// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/sequences/[sequenceId]/editorial-export
// NLE.BRIDGE.1 — read-only EditorialDocument export (mikai-editorial-export-v1)
//
// Read-only: loads the same data /nle-prototype already loads, builds an
// EditorialDocument via the existing adapter, and serializes it through
// buildEditorialExport. No writes, no import/round-trip, no external
// dependency.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  buildEditorialDocument,
  type EditorialDocumentInputItem,
} from "@/lib/editorial/editorialDocument";
import {
  buildEditorialExport,
  type EditorialExportShotExtra,
} from "@/lib/editorial/editorialExport";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> }
) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid project or sequence id." }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) {
    return NextResponse.json({ ok: false, error: "Sequence not found." }, { status: 404 });
  }

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

  const shotExtrasById = new Map<number, EditorialExportShotExtra>(
    shotList.map((s) => [
      s.id,
      {
        approvedVideoPath: s.approvedVideoPath,
        prompt: s.shotPrompt,
        description: s.description,
      },
    ])
  );

  const exportPayload = buildEditorialExport({
    project: { id: project.id, name: project.name },
    sequence: { id: sequence.id, title: sequence.title },
    document,
    shotExtrasById,
  });

  const filename = `mikai-sequence-${sid}-editorial-export-v1.json`;

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
