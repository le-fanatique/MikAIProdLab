import { db } from "@/db";
import { projects, sequences, shots, assets, shotAssets, sequenceAssets } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import StoryGenerationPanel from "@/components/StoryGenerationPanel";
import OutlineGenerationPanel from "@/components/OutlineGenerationPanel";
import OutlineEditorForm from "@/components/OutlineEditorForm";
import SequencesGenerationPanel from "@/components/SequencesGenerationPanel";
import SequenceShotsLLMAssistPanel from "@/components/SequenceShotsLLMAssistPanel";
import StoryFoundationEditor from "@/components/StoryFoundationEditor";
import AssetsLLMExtractPanel from "@/components/AssetsLLMExtractPanel";
import BatchAssetDescriptionEnhancePanel from "@/components/BatchAssetDescriptionEnhancePanel";
import { getLLMSettings } from "@/lib/settings";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function SectionLabel({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-8 mb-4 flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
      {right}
    </div>
  );
}

const ASSET_TYPE_ORDER = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;

function sp(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function StoryPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSP = await searchParams;
  const pid = parseInt(projectId, 10);

  const sequencesCreatedRaw = sp(resolvedSP["sequencesCreated"]);
  const sequencesCreated = sequencesCreatedRaw != null ? parseInt(sequencesCreatedRaw, 10) : null;
  const shotsCreatedRaw = sp(resolvedSP["shotsCreated"]);
  const shotsCreated = shotsCreatedRaw != null ? parseInt(shotsCreatedRaw, 10) : null;
  const assetsCreatedRaw = sp(resolvedSP["assetsCreated"]);
  const assetsCreated = assetsCreatedRaw != null ? parseInt(assetsCreatedRaw, 10) : null;
  const assetsCreateError = sp(resolvedSP["assetsCreateError"]);
  const descriptionUpdated = sp(resolvedSP["descriptionUpdated"]) === "1";
  const notesUpdated = sp(resolvedSP["notesUpdated"]) === "1";

  const [project, llmSettings] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, pid)).then((r) => r[0]),
    getLLMSettings(),
  ]);
  const isLlmConfigured = !!llmSettings.model.trim();
  if (!project) notFound();

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, pid))
    .orderBy(asc(sequences.orderIndex));

  const seqIds = seqs.map((s) => s.id);

  const allShots =
    seqIds.length > 0
      ? await db
          .select({
            id: shots.id,
            sequenceId: shots.sequenceId,
            shotCode: shots.shotCode,
            title: shots.title,
            durationSeconds: shots.durationSeconds,
          })
          .from(shots)
          .where(inArray(shots.sequenceId, seqIds))
          .orderBy(asc(shots.orderIndex))
      : [];

  const assetRows = await db
    .select({
      id: assets.id,
      name: assets.name,
      type: assets.type,
      description: assets.description,
      notes: assets.notes,
    })
    .from(assets)
    .where(eq(assets.projectId, pid));

  const shotIds = allShots.map((s) => s.id);

  const castingRows =
    shotIds.length > 0
      ? await db
          .select({ shotId: shotAssets.shotId })
          .from(shotAssets)
          .where(inArray(shotAssets.shotId, shotIds))
      : [];

  const shotsBySeq = new Map<number, typeof allShots>();
  for (const shot of allShots) {
    const list = shotsBySeq.get(shot.sequenceId) ?? [];
    list.push(shot);
    shotsBySeq.set(shot.sequenceId, list);
  }

  const castedShotIds = new Set(castingRows.map((r) => r.shotId));

  // Per-asset usage counts for BatchAssetDescriptionEnhancePanel
  const assetIds = assetRows.map((a) => a.id);
  const [assetSeqRows, assetShotRows] =
    assetIds.length > 0
      ? await Promise.all([
          db
            .select({ assetId: sequenceAssets.assetId })
            .from(sequenceAssets)
            .where(inArray(sequenceAssets.assetId, assetIds)),
          db
            .select({ assetId: shotAssets.assetId })
            .from(shotAssets)
            .where(inArray(shotAssets.assetId, assetIds)),
        ])
      : [[], []];

  const seqCountByAsset = new Map<number, number>();
  for (const r of assetSeqRows) {
    seqCountByAsset.set(r.assetId, (seqCountByAsset.get(r.assetId) ?? 0) + 1);
  }
  const shotCountByAsset = new Map<number, number>();
  for (const r of assetShotRows) {
    shotCountByAsset.set(r.assetId, (shotCountByAsset.get(r.assetId) ?? 0) + 1);
  }

  const batchAssets = assetRows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description ?? null,
    notes: a.notes ?? null,
    sequenceCount: seqCountByAsset.get(a.id) ?? 0,
    shotCount: shotCountByAsset.get(a.id) ?? 0,
  }));

  const assetCountByType: Record<string, number> = {};
  for (const a of assetRows) {
    assetCountByType[a.type] = (assetCountByType[a.type] ?? 0) + 1;
  }

  const shotTotal = allShots.length;
  const castShotCount = castedShotIds.size;
  const storyReturnTo = `/projects/${pid}/story`;
  const uncastedSeqs = seqs.filter((seq) => {
    const seqShots = shotsBySeq.get(seq.id) ?? [];
    return seqShots.some((shot) => !castedShotIds.has(shot.id));
  });
  const existingAssetNames = assetRows.map((a) => a.name);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Story Workspace" },
        ]}
      />

      <PageHeader
        title="Story Workspace"
        meta={project.name}
        badge={<StatusBadge status={project.status} />}
        actions={
          <Link
            href={`/projects/${pid}/edit`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            Edit Project
          </Link>
        }
      />

      {/* ── 1. Story Foundation ── */}
      <Card title="Story Foundation" className="mb-6">
        <StoryFoundationEditor
          projectId={pid}
          initialPitch={project.pitch}
          initialStory={project.story}
          initialDescription={project.description}
        />
      </Card>

      {/* ── 2. Story Generation ── */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-3">
          Story Generation
        </p>
        <StoryGenerationPanel
          projectId={pid}
          pitch={project.pitch}
          existingStory={project.story}
          isConfigured={isLlmConfigured}
        />
      </div>

      {/* ── 3. Outline ── */}
      <SectionLabel label="Outline" />
      <Card className="mb-6">
        <div className="flex flex-col gap-5">
          <OutlineEditorForm projectId={pid} initialOutline={project.outline} />

          <div className="border-t border-[#1a1d20] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
              Generate Outline Draft
            </p>
            <OutlineGenerationPanel
              projectId={pid}
              pitch={project.pitch}
              story={project.story}
              existingOutline={project.outline}
              isConfigured={isLlmConfigured}
            />
          </div>

          <Link
            href={`/projects/${pid}/outline`}
            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors self-start"
          >
            Open Outline Builder →
          </Link>
        </div>
      </Card>

      {/* ── 4. Production Structure ── */}
      <SectionLabel
        label="Production Structure"
        right={
          seqs.length > 0 ? (
            <span className="text-xs text-[#4b5158]">
              {seqs.length} sequence{seqs.length !== 1 ? "s" : ""}
              {shotTotal > 0
                ? ` · ${shotTotal} shot${shotTotal !== 1 ? "s" : ""}`
                : ""}
            </span>
          ) : undefined
        }
      />

      {/* Sequence creation success banner */}
      {sequencesCreated != null && Number.isFinite(sequencesCreated) && sequencesCreated > 0 && (
        <p className="text-xs text-[#6b9e72] mb-3">
          Created {sequencesCreated} sequence{sequencesCreated !== 1 ? "s" : ""}.
        </p>
      )}
      {shotsCreated != null && Number.isFinite(shotsCreated) && shotsCreated > 0 && (
        <p className="text-xs text-[#6b9e72] mb-3">
          Created {shotsCreated} shot{shotsCreated !== 1 ? "s" : ""}.
        </p>
      )}

      {/* Generate Sequences */}
      <Card className="mb-4">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Generate Sequences
          </p>
          <p className="text-xs text-[#6e767d] leading-relaxed">
            Generate sequence drafts from the current outline, then review before creating them.
          </p>
          <div className="mt-1">
            <SequencesGenerationPanel
              projectId={pid}
              pitch={project.pitch}
              story={project.story}
              outline={project.outline}
              existingSequencesCount={seqs.length}
              isConfigured={isLlmConfigured}
              returnTo={storyReturnTo}
            />
          </div>
        </div>
      </Card>

      {seqs.length === 0 ? (
        <EmptyState
          title="No sequences yet."
          description="Generate sequences above or open the Outline Builder."
          action={
            <Link
              href={`/projects/${pid}/outline`}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Open Outline Builder →
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3 mb-2">
          {seqs.map((seq, i) => {
            const seqShots = shotsBySeq.get(seq.id) ?? [];
            const castCount = seqShots.filter((s) => castedShotIds.has(s.id)).length;
            const visibleShots = seqShots.slice(0, 6);
            const extraCount = seqShots.length - visibleShots.length;

            const castBadgeClass =
              seqShots.length === 0
                ? "text-[#4b5158] border-[#2c3035]"
                : castCount === seqShots.length
                ? "text-[#5fa37a] border-[#5fa37a]/40"
                : castCount > 0
                ? "text-[#cda24f] border-[#cda24f]/40"
                : "text-[#4b5158] border-[#2c3035]";

            return (
              <Card key={seq.id}>
                {/* Sequence header */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-[#4b5158] font-mono text-xs shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/projects/${pid}/sequences/${seq.id}`}
                      className="font-semibold text-[#e7e9ec] hover:text-white transition-colors truncate"
                    >
                      {seq.title}
                    </Link>
                  </div>
                  <Link
                    href={`/projects/${pid}/sequences/${seq.id}`}
                    className="shrink-0 text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                  >
                    Open →
                  </Link>
                </div>

                {seq.summary && (
                  <p className="text-xs text-[#6e767d] mb-2 ml-7 line-clamp-1 leading-relaxed">
                    {seq.summary}
                  </p>
                )}

                {(seq.mood || seq.locationHint || seq.narrativePurpose) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 ml-7 text-xs mb-2">
                    {seq.narrativePurpose && (
                      <span>
                        <span className="text-[#4b5158]">Purpose </span>
                        <span className="text-[#6e767d]">{seq.narrativePurpose}</span>
                      </span>
                    )}
                    {seq.mood && (
                      <span>
                        <span className="text-[#4b5158]">Mood </span>
                        <span className="text-[#6e767d]">{seq.mood}</span>
                      </span>
                    )}
                    {seq.locationHint && (
                      <span>
                        <span className="text-[#4b5158]">Location </span>
                        <span className="text-[#6e767d]">{seq.locationHint}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Status row */}
                <div className="flex items-center gap-2 ml-7 mb-1">
                  {seqShots.length === 0 ? (
                    <span className="text-[10px] text-[#4b5158] border border-dashed border-[#2c3035] px-1.5 py-0.5 rounded">
                      No shots
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#6e767d] border border-[#2c3035] px-1.5 py-0.5 rounded">
                      {seqShots.length} shot{seqShots.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {seqShots.length > 0 && (
                    <span className={`text-[10px] border px-1.5 py-0.5 rounded ${castBadgeClass}`}>
                      {castCount}/{seqShots.length} cast
                    </span>
                  )}
                </div>

                {/* Shots compact list */}
                {visibleShots.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-2 ml-7 pl-3 border-l border-[#1a1d20]">
                    {visibleShots.map((shot) => (
                      <div key={shot.id} className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] text-[#4b5158] shrink-0 w-16 truncate">
                          {shot.shotCode ?? "—"}
                        </span>
                        <Link
                          href={`/projects/${pid}/sequences/${seq.id}/shots/${shot.id}`}
                          className="text-xs text-[#a4abb2] hover:text-[#e7e9ec] transition-colors truncate"
                        >
                          {shot.title}
                        </Link>
                        {shot.durationSeconds != null && (
                          <span className="text-[10px] text-[#4b5158] font-mono shrink-0">
                            {shot.durationSeconds}s
                          </span>
                        )}
                      </div>
                    ))}
                    {extraCount > 0 && (
                      <Link
                        href={`/projects/${pid}/sequences/${seq.id}`}
                        className="text-[10px] text-[#4b5158] hover:text-[#6e767d] transition-colors mt-0.5"
                      >
                        +{extraCount} more →
                      </Link>
                    )}
                  </div>
                )}

                {/* Generate Shots — collapsible */}
                <details className="mt-3 ml-7">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hover:text-[#6e767d] transition-colors select-none list-none">
                    {seqShots.length === 0 ? "▸ Generate Shots" : "▸ Generate More Shots"}
                  </summary>
                  <div className="mt-3 pl-3 border-l border-[#1a1d20]">
                    <SequenceShotsLLMAssistPanel
                      projectId={pid}
                      sequenceId={seq.id}
                      returnTo={storyReturnTo}
                      hasSequencePrompt={Boolean(seq.sequencePrompt?.trim())}
                      existingShotsCount={seqShots.length}
                    />
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 5. Assets ── */}
      <SectionLabel label="Assets" />
      <Card className="mb-6">
        <div className="flex flex-col gap-4">
          {/* Summary row */}
          <div className="flex items-start justify-between gap-4">
            {assetRows.length === 0 ? (
              <p className="text-sm text-[#4b5158] italic">No assets yet.</p>
            ) : (
              <p className="text-sm text-[#a4abb2]">
                {ASSET_TYPE_ORDER.filter((t) => assetCountByType[t])
                  .map(
                    (t) =>
                      `${assetCountByType[t]} ${t}${assetCountByType[t] !== 1 ? "s" : ""}`
                  )
                  .join(" · ")}
              </p>
            )}
            <Link
              href={`/projects/${pid}/assets`}
              className="shrink-0 text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            >
              Open Assets →
            </Link>
          </div>

          {/* Feedback from apply */}
          {descriptionUpdated && (
            <p className="text-xs text-[#6b9e72]">Asset description updated.</p>
          )}
          {notesUpdated && (
            <p className="text-xs text-[#6b9e72]">Asset notes updated.</p>
          )}

          {/* Extract Asset Drafts — collapsible */}
          <details
            className="border-t border-[#1a1d20] pt-3"
            open={Boolean(assetsCreated || assetsCreateError)}
          >
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hover:text-[#6e767d] transition-colors select-none list-none mb-1">
              ▸ Extract Asset Drafts
            </summary>
            <p className="text-xs text-[#6e767d] leading-relaxed mb-3">
              Generate asset candidates from the current story, outline, sequences, and optional shots.
            </p>
            <AssetsLLMExtractPanel
              projectId={pid}
              existingAssetNames={existingAssetNames}
              createdCount={assetsCreated}
              createError={assetsCreateError}
              isConfigured={isLlmConfigured}
              returnTo={storyReturnTo}
            />
          </details>

          {/* Batch Enhance Asset Descriptions — collapsible */}
          <details className="border-t border-[#1a1d20] pt-3">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hover:text-[#6e767d] transition-colors select-none list-none mb-2">
              ▸ Batch Enhance Asset Descriptions
            </summary>
            <BatchAssetDescriptionEnhancePanel
              projectId={pid}
              assets={batchAssets}
              isConfigured={isLlmConfigured}
            />
          </details>
        </div>
      </Card>

      {/* ── 6. Casting Coverage (only if shots exist) ── */}
      {shotTotal > 0 && (
        <>
          <SectionLabel label="Casting Coverage" />
          <Card className="mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-[#a4abb2]">
                  {castShotCount}/{shotTotal} shot{shotTotal !== 1 ? "s" : ""} have at least one
                  cast asset.
                </p>
                {castShotCount < shotTotal && (
                  <>
                    <p className="text-xs text-[#4b5158]">
                      Open individual sequences to run Casting Suggestions.
                    </p>
                    {uncastedSeqs.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {uncastedSeqs.map((seq) => (
                          <Link
                            key={seq.id}
                            href={`/projects/${pid}/sequences/${seq.id}`}
                            className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                          >
                            {seq.title} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <span
                className={[
                  "shrink-0 text-[10px] font-semibold uppercase tracking-wider border px-2 py-0.5 rounded",
                  castShotCount === shotTotal
                    ? "text-[#5fa37a] border-[#5fa37a]/40"
                    : castShotCount > 0
                    ? "text-[#cda24f] border-[#cda24f]/40"
                    : "text-[#4b5158] border-[#2c3035]",
                ].join(" ")}
              >
                {castShotCount === shotTotal
                  ? "Full Coverage"
                  : castShotCount > 0
                  ? "Partial"
                  : "No Casting"}
              </span>
            </div>
          </Card>
        </>
      )}

      <div className="mt-10 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to project
        </Link>
      </div>
    </div>
  );
}
