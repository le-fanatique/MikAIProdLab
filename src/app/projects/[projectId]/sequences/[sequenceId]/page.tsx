import { Fragment, type ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, assets, sequenceAssets, shotReferenceImages, generationJobs } from "@/db/schema";
import { eq, and, notInArray, inArray, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import SequenceAssetsPanel from "@/components/SequenceAssetsPanel";
import { deleteSequence } from "@/actions/sequences";
import { deleteShot } from "@/actions/shots";
import { assignAssetToSequence, removeAssetFromSequence } from "@/actions/sequenceAssets";
import SequenceShotsLLMAssistPanel from "@/components/SequenceShotsLLMAssistPanel";
import CastingSuggestionsPanel from "@/components/CastingSuggestionsPanel";
import SequencePromptForm from "@/components/SequencePromptForm";
import SequenceTimelineEditor from "@/components/SequenceTimelineEditor";
import StatusBadge from "@/components/StatusBadge";
import SequenceResultActionForm from "@/components/SequenceResultActionForm";
import PublishBasicSequenceResultButton from "@/components/PublishBasicSequenceResultButton";
import InsertShotFromEditorialButton from "@/components/InsertShotFromEditorialButton";
import Collapsible from "@/components/Collapsible";
import SequenceContextInlineEditor from "@/components/SequenceContextInlineEditor";
import VideoFrameReviewPlayer, { type CaptureDestination } from "@/components/VideoFrameReviewPlayer";
import SequenceStoryboardGrid, { type StoryboardShot } from "@/components/SequenceStoryboardGrid";
import SequenceGenerationPackagePanel from "@/components/SequenceGenerationPackagePanel";
import { getLLMSettings, getMikAIPublicBaseUrl, getOpenReelSidecarUrl } from "@/lib/settings";
import { refImageUrl } from "@/lib/refImageUrl";
import { listSequenceResults, setActiveSequenceResult, archiveSequenceResult } from "@/actions/sequenceResults";
import { parseResultWarnings, sequenceResultSourceModeLabel } from "@/types/sequenceResult";
import { buildAdvancedEditorHref, editorialExportHrefFor } from "@/lib/editorial/advancedEditorLink";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

/**
 * Top-level workspace grouping — visually heavier than SectionLabel so
 * "Production" and "Editorial" read as the two zones of this page, while
 * SectionLabel keeps marking the sub-sections inside each zone
 * (UX.3.PRODUCTION.WORKSPACE.1).
 */
function WorkspaceZoneLabel({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-10 mb-1 first:mt-0">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e7e9ec]">
        {label}
      </h2>
      {hint}
    </div>
  );
}

export default async function SequencePage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  // ── Storyboard grid data (SEQGEN.STORYBOARD.1) ──────────────────────
  // Reuses existing tables only, no new column/migration: first reference
  // image per shot (lowest orderIndex) as the image fallback, and each
  // shot's single most recent generation job (any workflow kind — no join
  // to comfyWorkflows here, see the report's documented limitation) as a
  // lightweight, already-loaded-shape source for a "Generating"/"Failed"
  // status when there is no approved video yet.
  const storyboardShotIds = shotList.map((s) => s.id);

  const storyboardRefImageRows =
    storyboardShotIds.length > 0
      ? await db
          .select({
            shotId: shotReferenceImages.shotId,
            imagePath: shotReferenceImages.imagePath,
            orderIndex: shotReferenceImages.orderIndex,
          })
          .from(shotReferenceImages)
          .where(inArray(shotReferenceImages.shotId, storyboardShotIds))
          .orderBy(asc(shotReferenceImages.orderIndex))
      : [];
  const firstRefImageByShot = new Map<number, string>();
  for (const row of storyboardRefImageRows) {
    if (!firstRefImageByShot.has(row.shotId)) {
      firstRefImageByShot.set(row.shotId, row.imagePath);
    }
  }

  const storyboardJobRows =
    storyboardShotIds.length > 0
      ? await db
          .select({
            shotId: generationJobs.shotId,
            status: generationJobs.status,
            createdAt: generationJobs.createdAt,
          })
          .from(generationJobs)
          .where(inArray(generationJobs.shotId, storyboardShotIds))
          .orderBy(desc(generationJobs.createdAt))
      : [];
  const latestJobStatusByShot = new Map<number, string>();
  for (const row of storyboardJobRows) {
    if (row.shotId !== null && !latestJobStatusByShot.has(row.shotId)) {
      latestJobStatusByShot.set(row.shotId, row.status);
    }
  }

  const storyboardShots: StoryboardShot[] = shotList.map((s) => {
    const latestStatus = latestJobStatusByShot.get(s.id);
    const status: StoryboardShot["status"] = s.approvedVideoPath
      ? "approved"
      : latestStatus === "pending" ||
        latestStatus === "uploading" ||
        latestStatus === "queued" ||
        latestStatus === "running"
      ? "generating"
      : latestStatus === "failed" || latestStatus === "timeout"
      ? "failed"
      : "none";
    const refImagePath = firstRefImageByShot.get(s.id) ?? null;
    return {
      id: s.id,
      shotCode: s.shotCode,
      title: s.title,
      durationSeconds: s.durationSeconds,
      videoUrl: s.approvedVideoPath ? refImageUrl(s.approvedVideoPath) : null,
      imageUrl: !s.approvedVideoPath && refImagePath ? refImageUrl(refImagePath) : null,
      status,
    };
  });

  const totalDuration = shotList.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);

  const assignedRows = await db
    .select({
      assignmentId: sequenceAssets.id,
      assetId: assets.id,
      assetName: assets.name,
      assetType: assets.type,
    })
    .from(sequenceAssets)
    .innerJoin(assets, eq(sequenceAssets.assetId, assets.id))
    .where(eq(sequenceAssets.sequenceId, sid));

  const assignedAssetIds = assignedRows.map((r) => r.assetId);

  const availableAssets =
    assignedAssetIds.length > 0
      ? await db
          .select({ id: assets.id, name: assets.name, type: assets.type })
          .from(assets)
          .where(and(eq(assets.projectId, pid), notInArray(assets.id, assignedAssetIds)))
          .orderBy(asc(assets.orderIndex))
      : await db
          .select({ id: assets.id, name: assets.name, type: assets.type })
          .from(assets)
          .where(eq(assets.projectId, pid))
          .orderBy(asc(assets.orderIndex));

  const sequenceReturnTo = `/projects/${pid}/sequences/${sid}`;

  const rawSequencePromptSaved = resolvedSearchParams["sequencePromptSaved"];
  const sequencePromptSaved = rawSequencePromptSaved === "1" || rawSequencePromptSaved === "true";

  const rawSequencePromptError = resolvedSearchParams["sequencePromptError"];
  const sequencePromptError =
    typeof rawSequencePromptError === "string"
      ? rawSequencePromptError
      : Array.isArray(rawSequencePromptError)
      ? rawSequencePromptError[0]
      : null;

  const rawCreatedCount = resolvedSearchParams["shotsCreated"];
  const createdCountStr = typeof rawCreatedCount === "string" ? rawCreatedCount : Array.isArray(rawCreatedCount) ? rawCreatedCount[0] : undefined;
  const createdCount = createdCountStr ? parseInt(createdCountStr, 10) : null;

  const rawCreateError = resolvedSearchParams["shotsCreateError"];
  const createError = typeof rawCreateError === "string" ? rawCreateError : Array.isArray(rawCreateError) ? rawCreateError[0] : null;

  const rawCastingsApplied = resolvedSearchParams["castingsApplied"];
  const castingsAppliedStr = typeof rawCastingsApplied === "string" ? rawCastingsApplied : Array.isArray(rawCastingsApplied) ? rawCastingsApplied[0] : undefined;
  const castingsApplied = castingsAppliedStr != null ? parseInt(castingsAppliedStr, 10) : null;

  const rawCastingsError = resolvedSearchParams["castingsError"];
  const castingsError = typeof rawCastingsError === "string" ? rawCastingsError : Array.isArray(rawCastingsError) ? rawCastingsError[0] : null;

  const rawDeleteShotError = resolvedSearchParams["deleteShotError"];
  const deleteShotError = typeof rawDeleteShotError === "string" ? rawDeleteShotError : Array.isArray(rawDeleteShotError) ? rawDeleteShotError[0] : null;

  const llmSettings = await getLLMSettings();

  const assignAction = assignAssetToSequence.bind(null, sid, pid);

  const assignedItems = assignedRows.map((row) => ({
    assignmentId: row.assignmentId,
    assetName: row.assetName,
    assetType: row.assetType,
    removeAction: removeAssetFromSequence.bind(null, row.assignmentId, sid, pid),
  }));

  const deleteSeqAction = deleteSequence.bind(null, sid, pid);

  const hasContext = Boolean(
    sequence.summary || sequence.narrativePurpose || sequence.mood || sequence.locationHint
  );

  // EDITORIAL.UX.1: same OpenReel bridge as /nle-prototype, built directly
  // here so Advanced Editor access no longer requires passing through that
  // page first — see src/lib/editorial/advancedEditorLink.ts.
  const mikaiOrigin = await getMikAIPublicBaseUrl();
  const sidecarOrigin = await getOpenReelSidecarUrl();
  const editorialExportHref = editorialExportHrefFor(pid, sid);
  const advancedEditorHref = buildAdvancedEditorHref({ mikaiOrigin, sidecarOrigin, projectId: pid, sequenceId: sid });

  const sequenceResults = await listSequenceResults(pid, sid);
  // Displayed in the main viewer slot: the active result if one exists,
  // else the most recent outdated one (EDITORIAL.INSERT.1) — an outdated
  // result is still shown, with a clear banner, rather than falling back
  // to the "never published" empty state (results already ordered
  // createdAt desc by listSequenceResults).
  const activeResult =
    sequenceResults.find((r) => r.status === "active") ??
    sequenceResults.find((r) => r.status === "outdated") ??
    null;
  const previousResults = sequenceResults.filter((r) => r.id !== activeResult?.id);
  const activeResultWarnings = activeResult ? parseResultWarnings(activeResult.warnings) : [];

  // ── Capture destinations for the active Sequence Result player (UX.POLISH.2) ──
  // Mirrors Shot Detail's own capture-destination build exactly (same
  // component, same project-wide shot/asset query) — a Sequence Result has
  // no single "current shot", so this sequence's own shots are listed
  // first inside "Other Shots" rather than faked as "Current Shot".
  // sourceShotId/sourceSequenceId only need to be A valid shot owned by
  // this project for captureVideoFrame's ownership check — the real
  // destination is always the one explicitly picked from the dropdown.
  const resultVideoExt = activeResult?.videoPath?.split(".").pop()?.toLowerCase() ?? "";
  const resultVideoIsPlayable =
    activeResult?.videoPath != null && ["mp4", "webm", "mov"].includes(resultVideoExt);

  let sequenceResultCaptureDestinations: CaptureDestination[] = [];
  let sequenceResultSourceShotId: number | null = null;

  if (resultVideoIsPlayable && shotList.length > 0) {
    sequenceResultSourceShotId = shotList[0].id;

    const otherSequences = await db
      .select({ id: sequences.id, title: sequences.title })
      .from(sequences)
      .where(eq(sequences.projectId, pid))
      .orderBy(asc(sequences.id));

    const otherSequenceIds = otherSequences.filter((s) => s.id !== sid).map((s) => s.id);

    const otherProjectShots = otherSequenceIds.length > 0
      ? await db
          .select({
            id: shots.id,
            sequenceId: shots.sequenceId,
            title: shots.title,
            description: shots.description,
          })
          .from(shots)
          .where(inArray(shots.sequenceId, otherSequenceIds))
          .orderBy(asc(shots.orderIndex))
      : [];

    const allProjectAssets = await db
      .select({ id: assets.id, name: assets.name, type: assets.type })
      .from(assets)
      .where(eq(assets.projectId, pid))
      .orderBy(asc(assets.type), asc(assets.name));

    // This sequence's own shots first
    for (const s of shotList) {
      sequenceResultCaptureDestinations.push({
        id: `shot:${s.id}`,
        type: "shot",
        shotId: s.id,
        sequenceId: sid,
        label: s.title,
        subtitle: sequence.title,
        groupLabel: "Other Shots",
      });
    }

    // Then the rest of the project, grouped by sequence order
    for (const seq of otherSequences) {
      for (const s of otherProjectShots.filter((sh) => sh.sequenceId === seq.id)) {
        sequenceResultCaptureDestinations.push({
          id: `shot:${s.id}`,
          type: "shot",
          shotId: s.id,
          sequenceId: seq.id,
          label: `${seq.title} / ${s.title}`,
          subtitle: s.description?.slice(0, 80) ?? undefined,
          groupLabel: "Other Shots",
        });
      }
    }

    for (const asset of allProjectAssets) {
      sequenceResultCaptureDestinations.push({
        id: `asset:${asset.id}`,
        type: "asset",
        assetId: asset.id,
        label: asset.name,
        subtitle: asset.type,
        groupLabel: "Assets",
      });
    }
  }

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title },
        ]}
      />

      <PageHeader
        title={sequence.title}
        meta={[
          sequence.sequenceCode || null,
          `${shotList.length} shot${shotList.length !== 1 ? "s" : ""}`,
          totalDuration > 0 ? `${totalDuration.toFixed(1)}s` : null,
        ].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link
              href={`/projects/${pid}/sequences/${sid}/edit`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Edit
            </Link>
            <DeleteButton
              action={deleteSeqAction}
              confirm="Delete this sequence and all its shots?"
              className="rounded border border-[#cf7b6b]/30 text-[#cf7b6b] px-3 py-1.5 text-sm hover:border-[#cf7b6b]/60 hover:text-[#e0a194] transition-colors"
            />
          </>
        }
      />

      {/* ── Editorial zone ───────────────────────────────────────────
          UX.3.PRODUCTION.WORKSPACE.1: Editorial Actions, Sequence Result
          and Previous Results are montage/output concerns — grouped
          under this zone with an explicit, secondary-styled link to the
          dedicated Editorial Workspace route (unchanged, existing
          /editorial page) for advanced trim, gaps and fallback controls. */}
      <WorkspaceZoneLabel
        label="Editorial"
        hint={
          <Link
            href={`/projects/${pid}/sequences/${sid}/editorial`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors whitespace-nowrap"
          >
            Open Editorial Workspace →
          </Link>
        }
      />
      <p className="text-xs text-[#4b5158] mb-4">
        Publish, the active Sequence Result, and the Advanced Editor
        hand-off. Trim, gaps and fallback controls live in Editorial
        Workspace.
      </p>

      {/* ── Editorial Actions ─────────────────────────────────────── */}
      <SectionLabel label="Editorial Actions" />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <PublishBasicSequenceResultButton projectId={pid} sequenceId={sid} />
          <Link
            href={advancedEditorHref}
            target="_blank"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            title="Opens the OpenReel sidecar editor in a new tab and loads this sequence"
          >
            Open in Advanced Editor
          </Link>
          <Link
            href={editorialExportHref}
            target="_blank"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Export Editorial JSON
          </Link>
        </div>
        <p className="text-xs text-[#4b5158] mt-3">
          OpenReel must be running at {sidecarOrigin}.
        </p>
        <Collapsible label="Show OpenReel start command">
          <pre className="text-xs text-[#6e767d] bg-[#101214] border border-[#232629] rounded p-3 overflow-x-auto">
{`cd F:/AI/mikai-openreel-sidecar
npx -y pnpm@9.0.0 dev`}
          </pre>
        </Collapsible>
      </Card>

      {/* ── Sequence Result ───────────────────────────────────────── */}
      <SectionLabel label="Sequence Result" />

      <Card className="mb-6">
        {activeResult ? (
          <div className="flex flex-col gap-3">
            {activeResult.videoPath ? (
              resultVideoIsPlayable && sequenceResultSourceShotId !== null ? (
                <VideoFrameReviewPlayer
                  src={refImageUrl(activeResult.videoPath)}
                  projectId={pid}
                  sequenceId={sid}
                  shotId={sequenceResultSourceShotId}
                  defaultFps={24}
                  captureDestinations={sequenceResultCaptureDestinations}
                />
              ) : (
                <video
                  src={refImageUrl(activeResult.videoPath)}
                  controls
                  className="w-full max-w-xl rounded border border-[#2c3035]"
                />
              )
            ) : (
              <p className="text-xs text-[#4b5158]">No video file recorded for this result yet.</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span>
                <span className="text-[#4b5158]">Source </span>
                <span className="text-[#a4abb2]">{sequenceResultSourceModeLabel(activeResult.sourceMode)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#4b5158]">Status</span>
                <StatusBadge status={activeResult.status} />
              </span>
              {activeResult.durationSeconds != null && (
                <span>
                  <span className="text-[#4b5158]">Duration </span>
                  <span className="text-[#a4abb2]">{activeResult.durationSeconds.toFixed(1)}s</span>
                </span>
              )}
              {activeResult.publishedAt && (
                <span>
                  <span className="text-[#4b5158]">Published </span>
                  <span className="text-[#a4abb2]">{new Date(activeResult.publishedAt).toLocaleString()}</span>
                </span>
              )}
            </div>
            {activeResult.status === "outdated" && (
              <p className="text-xs text-[#cda24f]">
                This result is outdated because the sequence changed after it was published.
                Publish a new Basic or Advanced Sequence Result to update it.
              </p>
            )}
            {activeResult.notes && (
              <p className="text-xs text-[#6e767d]">{activeResult.notes}</p>
            )}
            {activeResultWarnings.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-[#cda24f]">
                {activeResultWarnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <EmptyState
            title="No sequence result published yet."
            description="Use Basic Editorial or Advanced Editor to publish a playable result."
          />
        )}
      </Card>

      {previousResults.length > 0 && (
        <div className="border-t border-[#232629] pt-4 mt-6 mb-6">
          <Collapsible label={`Previous Results (${previousResults.length})`}>
          <div className="rounded-lg border border-[#232629] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#232629] bg-[#141618]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Source
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] w-20">
                    Dur.
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Published
                  </th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {previousResults.map((r) => {
                  const setActiveAction = async () => {
                    "use server";
                    await setActiveSequenceResult(pid, sid, r.id);
                  };
                  const archiveAction = async () => {
                    "use server";
                    await archiveSequenceResult(pid, sid, r.id);
                  };
                  return (
                    <tr key={r.id} className="border-b border-[#1a1d20] last:border-0 hover:bg-[#1a1d20] transition-colors">
                      <td className="px-4 py-3 text-[#a4abb2]">{sequenceResultSourceModeLabel(r.sourceMode)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-[#6e767d] font-mono text-xs">
                        {r.durationSeconds != null ? `${r.durationSeconds.toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#6e767d] text-xs">
                        {r.publishedAt ? new Date(r.publishedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {r.status !== "archived" && (
                            <SequenceResultActionForm
                              action={setActiveAction}
                              label="Set Active"
                              className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors text-xs"
                            />
                          )}
                          {r.status !== "archived" && (
                            <SequenceResultActionForm
                              action={archiveAction}
                              label="Archive"
                              confirmMessage="Archive this sequence result?"
                              className="text-[#cf7b6b]/70 hover:text-[#cf7b6b] transition-colors text-xs"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Collapsible>
        </div>
      )}

      {/* ── Production zone ──────────────────────────────────────────
          UX.3.PRODUCTION.WORKSPACE.1: Context, Shots, Timeline
          (duration/structure controls), Casting, Assets, Sequence
          Prompt and LLM Assist are the Sequence's production concerns.
          "Insert Shot Here" stays inside the Shots table below (it
          creates a real narrative Shot, not a montage item) even though
          it originates from the editorial-insert action — moving it out
          of the table would require splitting the per-row rendering and
          its insertAfterShotId/insertBeforeShotId props from the row
          they annotate, which risks breaking the row-adjacent insertion
          UX for no scope benefit in this ticket. */}
      <WorkspaceZoneLabel label="Production" />

      {/* ── Context ───────────────────────────────────────────────── */}
      {hasContext && (
        <>
          <SectionLabel label="Context" />
          <Card className="mb-6">
            <SequenceContextInlineEditor
              sequenceId={sid}
              projectId={pid}
              summary={sequence.summary}
              description={sequence.description}
              narrativePurpose={sequence.narrativePurpose}
              mood={sequence.mood}
              locationHint={sequence.locationHint}
            />
          </Card>
        </>
      )}

      {/* ── Storyboard — visual complement to the Shots table below
          (SEQGEN.STORYBOARD.1). Read-only: media priority is approved
          video, then first reference image, then an explicit empty
          state — never a fabricated thumbnail or a server-side frame
          extraction. Only rendered when there is at least one Shot; the
          Shots table's own "No shots yet." empty state below already
          covers the zero-shot case, so this avoids a duplicate message. */}
      {shotList.length > 0 && (
        <>
          <SectionLabel label="Storyboard" />
          <div className="mb-6">
            <SequenceStoryboardGrid shots={storyboardShots} projectId={pid} sequenceId={sid} />
          </div>
        </>
      )}

      {/* ── Sequence Generation Package — read-only prompt-compilation
          preview for a future Sequence-level Seedance generation
          (SEQGEN.1). Compiles existing Shot prompts/context only; never
          calls ComfyUI, never produces a video, never writes to a Shot.
          Placed under Storyboard per the ticket's checklist. */}
      {shotList.length > 0 && (
        <div className="mb-6">
          <SequenceGenerationPackagePanel
            projectId={pid}
            sequenceId={sid}
            project={project}
            sequence={sequence}
            shots={shotList}
            searchParams={resolvedSearchParams}
          />
        </div>
      )}

      {/* ── Shots ─────────────────────────────────────────────────── */}
      <SectionLabel
        label="Shots"
        action={
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/new`}
            className="rounded bg-[#212529] text-[#a4abb2] px-3 py-1.5 text-sm hover:bg-[#2c3035] hover:text-[#e7e9ec] transition-colors"
          >
            + Add Shot
          </Link>
        }
      />

      {deleteShotError && (
        <div className="mb-4 rounded border border-[#cf7b6b]/40 bg-[#cf7b6b]/10 px-4 py-2 text-sm text-[#cf7b6b]">
          {deleteShotError}
        </div>
      )}

      {shotList.length === 0 ? (
        <EmptyState
          title="No shots yet."
          action={
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/new`}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Add the first shot →
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border border-[#232629] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#232629] bg-[#141618]">
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] w-28">
                  Code
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hidden md:table-cell">
                  Action Pitch
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hidden lg:table-cell">
                  Camera
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] w-16">
                  Dur.
                </th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {shotList.map((shot) => {
                const deleteShotAction = deleteShot.bind(null, shot.id, sid, pid);
                return (
                  <Fragment key={shot.id}>
                    <tr
                      className="border-b border-[#1a1d20] last:border-0 hover:bg-[#1a1d20] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {shot.shotCode ? (
                          <span className="text-[#a4abb2]">{shot.shotCode}</span>
                        ) : (
                          <span className="text-[#3a4046]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${pid}/sequences/${sid}/shots/${shot.id}`}
                          className="font-medium text-[#e7e9ec] hover:text-white transition-colors"
                        >
                          {shot.title}
                        </Link>
                        {shot.description && (
                          <p className="text-[#4b5158] text-xs mt-0.5 line-clamp-1">
                            {shot.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#6e767d] hidden md:table-cell max-w-xs">
                        <span className="line-clamp-2 text-xs">{shot.actionPitch ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-[#6e767d] hidden lg:table-cell max-w-xs">
                        <span className="line-clamp-2 text-xs">{shot.cameraPitch ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[#6e767d] font-mono text-xs">
                        {shot.durationSeconds != null ? `${shot.durationSeconds}s` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/projects/${pid}/sequences/${sid}/shots/${shot.id}/edit`}
                            className="text-[#6e767d] hover:text-[#a4abb2] transition-colors text-xs"
                          >
                            Edit
                          </Link>
                          <DeleteButton
                            action={deleteShotAction}
                            confirm="Delete this shot?"
                            label="Del"
                            className="text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors text-xs"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-[#1a1d20] last:border-0 bg-[#2c3035]">
                      <td colSpan={6} className="px-4 py-1.5">
                        <InsertShotFromEditorialButton
                          projectId={pid}
                          sequenceId={sid}
                          insertAfterShotId={shot.id}
                          label="Insert Shot Here"
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="last:border-0 bg-[#2c3035]">
                <td colSpan={6} className="px-4 py-1.5">
                  <InsertShotFromEditorialButton
                    projectId={pid}
                    sequenceId={sid}
                    insertAfterShotId={shotList[shotList.length - 1].id}
                    label="Insert New Shot"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────── */}
      {shotList.length > 0 && (
        <>
          <SectionLabel
            label="Timeline"
            action={
              <Link
                href={`/projects/${pid}/sequences/${sid}/editorial`}
                className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                Advanced Trim &amp; Fallback Controls →
              </Link>
            }
          />
          <Card>
            <SequenceTimelineEditor
              shots={shotList.map((s) => ({
                id: s.id,
                shotCode: s.shotCode,
                title: s.title,
                durationSeconds: s.durationSeconds,
              }))}
              projectId={pid}
              sequenceId={sid}
            />
          </Card>
        </>
      )}

      <div className="mb-6 mt-6">
        <Collapsible label="Casting Suggestions">
          <CastingSuggestionsPanel
            projectId={pid}
            sequenceId={sid}
            castingsApplied={Number.isFinite(castingsApplied) ? castingsApplied : null}
            castingsError={castingsError ?? null}
            isConfigured={!!llmSettings.model.trim()}
          />
        </Collapsible>
      </div>

      <Card title="Assets" className="mb-6">
        <SequenceAssetsPanel
          assignedItems={assignedItems}
          availableAssets={availableAssets}
          projectId={pid}
          assignAction={assignAction}
        />
        <p className="text-xs text-[#4b5158] mt-3">
          Assets listed here describe the sequence-level cast. They are not automatically added to individual shots.
        </p>
      </Card>

      <Card title="Sequence Prompt" className="mb-6">
        <SequencePromptForm
          projectId={pid}
          sequenceId={sid}
          initialSequencePrompt={sequence.sequencePrompt ?? null}
          returnTo={sequenceReturnTo}
          saved={sequencePromptSaved}
          error={sequencePromptError}
        />
      </Card>

      <Card title="LLM Assist" className="mb-6">
        <SequenceShotsLLMAssistPanel
          projectId={pid}
          sequenceId={sid}
          returnTo={`/projects/${pid}/sequences/${sid}`}
          createdCount={Number.isFinite(createdCount) ? createdCount : null}
          createError={createError ?? null}
          hasSequencePrompt={Boolean(sequence.sequencePrompt?.trim())}
          existingShotsCount={shotList.length}
        />
      </Card>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link
          href={`/projects/${pid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {project.name}
        </Link>
        <Link
          href={`/projects/${pid}/story`}
          className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
        >
          ↑ Story Workspace
        </Link>
      </div>
    </div>
  );
}
