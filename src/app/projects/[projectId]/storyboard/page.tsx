import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  shotAssets,
  assets,
  shotReferenceImages,
  assetReferenceImages,
  storyboardImages,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  generationJobs,
  comfyWorkflows,
} from "@/db/schema";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StoryboardGrid, { type StoryboardGridShot, type StoryboardGridStatus } from "@/components/StoryboardGrid";
import StoryboardAssetsPanel, { type StoryboardCastAsset } from "@/components/StoryboardAssetsPanel";
import SequenceStoryboardDraftsPanel, {
  type SequenceStoryboardDraft,
} from "@/components/SequenceStoryboardDraftsPanel";
import SequenceGenerationPackagePanel from "@/components/SequenceGenerationPackagePanel";
import { uploadSequenceStoryboardImage, deleteSequenceStoryboardImage } from "@/actions/sequenceStoryboard";
import { refImageUrl } from "@/lib/refImageUrl";
import { compileShotPrompt } from "@/lib/prompts/compileShotPrompt";
import { getReferenceImageRoleLabel } from "@/lib/referenceImageRoles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-8 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

const IN_FLIGHT_JOB_STATUSES = new Set(["pending", "uploading", "queued", "running"]);
const FAILED_JOB_STATUSES = new Set(["failed", "timeout"]);

