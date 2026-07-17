import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots } from "@/db/schema";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import { refImageUrl } from "@/lib/refImageUrl";
import { startSequenceVideoSplitDetection } from "@/actions/sequenceVideoSplit";
import SplitWorkspaceClient from "@/components/sequenceVideoSplit/SplitWorkspaceClient";
import { parseFrameRateModeFromParamsJson } from "@/lib/sequenceVideoSplit/detectVideoSplits";
import {
  DEFAULT_SCENE_THRESHOLD,
  MIN_SCENE_THRESHOLD,
  MAX_SCENE_THRESHOLD,
  DEFAULT_MIN_SEGMENT_DURATION,
  MIN_MIN_SEGMENT_DURATION,
  MAX_MIN_SEGMENT_DURATION,
} from "@/lib/sequenceVideoSplit/detectionParams";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "validated":
      return { label: "Validated", className: "text-[#6b9e72] border-[#2a3d2e]" };
    case "ready":
      return { label: "Ready for review", className: "text-[#5b93d6] border-[#233a52]" };
    case "failed":
      return { label: "Detection failed", className: "text-[#cf7b6b] border-[#3d2323]" };
    default:
      return { label: "Detecting…", className: "text-[#4b5158] border-[#232629]" };
  }
}

function rawCandidateCount(json: string | null): number {
  if (!json) return 0;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * SEQGEN.SPLIT.WORKSPACE.1 (Lot A) — the single Split workspace: source
 * draft, Detection Settings (always accessible, pre-filled with the current
 * run's own values), and the full review/correction/validation UI for the
 * CURRENT run, all on one page. "Current run" is resolved explicitly:
 * `splitRunId` when present in the URL, otherwise the most recent run for
 * the explicitly chosen `sequenceVideoDraftId`. No click on a run card is
 * required to reach a plan. Past runs remain versioned/persistent in DB and
 * reachable via a compact list — never the primary workflow, never deleted.
 *
 * `.../splits/[splitRunId]` (the old dedicated review route) now only
 * exists as a compatibility redirect into this page — see that route's own
 * file for details.
 */
export default async function SequenceVideoSplitWorkspacePage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const storyboardReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;
  const workspaceBase = `/projects/${pid}/sequences/${sid}/storyboard/video/splits`;

  const draftIdRaw = sp(resolvedSearchParams["sequenceVideoDraftId"]);
  let draftId = draftIdRaw ? parseInt(draftIdRaw, 10) : null;
  const splitRunIdRaw = sp(resolvedSearchParams["splitRunId"]);
  const requestedRunId = splitRunIdRaw ? parseInt(splitRunIdRaw, 10) : null;

  const splitError = sp(resolvedSearchParams["splitError"]);
  const splitWarning = sp(resolvedSearchParams["splitWarning"]);
  const edited = sp(resolvedSearchParams["splitEdited"]) === "1";
  const validated = sp(resolvedSearchParams["splitValidated"]) === "1";

  // `splitRunId`, when present, is authoritative for which run is "current"
  // — it always wins over a (possibly stale/absent) `sequenceVideoDraftId`
  // query param, and the draft id is re-derived FROM the run's own server
  // row rather than trusted from the URL.
  let currentRun: typeof sequenceVideoSplitRuns.$inferSelect | null = null;
  if (Number.isInteger(requestedRunId) && requestedRunId !== null && requestedRunId > 0) {
    const [run] = await db.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, requestedRunId));
    if (run && run.sequenceId === sid) {
      currentRun = run;
      draftId = run.sequenceVideoDraftId;
    }
  }

  if (!Number.isInteger(draftId) || draftId === null || draftId <= 0) {
    return (
      <div>
        <Breadcrumb
          crumbs={[
            { label: "Projects", href: "/projects" },
            { label: project.name, href: `/projects/${pid}` },
            { label: "Storyboard", href: storyboardReturnTo },
            { label: "Detect & Review Splits" },
          ]}
        />
        <PageHeader title="Detect & Review Splits" meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title} />
        <EmptyState
          title="No Sequence Video draft chosen."
          description="Split detection always starts from an explicitly chosen Sequence Video draft. Go back to Storyboard and use “Detect & Review Splits” on the draft you want to use."
          action={
            <Link href={storyboardReturnTo} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
              ← Back to Storyboard
            </Link>
          }
        />
      </div>
    );
  }

  const [draft] = await db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, draftId));
  if (!draft || draft.sequenceId !== sid) notFound();

  const allRuns = await db
    .select()
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.sequenceVideoDraftId, draftId))
    .orderBy(desc(sequenceVideoSplitRuns.createdAt));

  if (!currentRun) {
    currentRun = allRuns[0] ?? null;
  }

  const workspaceReturnTo = currentRun ? `${workspaceBase}?sequenceVideoDraftId=${draftId}&splitRunId=${currentRun.id}` : `${workspaceBase}?sequenceVideoDraftId=${draftId}`;

  const segmentCountByRun = new Map<number, number>();
  if (allRuns.length > 0) {
    const counts = await db
      .select({ splitRunId: sequenceVideoSplitSegments.splitRunId, count: sql<number>`count(*)` })
      .from(sequenceVideoSplitSegments)
      .where(inArray(sequenceVideoSplitSegments.splitRunId, allRuns.map((r) => r.id)))
      .groupBy(sequenceVideoSplitSegments.splitRunId);
    for (const c of counts) segmentCountByRun.set(c.splitRunId, Number(c.count));
  }

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardReturnTo },
          { label: "Detect & Review Splits" },
        ]}
      />

      <PageHeader title="Detect & Review Splits" meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title} />

      {splitError && <p className="mb-4 text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{splitError}</p>}
      {splitWarning && (
        <p className="mb-4 text-xs text-[#c9a24b] border border-[#3d3320] rounded px-3 py-2 bg-[#1a1712]">Warning: {splitWarning}</p>
      )}
      {edited && !splitError && <p className="mb-4 text-xs text-[#6b9e72]">Change saved.</p>}
      {validated && <p className="mb-4 text-xs text-[#6b9e72]">Split Plan validated — ready for a future push.</p>}

      <Card title="Source draft" className="mb-4">
        <p className="text-xs text-[#a4abb2] mb-4">
          Sequence Video draft #{draft.id}, created {fmtDate(draft.createdAt)}. Detection never modifies this draft or any Shot — it
          only proposes a reviewable, correctable Split Plan.
        </p>

        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-2">Detection Settings</div>
        <form action={startSequenceVideoSplitDetection} className="flex items-end gap-4 flex-wrap">
          <input type="hidden" name="sequenceId" value={sid} />
          <input type="hidden" name="sequenceVideoDraftId" value={draft.id} />
          <input type="hidden" name="returnTo" value={`${workspaceBase}?sequenceVideoDraftId=${draftId}`} />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4b5158]">
              Scene threshold ({MIN_SCENE_THRESHOLD}–{MAX_SCENE_THRESHOLD})
            </label>
            <input
              type="number"
              name="sceneThreshold"
              step="0.01"
              min={MIN_SCENE_THRESHOLD}
              max={MAX_SCENE_THRESHOLD}
              defaultValue={currentRun ? currentRun.sceneThreshold : DEFAULT_SCENE_THRESHOLD}
              className="w-28 bg-[#0d0e10] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4b5158]">
              Min segment duration ({MIN_MIN_SEGMENT_DURATION}–{MAX_MIN_SEGMENT_DURATION}s)
            </label>
            <input
              type="number"
              name="minSegmentDurationSeconds"
              step="0.1"
              min={MIN_MIN_SEGMENT_DURATION}
              max={MAX_MIN_SEGMENT_DURATION}
              defaultValue={currentRun ? currentRun.minSegmentDurationSeconds : DEFAULT_MIN_SEGMENT_DURATION}
              className="w-28 bg-[#0d0e10] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
          >
            Run Detection {allRuns.length > 0 ? "Again" : ""} →
          </button>
        </form>
      </Card>

      {!currentRun ? (
        <EmptyState title="No detection run yet." description="Use “Run Detection” above to propose a Split Plan for this draft." />
      ) : (
        <SplitWorkspaceBody pid={pid} sid={sid} run={currentRun} workspaceReturnTo={workspaceReturnTo} />
      )}

      {allRuns.length > 1 && (
        <details className="mt-6">
          <summary className="text-xs text-[#6e767d] cursor-pointer hover:text-[#a4abb2]">
            {allRuns.length - 1} other past run(s) for this draft
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {allRuns
              .filter((r) => r.id !== currentRun!.id)
              .map((r) => {
                const status = statusLabel(r.status);
                const rawCount = rawCandidateCount(r.rawCandidatesJson);
                const proposedCount = segmentCountByRun.get(r.id) ?? 0;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-4 rounded border border-[#232629] bg-[#141618] px-3 py-2">
                    <div className="text-[10px] text-[#6e767d]">
                      <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px mr-2 ${status.className}`}>{status.label}</span>
                      Run #{r.id} — {fmtDate(r.createdAt)}
                      {r.status !== "detecting" && <> — {rawCount} raw / {proposedCount} proposed / {r.expectedShotCount} expected</>}
                    </div>
                    <Link
                      href={`${workspaceBase}?sequenceVideoDraftId=${draftId}&splitRunId=${r.id}`}
                      className="shrink-0 text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                    >
                      Switch to this run →
                    </Link>
                  </div>
                );
              })}
          </div>
        </details>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link href={storyboardReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}

function runStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "validated":
      return { label: "Validated", className: "text-[#6b9e72] border-[#2a3d2e]" };
    case "ready":
      return { label: "Ready for review", className: "text-[#5b93d6] border-[#233a52]" };
    case "failed":
      return { label: "Detection failed", className: "text-[#cf7b6b] border-[#3d2323]" };
    default:
      return { label: "Detecting…", className: "text-[#4b5158] border-[#232629]" };
  }
}

async function SplitWorkspaceBody({
  pid,
  sid,
  run,
  workspaceReturnTo,
}: {
  pid: number;
  sid: number;
  run: typeof sequenceVideoSplitRuns.$inferSelect;
  workspaceReturnTo: string;
}) {
  const badge = runStatusBadge(run.status);
  const rawCount = rawCandidateCount(run.rawCandidatesJson);

  if (run.status === "failed" || run.status === "detecting") {
    return (
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-[#e7e9ec]">Current run #{run.id}</span>
          <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${badge.className}`}>{badge.label}</span>
        </div>
        {run.status === "failed" ? (
          <p className="text-xs text-[#cf7b6b]">Detection failed: {run.errorMessage ?? "Unknown error."}</p>
        ) : (
          <p className="text-xs text-[#a4abb2]">Detection is still running for this run. Reload this page in a moment.</p>
        )}
        <p className="text-[10px] text-[#6e767d] mt-2">
          Threshold {run.sceneThreshold} · Min duration {run.minSegmentDurationSeconds}s
        </p>
      </Card>
    );
  }

  const [draft] = await db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, run.sequenceVideoDraftId));
  const sequenceShots = await db.select().from(shots).where(eq(shots.sequenceId, sid)).orderBy(asc(shots.orderIndex));
  const segments = await db
    .select()
    .from(sequenceVideoSplitSegments)
    .where(eq(sequenceVideoSplitSegments.splitRunId, run.id))
    .orderBy(asc(sequenceVideoSplitSegments.orderIndex));

  const isEditable = run.status === "ready";
  const isValidated = run.status === "validated";
  const liveOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));
  const isStale = liveOrderSnapshot !== run.expectedShotOrderSnapshot;
  const diverges = segments.length !== run.expectedShotCount;

  return (
    <div>
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#e7e9ec]">Current run #{run.id}</span>
            <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${badge.className}`}>{badge.label}</span>
          </div>
          <p className="text-[10px] text-[#a4abb2]">
            Threshold {run.sceneThreshold} · Min duration {run.minSegmentDurationSeconds}s · {rawCount} raw cut candidate(s) ·{" "}
            {segments.length} proposed segment(s) · {run.expectedShotCount} expected Shot(s)
          </p>
        </div>
        {diverges && (
          <p className="text-[10px] text-[#c9a24b] mt-1">
            Proposed segment count differs from expected Shot count — use Split/Merge below to reconcile before validating.
          </p>
        )}
        {run.errorMessage && (
          <p className="text-[10px] text-[#c9a24b] mt-1">Warning: some thumbnails could not be generated during detection: {run.errorMessage}</p>
        )}
      </Card>

      {isStale && !isValidated && (
        <p className="mb-4 text-xs text-[#c9a24b] border border-[#3d3320] rounded px-3 py-2 bg-[#1a1712]">
          This Sequence&apos;s Shot list or order has changed since this run was detected. Validation will be blocked until you run
          detection again.
        </p>
      )}

      {isValidated && (
        <p className="mb-4 text-xs text-[#a4abb2]">
          This run is validated and immutable. A future push feature will consume this plan — nothing has been pushed by this ticket.
        </p>
      )}

      {draft && (
        <SplitWorkspaceClient
          runId={run.id}
          sequenceId={sid}
          projectId={pid}
          videoUrl={refImageUrl(draft.videoPath)}
          sourceFps={run.sourceFps}
          frameRateMode={parseFrameRateModeFromParamsJson(run.paramsJson)}
          sourceDurationSeconds={run.sourceDurationSeconds}
          segments={segments.map((s) => ({
            id: s.id,
            orderIndex: s.orderIndex,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
            confidence: s.confidence,
            boundaryProvenance: s.boundaryProvenance,
            status: s.status,
            thumbnailPath: s.thumbnailPath,
            targetShotId: s.targetShotId,
          }))}
          shots={sequenceShots.map((s) => ({ id: s.id, shotCode: s.shotCode, title: s.title }))}
          isEditable={isEditable}
          returnTo={workspaceReturnTo}
        />
      )}
    </div>
  );
}
