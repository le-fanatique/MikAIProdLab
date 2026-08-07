// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/sequences/[sequenceId]/editorial-export
// NLE.BRIDGE.1 — read-only EditorialDocument export (mikai-editorial-export-v1)
//
// Read-only: loads the same data /nle-prototype already loads, builds an
// EditorialDocument via the existing adapter, and serializes it through
// buildEditorialExport. No writes, no import/round-trip, no external
// dependency.
//
// EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — accepts an OPTIONAL
// `?videoSourceMode=` query param, resolved through the exact same
// canonical resolver the Editorial page preview and
// `publishBasicSequenceResult` use (via `loadEditorialDocumentForSequence`,
// which now also owns the Shot/editorial-item loading this route used to
// duplicate inline). Absent = `approved-only`, byte-identical to before
// this ticket. Present but invalid = HTTP 400, before any DB read.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { refImageUrl } from "@/lib/refImageUrl";
import { resolveEditorSidecarCorsHeaders } from "@/lib/cors/editorSidecarCors";
import {
  buildEditorialExport,
  type EditorialExportShotExtra,
} from "@/lib/editorial/editorialExport";
import { loadEditorialDocumentForSequence, BasicCutManifestError } from "@/lib/editorial/basicCutManifest";
import { parseVideoSourceModeStrict, DEFAULT_VIDEO_SOURCE_MODE, type VideoSourceMode } from "@/lib/editorial/videoSourceMode";

/**
 * Preflight for a cross-origin fetch (e.g. the OpenReel sidecar's
 * "Open in Advanced Editor" bootstrap, NLE.OPENREEL.4) — same scoped
 * allowlist as the uploads route, no wildcard.
 */
export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders ?? undefined,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> }
) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(request.headers.get("origin"));
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0) {
    return NextResponse.json(
      { ok: false, error: "Invalid project or sequence id." },
      { status: 400, headers: corsHeaders ?? undefined }
    );
  }

  const url = new URL(request.url);

  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 (Retake Round 2, Codex P2) — the
  // direct "Export Editorial JSON" button intentionally calls this route
  // with NO query string at all, and its contract is byte-compatible with
  // the pre-ticket export: no `videoSourceMode`/`provenance` fields, the
  // same unverified `item.mediaUrl` the EditorialDocument itself already
  // carries. `url.searchParams.getAll(...)` distinguishes "the param was
  // never in the URL" (legacy shape, below) from "the param was present"
  // (even as an explicit `approved-only`, which must still opt IN to the
  // additive fields) — `.get()` alone collapses both to the same string
  // and also silently keeps only the FIRST of a duplicated param, which is
  // why `getAll` is used to refuse a duplicate outright instead.
  const rawModeValues = url.searchParams.getAll("videoSourceMode");
  let explicitVideoSourceMode: VideoSourceMode | null = null;
  if (rawModeValues.length > 0) {
    if (rawModeValues.length > 1) {
      return NextResponse.json(
        { ok: false, error: "videoSourceMode must be provided at most once." },
        { status: 400, headers: corsHeaders ?? undefined }
      );
    }
    const modeResult = parseVideoSourceModeStrict(rawModeValues[0]);
    if (!modeResult.ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid videoSourceMode." },
        { status: 400, headers: corsHeaders ?? undefined }
      );
    }
    explicitVideoSourceMode = modeResult.mode;
  }
  // Internal resolution always needs a concrete mode (defaults to
  // approved-only, mathematically identical to the pre-ticket direct
  // `approvedVideoPath` read) — only `explicitVideoSourceMode` (`null` when
  // the param was absent) decides whether the response below gets the
  // additive overlay fields.
  const videoSourceMode = explicitVideoSourceMode ?? DEFAULT_VIDEO_SOURCE_MODE;

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404, headers: corsHeaders ?? undefined }
    );
  }

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) {
    return NextResponse.json(
      { ok: false, error: "Sequence not found." },
      { status: 404, headers: corsHeaders ?? undefined }
    );
  }

  let editorialState;
  try {
    editorialState = await loadEditorialDocumentForSequence(pid, sid, { videoSourceMode });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof BasicCutManifestError ? err.message : "Failed to load editorial state." },
      { status: 404, headers: corsHeaders ?? undefined }
    );
  }
  const { document, shotById, videoSources } = editorialState;

  const shotExtrasById = new Map<number, EditorialExportShotExtra>(
    [...shotById.values()].map((s) => [
      s.id,
      {
        approvedVideoPath: s.approvedVideoPath,
        prompt: s.shotPrompt,
        description: s.description,
      },
    ])
  );

  // Overlay map, always built and always passed — `buildEditorialExport`
  // then never falls back to `EditorialDocumentItem.mediaUrl`'s own raw,
  // UNRESOLVED fallback (`item.shot?.approvedVideoPath` straight from
  // `editorialDocument.ts`, deliberately left for the caller to resolve —
  // see that module's own header comment). Two distinct branches, per Shot:
  //
  //   - query param ABSENT (`explicitVideoSourceMode === null`): the exact
  //     legacy shape from before this ticket — `shot.approvedVideoPath`
  //     resolved through `refImageUrl` exactly like every other sibling
  //     route (`editorial-timing-patch/route.ts:182`), UNVERIFIED (no
  //     confinement/existence check — the old route never had a resolver to
  //     run one), and `provenance` always `null` so the additive field is
  //     never attached (Retake Round 2, Codex P2 — byte-compatible VALUE,
  //     not just byte-compatible STRUCTURE, which is exactly what Round 3
  //     caught missing here: `mediaUrl` was still a raw `uploads/...` path
  //     in this branch until now).
  //   - query param EXPLICITLY present: the mode-resolved, confinement- and
  //     existence-VERIFIED candidate from `videoSources` (the canonical
  //     resolver), with its real provenance.
  const resolvedMediaByShotId = new Map(
    [...shotById.keys()].map((shotId) => {
      if (!explicitVideoSourceMode) {
        const approvedVideoPath = shotById.get(shotId)?.approvedVideoPath ?? null;
        return [shotId, { mediaUrl: approvedVideoPath ? refImageUrl(approvedVideoPath) : null, provenance: null }] as const;
      }
      const resolved = videoSources.get(shotId);
      return [
        shotId,
        {
          mediaUrl: resolved?.videoPath ? refImageUrl(resolved.videoPath) : null,
          provenance: resolved?.provenance ?? null,
        },
      ] as const;
    })
  );

  const exportPayload = buildEditorialExport({
    project: { id: project.id, name: project.name },
    sequence: { id: sequence.id, title: sequence.title },
    document,
    shotExtrasById,
    videoSourceMode: explicitVideoSourceMode ?? undefined,
    resolvedMediaByShotId,
  });

  const filename = `mikai-sequence-${sid}-editorial-export-v1.json`;

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `inline; filename="${filename}"`,
      ...corsHeaders,
    },
  });
}
