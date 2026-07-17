import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments, shots } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import VideoFrameReviewPlayer from "@/components/VideoFrameReviewPlayer";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  adjustSegmentBoundary,
  splitSegmentAt,
  mergeSegment,
  skipSegment,
  restoreSegment,
  reassignSegmentShot,
  assignAllSegments,
  validateSplitPlan,
} from "@/actions/sequenceVideoSplit";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; splitRunId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

function fmtSeconds(n: number): string {
  return n.toFixed(2);
}

function provenanceLabel(p: string): string {
  switch (p) {
    case "scene":
      return "Scene detection";
    case "manual":
      return "Manual edit";
    default:
      return "Timing fallback";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "mapped":
      return "text-[#6b9e72] border-[#2a3d2e]";
    case "skipped":
      return "text-[#4b5158] border-[#232629]";
    default:
      return "text-[#c9a24b] border-[#3d3320]";
  }
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
 * SEQGEN.SPLIT.1 (Lot C) — review and correct one detection run's proposed
 * segments, then (Lot D) validate the plan. No clip is ever cut here and no
 * Shot row is ever mutated: every action below only writes to
 * `sequence_video_split_runs`/`sequence_video_split_segments`. A
 * `status: "validated"` run is rendered read-only — every mutating form is
 * omitted, matching the server actions' own immutability guard.
 */
export default async function SequenceVideoSplitReviewPage({ params, searchParams }: Props) {
  const { projectId, sequenceId, splitRunId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const runId = parseInt(splitRunId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [run] = await db.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId));
  if (!run || run.sequenceId !== sid) notFound();

  const [draft] = await db.select().from(sequenceVideoDrafts).where(eq(sequenceVideoDrafts.id, run.sequenceVideoDraftId));

  const sequenceShots = await db.select().from(shots).where(eq(shots.sequenceId, sid)).orderBy(asc(shots.orderIndex));
  const segments = await db
    .select()
    .from(sequenceVideoSplitSegments)
    .where(eq(sequenceVideoSplitSegments.splitRunId, runId))
    .orderBy(asc(sequenceVideoSplitSegments.orderIndex));

  const storyboardReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;
  const splitsListReturnTo = `/projects/${pid}/sequences/${sid}/storyboard/video/splits?sequenceVideoDraftId=${run.sequenceVideoDraftId}`;
  const reviewReturnTo = `/projects/${pid}/sequences/${sid}/storyboard/video/splits/${runId}`;

  const badge = runStatusBadge(run.status);

  // REVISE (round 1, finding 3) — a run that failed detection (or is still
  // mid-detection) must show its real status and error, never the generic
  // "Ready for review" the earlier version always rendered regardless of
  // `run.status`.
  if (run.status === "failed" || run.status === "detecting") {
    return (
      <div>
        <Breadcrumb
          crumbs={[
            { label: "Projects", href: "/projects" },
            { label: project.name, href: `/projects/${pid}` },
            { label: "Storyboard", href: storyboardReturnTo },
            { label: "Detect & Review Splits", href: splitsListReturnTo },
            { label: `Run #${run.id}` },
          ]}
        />
        <PageHeader
          title={`Split Plan — Run #${run.id}`}
          meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title}
          badge={<span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${badge.className}`}>{badge.label}</span>}
        />
        {run.status === "failed" ? (
          <p className="mb-4 text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
            Detection failed: {run.errorMessage ?? "Unknown error."}
          </p>
        ) : (
          <p className="mb-4 text-xs text-[#a4abb2]">Detection is still running for this run. Reload this page in a moment.</p>
        )}
        <p className="text-[10px] text-[#6e767d] mb-6">
          Threshold {run.sceneThreshold} · Min duration {run.minSegmentDurationSeconds}s
        </p>
        <div className="pt-4 border-t border-[#232629]">
          <Link href={splitsListReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
            ← Back to Split Runs
          </Link>
        </div>
      </div>
    );
  }

  const splitError = sp(resolvedSearchParams["splitError"]);
  const splitWarning = sp(resolvedSearchParams["splitWarning"]);
  const edited = sp(resolvedSearchParams["splitEdited"]) === "1";
  const validated = sp(resolvedSearchParams["splitValidated"]) === "1";

  const isEditable = run.status === "ready";
  const isValidated = run.status === "validated";

  const liveOrderSnapshot = JSON.stringify(sequenceShots.map((s) => s.id));
  const isStale = liveOrderSnapshot !== run.expectedShotOrderSnapshot;

  const shotById = new Map(sequenceShots.map((s) => [s.id, s]));
  const rawCount = rawCandidateCount(run.rawCandidatesJson);
  const diverges = segments.length !== run.expectedShotCount;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard", href: storyboardReturnTo },
          { label: "Detect & Review Splits", href: splitsListReturnTo },
          { label: `Run #${run.id}` },
        ]}
      />

      <PageHeader
        title={`Split Plan — Run #${run.id}`}
        meta={sequence.sequenceCode ? `${sequence.sequenceCode} — ${sequence.title}` : sequence.title}
        badge={<span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${badge.className}`}>{badge.label}</span>}
      />

      {splitError && <p className="mb-4 text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{splitError}</p>}
      {splitWarning && (
        <p className="mb-4 text-xs text-[#c9a24b] border border-[#3d3320] rounded px-3 py-2 bg-[#1a1712]">Warning: {splitWarning}</p>
      )}
      {run.errorMessage && (
        <p className="mb-4 text-xs text-[#c9a24b] border border-[#3d3320] rounded px-3 py-2 bg-[#1a1712]">
          Warning: some thumbnails could not be generated during detection: {run.errorMessage}
        </p>
      )}
      {edited && !splitError && <p className="mb-4 text-xs text-[#6b9e72]">Change saved.</p>}
      {validated && <p className="mb-4 text-xs text-[#6b9e72]">Split Plan validated — ready for a future push.</p>}

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
        <Card title="Source video" className="mb-4">
          <VideoFrameReviewPlayer src={refImageUrl(draft.videoPath)} projectId={pid} captureDestinations={[]} />
        </Card>
      )}

      <Card title="Detection diagnostics" className="mb-4">
        <p className="text-[10px] text-[#a4abb2]">
          Threshold {run.sceneThreshold} · Min duration {run.minSegmentDurationSeconds}s · {rawCount} raw cut candidate(s) ·{" "}
          {segments.length} proposed segment(s) · {run.expectedShotCount} expected Shot(s)
        </p>
        {diverges && (
          <p className="text-[10px] text-[#c9a24b] mt-1">
            Proposed segment count differs from expected Shot count — use Split/Merge below to reconcile before validating.
          </p>
        )}
      </Card>

      <Card title="Timeline" className="mb-4">
        <div className="flex h-8 w-full rounded overflow-hidden border border-[#2c3035]">
          {segments.map((s) => {
            const widthPct = run.sourceDurationSeconds > 0 ? ((s.endSeconds - s.startSeconds) / run.sourceDurationSeconds) * 100 : 0;
            const bg = s.status === "skipped" ? "bg-[#232629]" : s.status === "mapped" ? "bg-[#2a3d2e]" : "bg-[#3d3320]";
            return (
              <div
                key={s.id}
                className={`${bg} border-r border-[#0d0e10] flex items-center justify-center text-[9px] text-[#a4abb2] overflow-hidden shrink-0`}
                style={{ width: `${widthPct}%` }}
                title={`#${s.orderIndex + 1}: ${fmtSeconds(s.startSeconds)}s–${fmtSeconds(s.endSeconds)}s`}
              >
                {s.orderIndex + 1}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-[#4b5158]">
          {segments.length} segment(s) proposed for {run.expectedShotCount} expected Shot(s). Source duration:{" "}
          {fmtSeconds(run.sourceDurationSeconds)}s.
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        {segments.map((s, i) => {
          const targetShot = s.targetShotId !== null ? shotById.get(s.targetShotId) : null;
          return (
            <Card key={s.id}>
              <div className="flex items-start gap-4">
                <div className="relative w-28 aspect-video bg-[#0d0e10] shrink-0 overflow-hidden rounded">
                  {s.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={refImageUrl(s.thumbnailPath)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-[#4b5158]">No thumbnail</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm text-[#e7e9ec]">Segment #{s.orderIndex + 1}</span>
                    <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${statusBadgeClass(s.status)}`}>
                      {s.status}
                    </span>
                    <span className="text-[10px] text-[#4b5158]">{provenanceLabel(s.boundaryProvenance)}</span>
                    {s.confidence !== null && <span className="text-[10px] text-[#4b5158]">confidence {s.confidence.toFixed(2)}</span>}
                  </div>
                  <p className="text-[10px] text-[#6e767d] mb-2">
                    {fmtSeconds(s.startSeconds)}s → {fmtSeconds(s.endSeconds)}s ({fmtSeconds(s.endSeconds - s.startSeconds)}s)
                    {targetShot && <> — target: {targetShot.shotCode ? `${targetShot.shotCode} ` : ""}{targetShot.title}</>}
                  </p>

                  {isEditable && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <form action={adjustSegmentBoundary} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="sequenceId" value={sid} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="field" value="start" />
                          <input type="hidden" name="returnTo" value={reviewReturnTo} />
                          <label className="text-[10px] text-[#4b5158]">Start</label>
                          <input
                            type="number"
                            step="0.01"
                            name="valueSeconds"
                            defaultValue={s.startSeconds}
                            disabled={i === 0}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec] disabled:opacity-40"
                          />
                          <button
                            type="submit"
                            disabled={i === 0}
                            className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] disabled:text-[#4b5158] disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                        </form>

                        <form action={adjustSegmentBoundary} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="sequenceId" value={sid} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="field" value="end" />
                          <input type="hidden" name="returnTo" value={reviewReturnTo} />
                          <label className="text-[10px] text-[#4b5158]">End</label>
                          <input
                            type="number"
                            step="0.01"
                            name="valueSeconds"
                            defaultValue={s.endSeconds}
                            disabled={i === segments.length - 1}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec] disabled:opacity-40"
                          />
                          <button
                            type="submit"
                            disabled={i === segments.length - 1}
                            className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] disabled:text-[#4b5158] disabled:cursor-not-allowed"
                          >
                            Set
                          </button>
                        </form>

                        <form action={splitSegmentAt} className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="sequenceId" value={sid} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="returnTo" value={reviewReturnTo} />
                          <label className="text-[10px] text-[#4b5158]">Split at</label>
                          <input
                            type="number"
                            step="0.01"
                            name="splitAtSeconds"
                            placeholder={fmtSeconds((s.startSeconds + s.endSeconds) / 2)}
                            className="w-20 bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec]"
                          />
                          <button type="submit" className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8]">
                            Split
                          </button>
                        </form>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {i > 0 && (
                          <form action={mergeSegment}>
                            <input type="hidden" name="runId" value={run.id} />
                            <input type="hidden" name="sequenceId" value={sid} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="direction" value="prev" />
                            <input type="hidden" name="returnTo" value={reviewReturnTo} />
                            <button type="submit" className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec]">
                              ← Merge with previous
                            </button>
                          </form>
                        )}
                        {i < segments.length - 1 && (
                          <form action={mergeSegment}>
                            <input type="hidden" name="runId" value={run.id} />
                            <input type="hidden" name="sequenceId" value={sid} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="direction" value="next" />
                            <input type="hidden" name="returnTo" value={reviewReturnTo} />
                            <button type="submit" className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec]">
                              Merge with next →
                            </button>
                          </form>
                        )}
                        {s.status === "skipped" ? (
                          <form action={restoreSegment}>
                            <input type="hidden" name="runId" value={run.id} />
                            <input type="hidden" name="sequenceId" value={sid} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="returnTo" value={reviewReturnTo} />
                            <button type="submit" className="text-[10px] text-[#6b9e72] hover:text-[#8ec696]">
                              Restore
                            </button>
                          </form>
                        ) : (
                          <form action={skipSegment}>
                            <input type="hidden" name="runId" value={run.id} />
                            <input type="hidden" name="sequenceId" value={sid} />
                            <input type="hidden" name="segmentId" value={s.id} />
                            <input type="hidden" name="returnTo" value={reviewReturnTo} />
                            <button type="submit" className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a]">
                              Skip
                            </button>
                          </form>
                        )}
                      </div>

                      {s.status !== "skipped" && (
                        <form action={reassignSegmentShot} className="flex items-center gap-2">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="sequenceId" value={sid} />
                          <input type="hidden" name="segmentId" value={s.id} />
                          <input type="hidden" name="returnTo" value={reviewReturnTo} />
                          <label className="text-[10px] text-[#4b5158]">Target Shot</label>
                          <select
                            name="targetShotId"
                            defaultValue={s.targetShotId ?? ""}
                            className="bg-[#0d0e10] border border-[#2c3035] rounded px-1.5 py-0.5 text-[10px] text-[#e7e9ec]"
                          >
                            <option value="">— unassigned —</option>
                            {sequenceShots.map((shot) => (
                              <option key={shot.id} value={shot.id}>
                                {shot.shotCode ? `${shot.shotCode} — ` : ""}
                                {shot.title}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8]">
                            Assign
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {isEditable && (
        <div className="mt-6 flex items-center justify-between gap-4 pt-4 border-t border-[#232629]">
          <form action={assignAllSegments}>
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="sequenceId" value={sid} />
            <input type="hidden" name="returnTo" value={reviewReturnTo} />
            <button
              type="submit"
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Assign All
            </button>
          </form>

          <form action={validateSplitPlan}>
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="sequenceId" value={sid} />
            <input type="hidden" name="returnTo" value={reviewReturnTo} />
            <ConfirmSubmitButton
              confirmMessage="Validate this Split Plan? It will become immutable — a new detection run will be required to change it afterwards."
              className="rounded border border-[#6b9e72]/50 text-[#6b9e72] px-4 py-1.5 text-sm hover:border-[#6b9e72] hover:bg-[#6b9e72]/10 transition-colors"
            >
              Validate Split Plan →
            </ConfirmSubmitButton>
          </form>
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link href={splitsListReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Split Runs
        </Link>
      </div>
    </div>
  );
}
