// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/sequences/[sequenceId]/sequence-results/publish-advanced
// OPENREEL.PUBLISH.1 — accept a rendered MP4 + manifest from the OpenReel
// sidecar and create a sequence_results row (sourceMode: "advanced").
//
// Mirrors src/actions/basicEditorial.ts's publishBasicSequenceResult flow
// (render/receive first, DB write after, best-effort cleanup of an
// orphaned file if the DB write fails) and editorial-timing-patch/route.ts's
// staleness check (same buildEditorialDocument -> buildEditorialSnapshot ->
// compareEditorialSnapshot pipeline, same "legacy = warn, don't reject"
// policy for a request with no sourceEditorialSnapshot at all — only an
// actual mismatch is a hard 409).
//
// multipart/form-data, not JSON — the sidecar needs to send a real video
// file, not a base64 string.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
import { createSequenceResult, setActiveSequenceResult } from "@/actions/sequenceResults";

/** POST/JSON-ish route (multipart, but no Range/streaming) — same narrower method/header set as editorial-timing-patch. */
const PUBLISH_ADVANCED_CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  headers: "Content-Type",
  exposeHeaders: null,
} as const;

export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), PUBLISH_ADVANCED_CORS_OPTIONS);
  return new NextResponse(null, { status: 204, headers: corsHeaders ?? undefined });
}

type ResponseBody =
  | { ok: true; resultId: number; videoPath: string; durationSeconds: number; warnings?: string[] }
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
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"), PUBLISH_ADVANCED_CORS_OPTIONS);
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0) {
    const body: ResponseBody = { ok: false, error: "Invalid project or sequence id." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    const body: ResponseBody = { ok: false, error: "Request body must be multipart/form-data." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) {
    const body: ResponseBody = { ok: false, error: 'Missing or empty "video" file field.' };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const sourceMode = form.get("sourceMode");
  if (sourceMode !== "advanced") {
    const body: ResponseBody = { ok: false, error: 'sourceMode must be "advanced" for this route.' };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const durationSecondsRaw = form.get("durationSeconds");
  const durationSeconds = typeof durationSecondsRaw === "string" ? parseFloat(durationSecondsRaw) : NaN;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    const body: ResponseBody = { ok: false, error: "durationSeconds must be a finite number > 0." };
    return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
  }

  const cutManifestRaw = form.get("cutManifest");
  let cutManifest: unknown = null;
  if (typeof cutManifestRaw === "string" && cutManifestRaw.trim()) {
    try {
      cutManifest = JSON.parse(cutManifestRaw);
    } catch {
      const body: ResponseBody = { ok: false, error: "cutManifest must be valid JSON." };
      return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
    }
  }

  const snapshotRaw = form.get("sourceEditorialSnapshot");
  let sourceEditorialSnapshot: EditorialSnapshot | undefined;
  if (typeof snapshotRaw === "string" && snapshotRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshotRaw);
    } catch {
      const body: ResponseBody = { ok: false, error: "sourceEditorialSnapshot must be valid JSON." };
      return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
    }
    if (!isValidSnapshotShape(parsed)) {
      const body: ResponseBody = {
        ok: false,
        error: `sourceEditorialSnapshot, if present, must be a valid "${EDITORIAL_SNAPSHOT_SCHEMA_VERSION}" object.`,
      };
      return NextResponse.json(body, { status: 400, headers: corsHeaders ?? undefined });
    }
    sourceEditorialSnapshot = parsed;
  }

  const notesRaw = form.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw : null;

  const warningsRaw = form.get("warnings");
  let inputWarnings: string[] = [];
  if (typeof warningsRaw === "string" && warningsRaw.trim()) {
    try {
      const parsed = JSON.parse(warningsRaw);
      if (Array.isArray(parsed)) inputWarnings = parsed.filter((w): w is string => typeof w === "string");
    } catch {
      // malformed warnings payload is non-fatal — just dropped, not a reason to reject the whole publish
    }
  }

  const setActive = form.get("setActive") === "true";

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

  // Structural staleness check (OPENREEL.CONFLICT.1) — identical pipeline
  // to editorial-timing-patch/route.ts: recompute the sequence's current
  // fingerprint and compare against what OpenReel had when it built this
  // publish. A mismatch means the sequence's structure changed after
  // OpenReel last loaded it — reject before writing anything.
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

  const warnings = [...inputWarnings];
  if (sourceEditorialSnapshot) {
    const comparison = compareEditorialSnapshot({ sourceSnapshot: sourceEditorialSnapshot, currentSnapshot });
    if (!comparison.ok) {
      const body: ResponseBody = { ok: false, error: comparison.mismatch.message };
      return NextResponse.json(body, { status: 409, headers: corsHeaders ?? undefined });
    }
  } else {
    warnings.push("Publish has no source snapshot — staleness could not be verified.");
  }

  // Write the video file. No DB transaction is held open across this —
  // matches publishBasicSequenceResult's own "render/receive first, DB
  // write after" rule.
  const uuid = randomUUID();
  const relativeVideoPath = `uploads/sequence-results/sequence-${sid}/${uuid}.mp4`;
  const absoluteVideoPath = path.resolve(process.cwd(), "public", relativeVideoPath);

  try {
    await fs.mkdir(path.dirname(absoluteVideoPath), { recursive: true });
    const bytes = Buffer.from(await video.arrayBuffer());
    await fs.writeFile(absoluteVideoPath, bytes);
  } catch {
    const body: ResponseBody = { ok: false, error: "Failed to write the uploaded video file." };
    return NextResponse.json(body, { status: 500, headers: corsHeaders ?? undefined });
  }

  const created = await createSequenceResult({
    projectId: pid,
    sequenceId: sid,
    sourceMode: "advanced",
    status: setActive ? "active" : "published",
    videoPath: relativeVideoPath,
    durationSeconds,
    cutManifest,
    editorialSnapshot: currentSnapshot,
    notes,
    warnings,
    publishedAt: new Date().toISOString(),
  });

  if (!created.ok) {
    // DB insert failed after the file was already written — orphaned file,
    // same best-effort cleanup as publishBasicSequenceResult. Unique UUID
    // filename means this can never collide with or remove another result's file.
    await fs.rm(absoluteVideoPath, { force: true }).catch(() => {});
    const body: ResponseBody = { ok: false, error: created.error };
    return NextResponse.json(body, { status: 500, headers: corsHeaders ?? undefined });
  }

  if (setActive) {
    await setActiveSequenceResult(pid, sid, created.id);
  }

  const body: ResponseBody = {
    ok: true,
    resultId: created.id,
    videoPath: relativeVideoPath,
    durationSeconds,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
  return NextResponse.json(body, { headers: corsHeaders ?? undefined });
}
