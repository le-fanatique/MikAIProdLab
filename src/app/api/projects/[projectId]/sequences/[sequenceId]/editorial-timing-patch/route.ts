// ---------------------------------------------------------------------------
// POST /api/projects/[projectId]/sequences/[sequenceId]/editorial-timing-patch
// NLE.PLUGIN.SYNC — validate/apply a mikai-editorial-timing-patch-v1 patch
//
// V1 scope, deliberately narrow:
//  - only startSeconds may change on apply;
//  - durationSeconds in the patch must match the item's current effective
//    duration (within TIMING_EPSILON_SECONDS) or the whole patch is
//    rejected — no duration/trim edits via this route;
//  - orderIndex is never read for validation nor written on apply —
//    reorder/intercalation remains a separate future concern;
//  - "apply" is all-or-nothing: any error anywhere in the patch means no
//    row is written.
//
// mode: "validate" never writes to the DB, regardless of outcome.
// mode: "apply" writes only if the patch is fully valid.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, sequences, sequenceEditorialItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveEditorSidecarCorsHeaders } from "@/lib/cors/editorSidecarCors";
import {
  validateEditorialTimingPatchShape,
  planEditorialTimingPatch,
  type ExistingEditorialItemForPlan,
} from "@/lib/editorial/editorialTimingPatch";

/** POST/JSON route — no Range/streaming, so a narrower method/header set than the media routes' default. */
const TIMING_PATCH_CORS_OPTIONS = {
  methods: "POST, OPTIONS",
  headers: "Content-Type",
  exposeHeaders: null,
} as const;

/**
 * Preflight for a cross-origin POST (e.g. the OpenReel sidecar's
 * "Apply Timing Patch to MikAI" action, NLE.OPENREEL.5) — same scoped
 * allowlist as the media routes, no wildcard.
 */
export async function OPTIONS(request: Request) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(
    request.headers.get("origin"),
    TIMING_PATCH_CORS_OPTIONS
  );
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders ?? undefined,
  });
}

type ResponseBody = {
  ok: boolean;
  mode: "validate" | "apply";
  applied: boolean;
  errors: Array<{ itemId?: number; message: string }>;
  items: Array<{
    id: number;
    shotId: number;
    currentStartSeconds: number;
    nextStartSeconds: number;
    currentDurationSeconds: number;
    patchDurationSeconds: number;
    willUpdateStartSeconds: boolean;
  }>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> }
) {
  const corsHeaders = resolveEditorSidecarCorsHeaders(
    request.headers.get("origin"),
    TIMING_PATCH_CORS_OPTIONS
  );
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(sid) || sid <= 0) {
    return NextResponse.json(
      { ok: false, error: "Invalid project or sequence id." },
      { status: 400, headers: corsHeaders ?? undefined }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400, headers: corsHeaders ?? undefined }
    );
  }

  const bodyObj = body as Record<string, unknown> | null;
  const mode = bodyObj && (bodyObj.mode === "validate" || bodyObj.mode === "apply") ? bodyObj.mode : null;
  if (!mode) {
    return NextResponse.json(
      { ok: false, error: 'Body must include mode: "validate" | "apply".' },
      { status: 400, headers: corsHeaders ?? undefined }
    );
  }

  const shapeResult = validateEditorialTimingPatchShape(bodyObj?.patch);
  if (!shapeResult.ok) {
    const response: ResponseBody = {
      ok: false,
      mode,
      applied: false,
      errors: shapeResult.errors,
      items: [],
    };
    return NextResponse.json(response, { status: 400, headers: corsHeaders ?? undefined });
  }
  const patch = shapeResult.patch;

  // Ownership: sequence → project
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

  const itemRows = await db
    .select({
      id: sequenceEditorialItems.id,
      type: sequenceEditorialItems.type,
      shotId: sequenceEditorialItems.shotId,
      trackIndex: sequenceEditorialItems.trackIndex,
      startSeconds: sequenceEditorialItems.startSeconds,
      durationSeconds: sequenceEditorialItems.durationSeconds,
      trimInSeconds: sequenceEditorialItems.trimInSeconds,
      trimOutSeconds: sequenceEditorialItems.trimOutSeconds,
    })
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid));

  const existingItems: ExistingEditorialItemForPlan[] = itemRows;

  const plan = planEditorialTimingPatch({
    projectId: pid,
    sequenceId: sid,
    patch,
    existingItems,
  });

  if (mode === "validate" || !plan.ok) {
    const response: ResponseBody = {
      ok: plan.ok,
      mode,
      applied: false,
      errors: plan.errors,
      items: plan.items,
    };
    return NextResponse.json(response, { status: plan.ok ? 200 : 422, headers: corsHeaders ?? undefined });
  }

  // mode === "apply" && plan.ok — write only startSeconds + updatedAt,
  // one row per patched item, all-or-nothing (better-sqlite3 sync transaction).
  // .run() is required: drizzle's SQLiteUpdateBase extends QueryPromise and
  // is lazy — without an explicit .run()/.execute() or an await, the
  // statement is built but never sent to the driver.
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const item of plan.items) {
      tx.update(sequenceEditorialItems)
        .set({ startSeconds: item.nextStartSeconds, updatedAt: now })
        .where(eq(sequenceEditorialItems.id, item.id))
        .run();
    }
  });

  revalidatePath(`/projects/${pid}/sequences/${sid}`);
  revalidatePath(`/projects/${pid}/sequences/${sid}/editorial`);
  revalidatePath(`/projects/${pid}/sequences/${sid}/nle-prototype`);

  const response: ResponseBody = {
    ok: true,
    mode,
    applied: true,
    errors: [],
    items: plan.items,
  };
  return NextResponse.json(response, { headers: corsHeaders ?? undefined });
}
