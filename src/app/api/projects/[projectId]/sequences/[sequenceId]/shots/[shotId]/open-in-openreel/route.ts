// ---------------------------------------------------------------------------
// GET /api/projects/[projectId]/sequences/[sequenceId]/shots/[shotId]/open-in-openreel
// SHOT.VIDEO.LIBRARY.1, Lot D
//
// Plain GET redirect to the OpenReel sidecar with this Shot's video-export
// pre-loaded — reuses the exact same `mikaiExportUrl` handoff mechanism as
// "Open in Advanced Editor" (src/lib/editorial/advancedEditorLink.ts),
// never a second protocol. Read-only: this route itself only ever computes
// a URL and redirects, it never mutates anything. The Shot Video Library
// panel's own form submits here with `target="_blank"` (native GET form,
// not a Server Action) so the browser opens a real new tab through this
// redirect, exactly like the existing "Open in Advanced Editor" link does.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMikAIPublicBaseUrl, getOpenReelSidecarUrl } from "@/lib/settings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string; shotId: string }> }
) {
  const { projectId, sequenceId, shotId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  const shotDetailUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}`;

  function fail(error: string) {
    return NextResponse.redirect(new URL(`${shotDetailUrl}?libraryError=${encodeURIComponent(error)}`, request.url));
  }

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0 || !Number.isInteger(shid) || shid <= 0) {
    return fail("Invalid request.");
  }

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) return fail("Shot not found.");

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) return fail("Sequence not found.");

  const url = new URL(request.url);
  const rawIds = (url.searchParams.get("ids") ?? "").trim();
  if (rawIds.length === 0) {
    return fail("Select at least one video before opening OpenReel.");
  }

  const mikaiOrigin = await getMikAIPublicBaseUrl();
  const sidecarOrigin = await getOpenReelSidecarUrl();
  const absoluteExportUrl = `${mikaiOrigin}/api/projects/${pid}/sequences/${sid}/shots/${shid}/video-export?ids=${encodeURIComponent(rawIds)}`;

  const sidecarUrl = `${sidecarOrigin}/?${new URLSearchParams({
    mikaiExportUrl: absoluteExportUrl,
    mikaiProjectId: String(pid),
    mikaiSequenceId: String(sid),
    // SHOT.VIDEO.LIBRARY.1 — additive, read by the sidecar's bootstrap to
    // compute a Project id namespace distinct from a real full-sequence
    // editorial session for the SAME project/sequence — the mikaiSequenceId
    // above is real (Shots belong to a real Sequence) and MUST stay real
    // for the export document's own `sequence.id`, but reusing it verbatim
    // for the sidecar's internal Project id would collide with (and could
    // silently skip re-loading, or be confused for) that other session.
    mikaiShotId: String(shid),
    mikaiSourceMode: "shot-videos",
  }).toString()}`;

  return NextResponse.redirect(sidecarUrl);
}
