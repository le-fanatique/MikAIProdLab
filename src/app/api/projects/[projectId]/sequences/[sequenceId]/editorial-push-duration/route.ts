// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/sequences/[sequenceId]/editorial-push-duration
// OPENREEL.TIMING.1 — explicit production-intent duration push from the
// OpenReel Advanced Editor.
//
// Distinct from, and never implied by, editorial-timing-patch (start-only,
// mikai-editorial-timing-patch-v1) or editorial-insert-shot. Per
// docs/EDITORIAL_ARCH_SEQUENCE_RESULT.md §8: "Apply Timing / Editorial Patch
// = update editorial usage. Push Duration to MikAI = explicit production
// intent." — those are never the same action.
//
// This route updates ONLY shots.durationSeconds (+ updatedAt). It never
// touches sequence_editorial_items, never outdates Sequence Results or Film
// Results — existing rendered results remain valid historical outputs; a
// future shot regeneration + new active Sequence Result publish is what
// eventually invalidates them, through the normal existing path, not this
// one. Same CORS + staleness pipeline as editorial-insert-shot/
// editorial-timing-patch, but sourceEditorialSnapshot is REQUIRED (no
// legacy no-snapshot bypass) — same reasoning as editorial-insert-shot：
// this is a brand-new write route with no pre-existing caller to stay
// backward-compatible with.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

/** POST/JSON route — same narrower CORS set as editorial-insert-shot/editorial-timing-patch. */
const PUSH_DURATION_CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  headers: "Content-Type",
  exposeHeaders: null,
} as const;

export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), PUSH_DURATION_CORS_OPTIONS);
  return new NextResponse(null, { status: 204, headers: corsHeaders ?? undefined });
}

// Same ceiling as EDITORIAL.INSERT.1's target-duration input
// (src/actions/editorialInsert.ts's MAX_TARGET_DURATION_SECONDS) — kept as
// a local constant here since that one isn't exported (a "use server" file
// may only export async functions).
const MAX_TARGET_DURATION_SECONDS = 600;

type ResponseBody =
  | {
      ok: true;
      shotId: number;
      sequenceId: number;
      projectId: number;
      targetDurationSeconds: number;
      message: string;
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
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), PUSH_DURATION_CORS_OPTIONS);
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

  const shotId = typeof p.shotId === "number" && Number.isInteger(p.shotId) ? p.shotId : null;
  if (!shotId || shotId <= 0) {
    const body: ResponseBody = { ok: false, error: "shotId must be a positive integer." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const targetDurationSeconds = typeof p.targetDurationSeconds === "number" ? p.targetDurationSeconds : NaN;
  if (
    !Number.isFinite(targetDurationSeconds) ||
    targetDurationSeconds <= 0 ||
    targetDurationSeconds > MAX_TARGET_DURATION_SECONDS
  ) {
    const body: ResponseBody = {
      ok: false,
      error: `targetDurationSeconds must be a finite number > 0 and <= ${MAX_TARGET_DURATION_SECONDS}.`,
    };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  // Ownership: shot → sequence → project
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
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot || shot.sequenceId !== sid) {
    const body: ResponseBody = { ok: false, error: "Shot not found in this sequence." };
    return NextResponse.json(body, { status: 404, headers: corsHeaders ?? undefined });
  }

  // Structural staleness check (OPENREEL.CONFLICT.1) — identical pipeline to
  // editorial-insert-shot/editorial-timing-patch. Runs BEFORE any DB write.
  const shotList = await db.select().from(shots).where(eq(shots.sequenceId, sid));
  const shotById = new Map(shotList.map((s) => [s.id, s]));
  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid))
    .orderBy(asc(sequenceEditorialItems.trackIndex), asc(sequenceEditorialItems.orderIndex));

  const inputItems: EditorialDocumentInputItem[] = itemRows.map((item) => {
    const s = item.shotId !== null ? shotById.get(item.shotId) : undefined;
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
      shot: s
        ? {
            id: s.id,
            shotCode: s.shotCode,
            title: s.title,
            approvedVideoPath: s.approvedVideoPath,
            isPlaceholder: s.title === "Placeholder",
          }
        : null,
      mediaUrl: s?.approvedVideoPath ? refImageUrl(s.approvedVideoPath) : null,
    };
  });
  const document = buildEditorialDocument({ projectId: pid, sequenceId: sid, items: inputItems });
  const currentSnapshot = buildEditorialSnapshot({ sequenceId: sid, document });

  const comparison = compareEditorialSnapshot({ sourceSnapshot: sourceEditorialSnapshot, currentSnapshot });
  if (!comparison.ok) {
    const body: ResponseBody = { ok: false, error: comparison.mismatch.message };
    return NextResponse.json(body, { status: 409, headers: corsHeaders ?? undefined });
  }

  // The one and only write: shots.durationSeconds (+ updatedAt). Deliberately
  // does NOT touch sequence_editorial_items, and deliberately does NOT call
  // outdateSequenceResultsForSequence/outdateFilmResultsForProject — existing
  // Sequence Results/Film Results remain valid historical outputs, per this
  // ticket's explicit product decision.
  const now = new Date().toISOString();
  await db.update(shots).set({ durationSeconds: targetDurationSeconds, updatedAt: now }).where(eq(shots.id, shotId));

  revalidatePath(`/projects/${pid}/sequences/${sid}`);
  revalidatePath(`/projects/${pid}/sequences/${sid}/editorial`);
  revalidatePath(`/projects/${pid}/sequences/${sid}/shots/${shotId}`);

  const body: ResponseBody = {
    ok: true,
    shotId,
    sequenceId: sid,
    projectId: pid,
    targetDurationSeconds,
    message: "Production target duration updated in MikAI.",
  };
  return NextResponse.json(body, { headers: corsHeaders ?? undefined });
}