export default async function StoryboardPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  // ── Sequence selector data (same navigation model as Editorial) ────────
  const projectSequences = await db
    .select({ id: sequences.id, title: sequences.title, sequenceCode: sequences.sequenceCode })
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  if (projectSequences.length === 0) {
    return (
      <div>
        <Breadcrumb
          crumbs={[
            { label: "Projects", href: "/projects" },
            { label: project.name, href: `/projects/${pid}` },
            { label: "Storyboard" },
          ]}
        />
        <PageHeader title="Storyboard" meta={project.name} />
        <EmptyState
          title="No Sequences yet."
          description="Storyboard needs a Sequence with Shots. Create one in Story Workspace first."
          action={
            <Link href={`/projects/${pid}/story`} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
              Open Story Workspace →
            </Link>
          }
        />
      </div>
    );
  }

  const requestedSid = sp(resolvedSearchParams["sequenceId"]);
  const requestedSidNum = requestedSid ? parseInt(requestedSid, 10) : null;
  const currentSeqMeta =
    (requestedSidNum !== null && projectSequences.find((s) => s.id === requestedSidNum)) ||
    projectSequences[0];
  const sid = currentSeqMeta.id;

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const storyboardReturnTo = `/projects/${pid}/storyboard?sequenceId=${sid}`;

  const shotList = await db
    .select()
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));
  const shotIds = shotList.map((s) => s.id);

  // ── Storyboard drafts (SEQGEN.STORYBOARD.2 dedicated store) ─────────────
  const draftRows =
    shotIds.length > 0
      ? await db
          .select()
          .from(storyboardImages)
          .where(inArray(storyboardImages.shotId, shotIds))
          .orderBy(desc(storyboardImages.createdAt))
      : [];
  const draftsByShot = new Map<number, typeof draftRows>();
  for (const row of draftRows) {
    const list = draftsByShot.get(row.shotId) ?? [];
    list.push(row);
    draftsByShot.set(row.shotId, list);
  }

  // ── Most recent *image*-workflow job per Shot, for the Generating/Failed
  // heuristic when no draft exists yet. Approximate by design: generation_jobs
  // has no storyboard-specific tag (documented limitation, see report). ──
  const jobRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: generationJobs.shotId,
            status: generationJobs.status,
            createdAt: generationJobs.createdAt,
            workflowKind: comfyWorkflows.kind,
          })
          .from(generationJobs)
          .innerJoin(comfyWorkflows, eq(generationJobs.workflowId, comfyWorkflows.id))
          .where(inArray(generationJobs.shotId, shotIds))
          .orderBy(desc(generationJobs.createdAt))
      : [];
  const latestImageJobStatusByShot = new Map<number, string>();
  for (const row of jobRows) {
    if (row.workflowKind !== "image" || row.shotId === null) continue;
    if (!latestImageJobStatusByShot.has(row.shotId)) {
      latestImageJobStatusByShot.set(row.shotId, row.status);
    }
  }

  // ── Casting (unique per Asset) + references ─────────────────────────────
  const castRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: shotAssets.shotId,
            assetId: assets.id,
            assetName: assets.name,
            assetType: assets.type,
          })
          .from(shotAssets)
          .innerJoin(assets, eq(shotAssets.assetId, assets.id))
          .where(inArray(shotAssets.shotId, shotIds))
          .orderBy(asc(assets.name))
      : [];
  const castByShot = new Map<number, typeof castRows>();
  const shotIdsByAsset = new Map<number, Set<number>>();
  const assetMetaById = new Map<number, { assetName: string; assetType: string }>();
  for (const row of castRows) {
    const list = castByShot.get(row.shotId) ?? [];
    list.push(row);
    castByShot.set(row.shotId, list);

    const shotSet = shotIdsByAsset.get(row.assetId) ?? new Set<number>();
    shotSet.add(row.shotId);
    shotIdsByAsset.set(row.assetId, shotSet);

    if (!assetMetaById.has(row.assetId)) {
      assetMetaById.set(row.assetId, { assetName: row.assetName, assetType: row.assetType });
    }
  }
  const uniqueAssetIds = Array.from(assetMetaById.keys());

  const shotRefRows =
    shotIds.length > 0
      ? await db
          .select({ shotId: shotReferenceImages.shotId })
          .from(shotReferenceImages)
          .where(inArray(shotReferenceImages.shotId, shotIds))
      : [];
  const shotRefCountByShot = new Map<number, number>();
  for (const row of shotRefRows) {
    shotRefCountByShot.set(row.shotId, (shotRefCountByShot.get(row.shotId) ?? 0) + 1);
  }

  const assetRefRows =
    uniqueAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            imagePath: assetReferenceImages.imagePath,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            variantState: assetReferenceImages.variantState,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, uniqueAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];
  const assetRefsByAsset = new Map<number, typeof assetRefRows>();
  for (const row of assetRefRows) {
    const list = assetRefsByAsset.get(row.assetId) ?? [];
    list.push(row);
    assetRefsByAsset.set(row.assetId, list);
  }

  // ── Storyboard Assets: one row per unique cast Asset, first-seen order ──
  const storyboardCastAssets: StoryboardCastAsset[] = uniqueAssetIds.map((assetId) => {
    const meta = assetMetaById.get(assetId)!;
    const refs = assetRefsByAsset.get(assetId) ?? [];
    return {
      assetId,
      assetName: meta.assetName,
      assetType: meta.assetType,
      shotCount: shotIdsByAsset.get(assetId)?.size ?? 0,
      references: refs.map((r) => ({
        id: r.id,
        // Same id format as RuntimeImageOption ("asset-{assetId}-{imageId}",
        // src/lib/comfy/mapWorkflowInputs.ts) — the actual transport key
        // ShotGenerationPanel matches against `storyboardRefs`.
        refId: `asset-${assetId}-${r.id}`,
        imageUrl: refImageUrl(r.imagePath),
        label: r.label,
        roleLabel: getReferenceImageRoleLabel(r.imageRole),
        variantState: r.variantState,
        approvedForGeneration: r.approvedForGeneration,
      })),
    };
  });

  // ── Grid rows ────────────────────────────────────────────────────────────
  const gridShots: StoryboardGridShot[] = shotList.map((shot) => {
    const drafts = draftsByShot.get(shot.id) ?? [];
    const visibleDrafts = drafts.filter((d) => d.status !== "rejected");
    const approved = visibleDrafts.find((d) => d.status === "approved") ?? null;
    // SEQGEN.STORYBOARD.EXTRACT.1-FIX2 — an extracted panel (extractionRegionId
    // set) takes thumbnail priority over any other non-approved draft, even an
    // older or newer one, since it's a deliberately-confirmed crop rather than
    // a generation attempt. An approved draft (of any origin) still always wins.
    const extractedDraft = visibleDrafts.find((d) => d.extractionRegionId !== null) ?? null;
    const display = approved ?? extractedDraft ?? visibleDrafts[0] ?? null;

    let status: StoryboardGridStatus;
    if (display) {
      status = display.status === "approved" ? "approved" : "generated";
    } else {
      const latestJobStatus = latestImageJobStatusByShot.get(shot.id);
      if (latestJobStatus && IN_FLIGHT_JOB_STATUSES.has(latestJobStatus)) status = "generating";
      else if (latestJobStatus && FAILED_JOB_STATUSES.has(latestJobStatus)) status = "failed";
      else status = "not_generated";
    }

    const compiled = compileShotPrompt({ kind: "image", shotPrompt: shot.shotPrompt });
    const cast = castByShot.get(shot.id) ?? [];
    const referenceCount =
      (shotRefCountByShot.get(shot.id) ?? 0) +
      cast.reduce((sum, c) => sum + (assetRefsByAsset.get(c.assetId)?.length ?? 0), 0);

    return {
      shotId: shot.id,
      shotCode: shot.shotCode,
      title: shot.title,
      durationSeconds: shot.durationSeconds,
      displayImageUrl: display ? refImageUrl(display.imagePath) : null,
      displayDraftId: display?.id ?? null,
      displayDraftStatus: display?.status ?? null,
      status,
      compiledPromptPreview: compiled.text.trim() ? compiled.text : null,
      referenceCount,
    };
  });

  // ── Sequence Storyboard drafts (SEQGEN.STORYBOARD.3) — every version,
  // newest first, so a saved draft is never invisible after returning here. ──
  const sequenceDraftRows = await db
    .select()
    .from(sequenceStoryboardImages)
    .where(eq(sequenceStoryboardImages.sequenceId, sid))
    .orderBy(desc(sequenceStoryboardImages.createdAt));
  // FIX6 (Lot B) — which drafts are already an extraction's source, so
  // Delete can be disabled/blocked for them without a round trip.
  const usedSourceImageIds = new Set(
    (
      await db
        .select({ sourceStoryboardImageId: sequenceStoryboardExtractions.sourceStoryboardImageId })
        .from(sequenceStoryboardExtractions)
        .where(eq(sequenceStoryboardExtractions.sequenceId, sid))
    )
      .map((r) => r.sourceStoryboardImageId)
      .filter((id): id is number => id !== null)
  );
  const sequenceStoryboardDrafts: SequenceStoryboardDraft[] = sequenceDraftRows.map((d) => ({
    id: d.id,
    imageUrl: refImageUrl(d.imagePath),
    status: d.status,
    createdAt: d.createdAt,
    promptPreview: d.promptSnapshot,
    usedByExtraction: usedSourceImageIds.has(d.id),
  }));
  const sequenceStoryboardUploadError = sp(resolvedSearchParams["sequenceStoryboardUploadError"]);

  const storyboardApproved = sp(resolvedSearchParams["storyboardApproved"]) === "1";
  const storyboardApproveError = sp(resolvedSearchParams["storyboardApproveError"]);
  const storyboardRejected = sp(resolvedSearchParams["storyboardRejected"]) === "1";

  // Selection made in Storyboard Assets — transported into each Shot's
  // "Generate"/"Regenerate" link so ShotGenerationPanel can filter its
  // available images down to exactly this ordered set (retake fix: this
  // used to stop at the local checkbox state and never reach generation).
  const storyboardRefsParam = sp(resolvedSearchParams["storyboardRefs"]) ?? "";

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Storyboard" },
        ]}
      />

      <PageHeader title="Storyboard" meta={project.name} />

      {/* ── Sequence selector — same navigation model as Editorial ─────── */}
      <nav aria-label="Sequences" className="flex flex-wrap gap-1.5 mb-4">
        {projectSequences.map((s) => (
          <Link
            key={s.id}
            href={`/projects/${pid}/storyboard?sequenceId=${s.id}`}
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
      <p className="text-xs text-[#6e767d] mb-2">
        {sequence.sequenceCode ? `${sequence.sequenceCode} · ` : ""}
        {sequence.title}
      </p>

      {(storyboardApproved || storyboardApproveError || storyboardRejected) && (
        <p className={`text-xs mb-3 ${storyboardApproveError ? "text-[#cf7b6b]" : "text-[#6b9e72]"}`}>
          {storyboardApproveError ??
            (storyboardApproved ? "Storyboard draft approved." : "Storyboard draft rejected.")}
        </p>
      )}

      <SectionLabel label="Storyboard" />
      <div className="mb-3">
        <Link
          href={`/projects/${pid}/sequences/${sid}/storyboard/workflows${
            storyboardRefsParam ? `?storyboardRefs=${encodeURIComponent(storyboardRefsParam)}` : ""
          }`}
          className="inline-flex items-center rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-3 py-1.5 text-sm font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5b93d6] focus-visible:outline-offset-1"
        >
          Generate Sequence Storyboard
        </Link>
      </div>
      <StoryboardGrid
        projectId={pid}
        sequenceId={sid}
        shots={gridShots}
        returnTo={storyboardReturnTo}
        storyboardRefs={storyboardRefsParam}
      />

      <SectionLabel label="Sequence Storyboard Drafts" />
      {sequenceStoryboardDrafts.length > 0 && (
        <div className="mb-3">
          <Link
            href={`/projects/${pid}/sequences/${sid}/storyboard/extract`}
            className="inline-flex items-center rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Extract Storyboard Panels
          </Link>
        </div>
      )}
      <SequenceStoryboardDraftsPanel
        drafts={sequenceStoryboardDrafts}
        sequenceId={sid}
        returnTo={storyboardReturnTo}
        uploadAction={uploadSequenceStoryboardImage}
        deleteAction={deleteSequenceStoryboardImage}
        uploadError={sequenceStoryboardUploadError}
      />

      <SectionLabel label="Storyboard Assets" />
      <StoryboardAssetsPanel projectId={pid} assets={storyboardCastAssets} />

      <SectionLabel label="Sequence Generation Package" />
      <SequenceGenerationPackagePanel
        projectId={pid}
        sequenceId={sid}
        project={{ name: project.name, pitch: project.pitch, story: project.story }}
        sequence={{
          title: sequence.title,
          sequenceCode: sequence.sequenceCode,
          summary: sequence.summary,
          mood: sequence.mood,
          locationHint: sequence.locationHint,
          narrativePurpose: sequence.narrativePurpose,
        }}
        shots={shotList}
        searchParams={resolvedSearchParams}
      />

      <div className="mt-10 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link
          href={`/projects/${pid}/sequences/${sid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {sequence.title}
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
