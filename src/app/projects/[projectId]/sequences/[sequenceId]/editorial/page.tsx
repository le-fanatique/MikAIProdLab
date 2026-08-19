import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, sequenceEditorialItems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import EditorialWorkspace from "@/components/editorial/EditorialWorkspace";
import PublishBasicSequenceResultButton from "@/components/editorial/PublishBasicSequenceResultButton";
import LatestApprovedButton from "@/components/editorial/LatestApprovedButton";
import { refImageUrl } from "@/lib/refImageUrl";
import { getMikAIPublicBaseUrl, getOpenReelSidecarUrl } from "@/lib/settings";
import { buildAdvancedEditorHref, editorialExportHrefFor } from "@/lib/editorial/advancedEditorLink";
import {
  parseVideoSourceMode,
  resolveVideoSourcesForShotList,
  videoSourceModeLabel,
  type VideoSourceMode,
} from "@/lib/editorial/videoSourceMode";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const VIDEO_SOURCE_MODES: VideoSourceMode[] = ["approved-only", "latest-generation"];

function SectionLabel({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4 flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
      {action}
    </div>
  );
}

export default async function SequenceEditorialPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const resolvedSearchParams = await searchParams;

  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — strict parse, silent fallback to
  // the default rather than throwing on a malformed/forged query value; the
  // URL is the single source of truth for this mode (server render, viewer
  // and Publish all derive from it, never a separate client store).
  const videoSourceMode = parseVideoSourceMode(resolvedSearchParams.videoSourceMode);
  function videoSourceModeHref(mode: VideoSourceMode): string {
    return `/projects/${pid}/sequences/${sid}/editorial?videoSourceMode=${mode}`;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  // EDITORIAL.NAV.1: full Sequence list of the project, for the top
  // selector — reuses the `sequences` table already imported here, no new
  // DB access pattern.
  const projectSequences = await db
    .select({ id: sequences.id, title: sequences.title, sequenceCode: sequences.sequenceCode })
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  const mikaiOrigin = await getMikAIPublicBaseUrl();
  const sidecarOrigin = await getOpenReelSidecarUrl();
  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — the OpenReel link nests the
  // PAGE's own current mode, so a fresh sidecar session loads the exact
  // same videos the viewer/Publish below are using — even a Sequence with
  // zero approvals, entirely via Latest generation. The direct "Export
  // Editorial JSON" button stays canonical/approved-only (no param), per
  // the ticket's explicit scope boundary.
  const advancedEditorHref = buildAdvancedEditorHref({ mikaiOrigin, sidecarOrigin, projectId: pid, sequenceId: sid, videoSourceMode });
  const editorialExportHref = editorialExportHrefFor(pid, sid);

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  // Gap-aware editorial layer — empty until explicitly initialized
  const itemRows = await db
    .select()
    .from(sequenceEditorialItems)
    .where(eq(sequenceEditorialItems.sequenceId, sid))
    .orderBy(
      asc(sequenceEditorialItems.trackIndex),
      asc(sequenceEditorialItems.orderIndex)
    );

  const shotById = new Map(shotList.map((s) => [s.id, s]));

  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — the ONE resolution shared with
  // buildBasicCutManifest (via videoSourceMode.ts), so the preview below and
  // Publish can never disagree about what the current mode means. Reuses
  // this page's own already-owned `shotList` — no second Shot query.
  const videoSources = await resolveVideoSourcesForShotList(shotList, videoSourceMode);
  const videoSourceSummary = {
    available: [...videoSources.values()].filter((s) => s.videoPath !== null).length,
    total: shotList.length,
  };

  function resolvedVideoSourceKind(shotId: number | null): "approved" | "latest" | null {
    if (shotId === null) return null;
    // A candidate whose provenance exists but was rejected (file missing)
    // must never be labeled as if it were an available video — only a
    // shot with an actually-usable `videoPath` gets a kind.
    const resolved = videoSources.get(shotId);
    if (!resolved || resolved.videoPath === null) return null;
    return resolved.provenance?.kind === "approved" ? "approved" : "latest";
  }

  const editorialItems = itemRows.map((item) => {
    const shot = item.shotId !== null ? shotById.get(item.shotId) : undefined;
    const resolved = item.shotId !== null ? videoSources.get(item.shotId) : undefined;
    return {
      id: item.id,
      type: item.type,
      orderIndex: item.orderIndex,
      trackIndex: item.trackIndex,
      durationSeconds: item.durationSeconds,
      trimInSeconds: item.trimInSeconds,
      trimOutSeconds: item.trimOutSeconds,
      shotId: item.shotId,
      shotCode: shot?.shotCode ?? null,
      title: shot?.title ?? null,
      hasVideo: (resolved?.videoPath ?? null) !== null,
      isApproved: shot ? shot.approvedVideoPath !== null : false,
      videoSourceKind: resolvedVideoSourceKind(item.shotId),
      isPlaceholder: shot ? shot.title === "Placeholder" : false,
      videoUrl: resolved?.videoPath ? refImageUrl(resolved.videoPath) : null,
    };
  });

  const editorialReturnTo = `/projects/${pid}/sequences/${sid}/editorial`;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: "Editorial" },
        ]}
      />

      <PageHeader
        title="Sequence Editorial"
        actions={
          <Link
            href={`/projects/${pid}/sequences/${sid}`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            ← Sequence
          </Link>
        }
      />

      <p className="text-xs text-[#6e767d] -mt-4 mb-2">
        {sequence.sequenceCode ? `${sequence.sequenceCode} · ` : ""}
        {sequence.title}
      </p>

      {/* ── Sequence selector — EDITORIAL.NAV.1 ─────────────────────
          Plain server-rendered links, no client state: switching
          sequence is a full route navigation, so the timeline, Shot
          list and fallback controls below always reload fresh for the
          selected sequence — no stale visual state to manage. */}
      {projectSequences.length > 0 && (
        <nav aria-label="Sequences" className="flex flex-wrap gap-1.5 mb-4">
          {projectSequences.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${pid}/sequences/${s.id}/editorial`}
              className={`rounded border px-2.5 py-1 text-xs font-mono transition-colors ${
                s.id === sid
                  ? "border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#8fbbe8]"
                  : "border-[#2c3035] text-[#6e767d] hover:border-[#3a4046] hover:text-[#a4abb2]"
              }`}
              title={s.title}
            >
              {s.sequenceCode ?? s.title}
            </Link>
          ))}
        </nav>
      )}

      {/* EDITORIAL.POLISH.1: Publish/Export/OpenReel are also available on
          this page now (Editorial Actions, above the timeline) — the
          Sequence page keeps its own copy for the Story/Production
          workflow, this one is scoped to montage. */}
      <p className="text-xs text-[#4b5158] mb-4">
        Frame-aware preview, gap-aware trim and fallback controls, plus{" "}
        Publish/Export/OpenReel Advanced above the timeline. The{" "}
        <Link href={`/projects/${pid}/sequences/${sid}`} className="text-[#5b93d6] hover:text-[#8fbbe8]">
          Sequence page
        </Link>{" "}
        remains the Production entry point.
      </p>

      {/* ── Video source mode — EDITORIAL.SEQUENCE.RESULT.SOURCES.1 ──────
          URL-driven (`?videoSourceMode=`), plain <Link>s (native keyboard
          support, real focus states, no client-side store to keep in sync
          with the server-rendered viewer or Publish below) — same pattern
          as the Sequence selector above. */}
      <div
        role="group"
        aria-label="Video source"
        className="flex items-center gap-1 mb-2 rounded border border-[#232629] p-1 w-fit"
      >
        {VIDEO_SOURCE_MODES.map((m) => (
          <Link
            key={m}
            href={videoSourceModeHref(m)}
            aria-current={videoSourceMode === m ? "true" : undefined}
            className={`rounded px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5b93d6] ${
              videoSourceMode === m
                ? "bg-[#5b93d6]/10 text-[#8fbbe8] border border-[#5b93d6]/50"
                : "text-[#6e767d] hover:text-[#a4abb2] border border-transparent"
            }`}
          >
            {videoSourceModeLabel(m)}
          </Link>
        ))}
      </div>
      <p className="text-xs text-[#a4abb2] mb-1">
        {videoSourceSummary.available} / {videoSourceSummary.total} videos available
      </p>
      <p className="text-[10px] text-[#4b5158] mb-4">
        {videoSourceMode === "latest-generation"
          ? "Latest generation = newest durable Shot Video Library entry per Shot."
          : "Approved only = approved Shot outputs only."}
      </p>

      {/* EDITORIAL.LATEST.APPROVAL.1 — visible only in "latest-generation"
          mode; `eligibleCount` reuses `videoSourceSummary.available`, the
          SAME resolved-source count already computed above for the mode
          summary line, so both numbers can never disagree. Purely a
          display hint — the Server Action re-resolves everything fresh. */}
      <LatestApprovedButton
        projectId={pid}
        sequenceId={sid}
        videoSourceMode={videoSourceMode}
        eligibleCount={videoSourceSummary.available}
        totalCount={videoSourceSummary.total}
      />

      <SectionLabel label="Editorial Actions" />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <PublishBasicSequenceResultButton projectId={pid} sequenceId={sid} videoSourceMode={videoSourceMode} />
          <Link
            href={editorialExportHref}
            target="_blank"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            title="Always Approved only, regardless of the mode selected above"
          >
            Export Editorial JSON
          </Link>
          <Link
            href={advancedEditorHref}
            target="_blank"
            className="rounded border border-[#5b93d6]/50 text-[#5b93d6] px-3 py-1.5 text-sm hover:border-[#5b93d6] hover:text-[#8fbbe8] hover:bg-[#5b93d6]/10 transition-colors"
            title={`Opens the OpenReel sidecar editor in a new tab and loads this sequence using "${videoSourceModeLabel(videoSourceMode)}" sources`}
          >
            Open in Advanced Editor
          </Link>
        </div>
        <p className="text-xs text-[#4b5158] mt-3">
          OpenReel must be running at {sidecarOrigin}. Export Editorial JSON is always Approved only; Open in Advanced Editor uses the mode selected above.
        </p>
        <Collapsible label="Show OpenReel start command">
          <pre className="text-xs text-[#6e767d] bg-[#101214] border border-[#232629] rounded p-3 overflow-x-auto">
{`cd F:/AI/mikai-openreel-sidecar
npx -y pnpm@11.7.0 dev`}
          </pre>
        </Collapsible>
      </Card>

      {/* ── Timeline + Sequence Preview (shared selection) ───────── */}
      {/* EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — `key={videoSourceMode}` forces
          a remount on mode switch. Without it, App Router's soft navigation
          (same route, only the query string changes) keeps this Client
          Component instance alive and reuses its useState lazy initializer's
          ORIGINAL result — the player's default selection would stay
          whatever it resolved to under the PREVIOUS mode's data (e.g. "no
          video" from Approved only) even after switching to Latest
          generation, even though the Shot list below (no client state of
          its own) already shows the new mode's badges correctly. */}
      <EditorialWorkspace
        key={videoSourceMode}
        shots={shotList.map((s) => ({
          id: s.id,
          shotCode: s.shotCode,
          title: s.title,
          durationSeconds: s.durationSeconds,
          hasVideo: (videoSources.get(s.id)?.videoPath ?? null) !== null,
          isApproved: s.approvedVideoPath !== null,
          videoSourceKind: resolvedVideoSourceKind(s.id),
          isPlaceholder: s.title === "Placeholder",
          trimInSeconds: s.trimInSeconds,
          trimOutSeconds: s.trimOutSeconds,
          videoUrl: videoSources.get(s.id)?.videoPath ? refImageUrl(videoSources.get(s.id)!.videoPath!) : null,
        }))}
        projectId={pid}
        sequenceId={sid}
        returnTo={editorialReturnTo}
        editorialItems={editorialItems}
        videoSourceMode={videoSourceMode}
      />
    </div>
  );
}
