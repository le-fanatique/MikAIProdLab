import Link from "next/link";
import { db } from "@/db";
import { projects, sequences, sequenceVideoDrafts, sequenceVideoSplitRuns, sequenceVideoSplitSegments } from "@/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import { startSequenceVideoSplitDetection } from "@/actions/sequenceVideoSplit";
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
 * SEQGEN.SPLIT.1 (Lot A) — every past detection run for one explicitly
 * chosen Sequence Video draft (`sequenceVideoDraftId`), newest first, never
 * only the latest — same "always visible" convention as the Sequence
 * Storyboard / Sequence Video drafts panels. "Run Detection Again" always
 * creates a brand-new versioned run; it never overwrites a previous one.
 *
 * REVISE (round 1, finding 3) — the detection threshold and minimum segment
 * duration are explicit, bounded, numeric form fields (never hidden/fixed),
 * and every run's card surfaces raw candidate count / proposed segment
 * count / expected Shot count plus a divergence warning, matching the
 * ticket's "seuil explicite... jamais caché" and "raw cut candidates /
 * proposed segments / expected Shots" requirements.
 */
export default async function SequenceVideoSplitsListPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const storyboardReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;

  const draftIdRaw = sp(resolvedSearchParams["sequenceVideoDraftId"]);
  const draftId = draftIdRaw ? parseInt(draftIdRaw, 10) : null;
  const splitError = sp(resolvedSearchParams["splitError"]);

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

  const runs = await db
    .select()
    .from(sequenceVideoSplitRuns)
    .where(eq(sequenceVideoSplitRuns.sequenceVideoDraftId, draftId))
    .orderBy(desc(sequenceVideoSplitRuns.createdAt));

  const segmentCountByRun = new Map<number, number>();
  if (runs.length > 0) {
    const counts = await db
      .select({ splitRunId: sequenceVideoSplitSegments.splitRunId, count: sql<number>`count(*)` })
      .from(sequenceVideoSplitSegments)
      .where(inArray(sequenceVideoSplitSegments.splitRunId, runs.map((r) => r.id)))
      .groupBy(sequenceVideoSplitSegments.splitRunId);
    for (const c of counts) segmentCountByRun.set(c.splitRunId, Number(c.count));
  }

  const splitsBase = `/projects/${pid}/sequences/${sid}/storyboard/video/splits`;
  const listReturnTo = `${splitsBase}?sequenceVideoDraftId=${draftId}`;

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

      {splitError && (
        <p className="mb-4 text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{splitError}</p>
      )}

      <Card title="Source draft" className="mb-4">
        <p className="text-xs text-[#a4abb2] mb-4">
          Sequence Video draft #{draft.id}, created {fmtDate(draft.createdAt)}. Detection never modifies this draft or any Shot — it
          only proposes a reviewable, correctable Split Plan.
        </p>
        <form action={startSequenceVideoSplitDetection} className="flex items-end gap-4 flex-wrap">
          <input type="hidden" name="sequenceId" value={sid} />
          <input type="hidden" name="sequenceVideoDraftId" value={draft.id} />
          <input type="hidden" name="returnTo" value={listReturnTo} />
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
              defaultValue={DEFAULT_SCENE_THRESHOLD}
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
              defaultValue={DEFAULT_MIN_SEGMENT_DURATION}
              className="w-28 bg-[#0d0e10] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
          >
            Run Detection {runs.length > 0 ? "Again" : ""} →
          </button>
        </form>
      </Card>

      {runs.length === 0 ? (
        <EmptyState title="No detection run yet." description="Use “Run Detection” above to propose a Split Plan for this draft." />
      ) : (
        <div className="flex flex-col gap-3">
          {runs.map((run) => {
            const status = statusLabel(run.status);
            const rawCount = rawCandidateCount(run.rawCandidatesJson);
            const proposedCount = segmentCountByRun.get(run.id) ?? 0;
            const diverges = run.status !== "detecting" && proposedCount !== run.expectedShotCount;
            return (
              <Card key={run.id}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-px ${status.className}`}>{status.label}</span>
                      <span className="text-sm text-[#e7e9ec]">Run #{run.id}</span>
                    </div>
                    <p className="text-[10px] text-[#6e767d]">{fmtDate(run.createdAt)}</p>
                    <p className="text-[10px] text-[#6e767d] mt-1">
                      Threshold {run.sceneThreshold} · Min duration {run.minSegmentDurationSeconds}s
                      {run.status !== "detecting" && (
                        <>
                          {" "}
                          · {rawCount} raw cut candidate(s) · {proposedCount} proposed segment(s) · {run.expectedShotCount} expected Shot(s)
                        </>
                      )}
                    </p>
                    {diverges && (
                      <p className="text-[10px] text-[#c9a24b] mt-1">
                        Proposed segment count differs from expected Shot count — review before validating.
                      </p>
                    )}
                    {run.status === "failed" && run.errorMessage && (
                      <p className="text-[10px] text-[#cf7b6b] mt-1">Detection failed: {run.errorMessage}</p>
                    )}
                    {run.status !== "failed" && run.errorMessage && (
                      <p className="text-[10px] text-[#c9a24b] mt-1">Warning: {run.errorMessage}</p>
                    )}
                  </div>
                  {(run.status === "ready" || run.status === "validated" || run.status === "failed") && (
                    <Link
                      href={`${splitsBase}/${run.id}`}
                      className="shrink-0 rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                    >
                      Open →
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link href={storyboardReturnTo} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Back to Storyboard Workspace
        </Link>
      </div>
    </div>
  );
}
