// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/sequences/[sequenceId]/editorial-insert-shot
// OPENREEL.INSERT.1 — insert a real production Shot from the OpenReel
// sidecar's playhead position.
//
// Mirrors editorial-timing-patch/route.ts's CORS + staleness-check pipeline
// (same resolveEditorSidecarCorsHeaders options, same buildEditorialDocument
// -> buildEditorialSnapshot -> compareEditorialSnapshot sequence), but
// unlike that route (and publish-advanced), sourceEditorialSnapshot is
// REQUIRED here, not optional-with-a-legacy-warning — this is a brand-new
// endpoint with no pre-OPENREEL.CONFLICT.1 caller to stay compatible with.
//
// Delegates the actual write to insertShotInSequenceFromEditorialContext
// (src/actions/editorialInsert.ts, EDITORIAL.INSERT.1) — the exact same
// function MikAI's own "Insert Shot Here" button already calls. Sequence
// Results / Film Results outdating happens inside that function already;
// nothing new is added here for that.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { resolveEditorSidecarCorsHeaders } from "@/lib/cors/editorSidecarCors";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  buildEditorialDocument,
  type EditorialDocumentInputItem,
} from "@/lib/editorial/editorialDocument";
import {
  buildEditorialSnapshot,
  compareEditorialSnapshot,
  EDITORIAL_SNAPSHOT_SCHEMA_VERSION,
  type EditorialSnapshot,
} from "@/lib/editorial/editorialSnapshot";
import { insertShotInSequenceFromEditorialContext } from "@/actions/editorialInsert";

/** POST/JSON route — no Range/streaming, same narrower set as editorial-timing-patch/publish-advanced. */
const INSERT_SHOT_CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  headers: "Content-Type",
  exposeHeaders: null,
} as const;

export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), INSERT_SHOT_CORS_OPTIONS);
  return new NextResponse(null, { status: 204, headers: corsHeaders ?? undefined });
}

type ResponseBody =
  | {
      ok: true;
      shotId: number;
      sequenceId: number;
      projectId: number;
      message: string;
      reloadRequired: true;
    }
  | { ok: false; error: string };

function isValidSnapshotShape(value: unknown): value is EditorialSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === EDITORIAL_SNAPSHOT_SCHEMA_VERSION &&
    typeof v.fingerprint === "string" &&
    typeof v.itemCount === "number" &&
    typeof v.generatedAt === "string"
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> }
) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), INSERT_SHOT_CORS_OPTIONS);
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0) {
    const body: ResponseBody = { ok: false, error: "Invalid project or sequence id." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    const body: ResponseBody = { ok: false, error: "Request body must be valid JSON." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }
  const p = (payload as Record<string, unknown> | null) ?? {};

  if (!isValidSnapshotShape(p.sourceEditorialSnapshot)) {
    const body: ResponseBody = {
      ok: false,
      error: `sourceEditorialSnapshot is required and must be a valid "${EDITORIAL_SNAPSHOT_SCHEMA_VERSION}" object.`,
    };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }
  const sourceEditorialSnapshot = p.sourceEditorialSnapshot;

  const insertAfterShotId =
    typeof p.insertAfterShotId === "number" && Number.isInteger(p.insertAfterShotId) ? p.insertAfterShotId : null;
  const insertBeforeShotId =
    typeof p.insertBeforeShotId === "number" && Number.isInteger(p.insertBeforeShotId) ? p.insertBeforeShotId : null;
  const targetDurationSeconds = typeof p.targetDurationSeconds === "number" ? p.targetDurationSeconds : undefined;
  const title = typeof p.title === "string" ? p.title : undefined;
  const description = typeof p.description === "string" ? p.description : undefined;
  const notes = typeof p.notes === "string" ? p.notes : undefined;

  // Ownership: sequence → project
  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) {
    const body: ResponseBody = { ok: false, error: "Project not found." };
    return NextResponse.json(body, { status: 404, headers: corsHeaders ?? undefined });
  }
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) {
    const body: ResponseBody = { ok: false, error: "Sequence not found." };
    return NextResponse.json(body, { status: 404, headers: corsHeaders ?? undefined });
  }

  // Structural staleness check (OPENREEL.CONFLICT.1) — identical pipeline to
  // editorial-timing-patch/publish-advanced. Runs BEFORE any DB write.
  const shotList = await db.select().from(shots).where(eq(shots.sequenceId, sid));
  const shotById = new Map(shotList.map((s) => [s.id, s]));
  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid))
    .orderBy(asc(sequenceEditorialItems.trackIndex), asc(sequenceEditorialItems.orderIndex));

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
  const document = buildEditorialDocument({ projectId: pid, sequenceId: sid, items: inputItems });
  const currentSnapshot = buildEditorialSnapshot({ sequenceId: sid, document });

  const comparison = compareEditorialSnapshot({ sourceSnapshot: sourceEditorialSnapshot, currentSnapshot });
  if (!comparison.ok) {
    const body: ResponseBody = { ok: false, error: comparison.mismatch.message };
    return NextResponse.json(body, { status: 409, headers: corsHeaders ?? undefined });
  }

  const result = await insertShotInSequenceFromEditorialContext({
    projectId: pid,
    sequenceId: sid,
    insertAfterShotId,
    insertBeforeShotId,
    targetDurationSeconds,
    title,
    description,
    notes,
  });

  if (!result.ok) {
    const body: ResponseBody = { ok: false, error: result.error };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const body: ResponseBody = {
    ok: true,
    shotId: result.shotId,
    sequenceId: sid,
    projectId: pid,
    message: "Shot created in MikAI.",
    reloadRequired: true,
  };
  return NextResponse.json(body, { headers: corsHeaders ?? undefined });
}
