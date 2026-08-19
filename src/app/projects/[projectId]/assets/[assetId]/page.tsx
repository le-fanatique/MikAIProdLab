import { db } from "@/db";
import { projects, assets, shotAssets, shots, sequences, sequenceAssets, assetReferenceImages, comfyWorkflows } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import DeleteButton from "@/components/DeleteButton";
import ReferenceImagesPanel from "@/components/ReferenceImagesPanel";
import WorkflowSelectorPanel from "@/components/WorkflowSelectorPanel";
import AssetGenerationPanel from "@/components/AssetGenerationPanel";
import GenerationPanelShell from "@/components/GenerationPanelShell";
import { deleteAsset } from "@/actions/assets";
import { deleteAssetReferenceImage, setAssetReferenceImageApproval } from "@/actions/assetReferenceImages";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import { getLLMSettings } from "@/lib/settings";
import AssetDescriptionEnhancePanel, { AssetNotesEnhancePanel } from "@/components/llmWorkspace/AssetDescriptionEnhancePanel";
import { assetDescriptionGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetDescription";
import { assetNotesGenerateDescriptor } from "@/lib/llmWorkspace/descriptors/assetNotes";
import AssetRetakeDirectedPanel from "@/components/llmWorkspace/AssetRetakeDirectedPanel";
import { assetRetakeDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/assetRetakeDirected";
import AssetBibleEnhancePanel from "@/components/llmWorkspace/AssetBibleEnhancePanel";
import AssetInlineDetailsForm from "@/components/AssetInlineDetailsForm";
import AssetAlignmentPanel from "@/components/projectStyle/AssetAlignmentPanel";
import { getAssetAlignmentStatusAction, type GetAssetAlignmentStatusResult } from "@/actions/assetAlignment";
import { readAssetBibleFreshness } from "@/lib/assetBible/freshness";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// SCHEMA.ASSET_SOURCING.1 (S1a) — same source-level chip colors as
// `AssetsLLMExtractPanel`'s `SOURCE_CHIP_CLASS` (the Approve step this
// sourcing metadata comes from), reused here rather than invented.
const SOURCE_LEVEL_CHIP_CLASS: Record<"outline" | "sequence" | "shot" | "story", string> = {
  outline: "text-[#5b93d6] border-[#5b93d6]/40",
  sequence: "text-[#5fa37a] border-[#5fa37a]/40",
  shot: "text-[#cda24f] border-[#cda24f]/40",
  story: "text-[#6e767d] border-[#2c3035]",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
        {label}
      </div>
      <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export default async function AssetDetailPage({ params, searchParams }: Props) {
  const { projectId, assetId } = await params;
  const resolvedSearchParams = await searchParams;

  const rawAttached = resolvedSearchParams["attachedReference"];
  const attachedReference =
    typeof rawAttached === "string" ? rawAttached : Array.isArray(rawAttached) ? rawAttached[0] : undefined;

  const rawAttachError = resolvedSearchParams["attachError"];
  const attachError =
    typeof rawAttachError === "string" ? rawAttachError : Array.isArray(rawAttachError) ? rawAttachError[0] : undefined;

  const rawGeneration = resolvedSearchParams["generation"];
  const generationOpen =
    rawGeneration === "open" || (Array.isArray(rawGeneration) && rawGeneration[0] === "open");

  const rawWorkflowId = resolvedSearchParams["workflowId"];
  const selectedWorkflowId = typeof rawWorkflowId === "string"
    ? parseInt(rawWorkflowId, 10)
    : Array.isArray(rawWorkflowId)
    ? parseInt(rawWorkflowId[0], 10)
    : null;

  const rawSelector = resolvedSearchParams["selector"];
  const forceSelector =
    rawSelector === "1" || (Array.isArray(rawSelector) && rawSelector[0] === "1");

  // Parse generation-related search params
  const selectedImageByNodeId: Record<string, string> = {};
  const scalarValueByNodeId: Record<string, string> = {};
  const textOverrideByNodeId: Record<string, string> = {};

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (!strValue) continue;
    if (key.startsWith("imageNode_")) selectedImageByNodeId[key.slice("imageNode_".length)] = strValue;
    else if (key.startsWith("scalarNode_")) scalarValueByNodeId[key.slice("scalarNode_".length)] = strValue;
    else if (key.startsWith("textNode_")) textOverrideByNodeId[key.slice("textNode_".length)] = strValue;
  }

  const rawJobId = resolvedSearchParams["jobId"];
  const jobIdParam = typeof rawJobId === "string" ? rawJobId : Array.isArray(rawJobId) ? rawJobId[0] : undefined;
  const activeJobId = jobIdParam && /^\d+$/.test(jobIdParam) ? parseInt(jobIdParam, 10) : null;

  const rawGenerationError = resolvedSearchParams["generationError"];
  const generationError = typeof rawGenerationError === "string" ? rawGenerationError : Array.isArray(rawGenerationError) ? rawGenerationError[0] : undefined;

  const currentSearchParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    const strValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
    if (strValue !== undefined) currentSearchParams[key] = strValue;
  }

  const rawDescUpdated = resolvedSearchParams["descriptionUpdated"];
  const descriptionUpdated =
    rawDescUpdated === "1" || (Array.isArray(rawDescUpdated) && rawDescUpdated[0] === "1");

  const rawNotesUpdated = resolvedSearchParams["notesUpdated"];
  const notesUpdated =
    rawNotesUpdated === "1" || (Array.isArray(rawNotesUpdated) && rawNotesUpdated[0] === "1");

  const rawAssetDescError = resolvedSearchParams["assetDescriptionError"];
  const assetDescriptionError =
    typeof rawAssetDescError === "string"
      ? rawAssetDescError
      : Array.isArray(rawAssetDescError)
      ? rawAssetDescError[0]
      : undefined;

  const rawDetailsUpdated = resolvedSearchParams["detailsUpdated"];
  const detailsUpdated =
    rawDetailsUpdated === "1" || (Array.isArray(rawDetailsUpdated) && rawDetailsUpdated[0] === "1");

  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  // SCHEMA.BIBLE_FRESHNESS.1 (S1b) — the advisory below only has a reason to
  // show when the Asset Bible is actually `stale`: `"no-bible"` (nothing to
  // warn about) and `"current"` (already in sync) both suppress it.
  const bibleFreshness = readAssetBibleFreshness(asset);

  // STYLE.1.F.UI — status load must never take Asset Detail down. A thrown
  // exception here is caught and shown as a local panel error instead of
  // failing the whole page render. The CORE action itself already returns
  // sanitized structured errors for every known failure — this catch only
  // exists for a genuinely unexpected exception, whose raw message could
  // carry internal detail, so it is mapped to one fixed message instead of
  // being surfaced directly (Codex Round 1 P2).
  let alignmentStatus: GetAssetAlignmentStatusResult;
  try {
    alignmentStatus = await getAssetAlignmentStatusAction(pid, aid);
  } catch {
    alignmentStatus = { ok: false, error: "Unable to load Style alignment status. Try again." };
  }

  const sequenceAppearances = await db
    .select({
      assignmentId: sequenceAssets.id,
      sequenceId: sequences.id,
      sequenceTitle: sequences.title,
    })
    .from(sequenceAssets)
    .innerJoin(sequences, eq(sequenceAssets.sequenceId, sequences.id))
    .where(and(eq(sequenceAssets.assetId, aid), eq(sequences.projectId, pid)));

  const shotAppearances = await db
    .select({
      assignmentId: shotAssets.id,
      shotId: shots.id,
      shotCode: shots.shotCode,
      shotTitle: shots.title,
      sequenceId: sequences.id,
      sequenceTitle: sequences.title,
    })
    .from(shotAssets)
    .innerJoin(shots, eq(shotAssets.shotId, shots.id))
    .innerJoin(sequences, eq(shots.sequenceId, sequences.id))
    .where(and(eq(shotAssets.assetId, aid), eq(sequences.projectId, pid)));

  const hasAppearances = sequenceAppearances.length > 0 || shotAppearances.length > 0;

  const refImages = await db
    .select()
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.assetId, aid))
    .orderBy(asc(assetReferenceImages.orderIndex));

  const llmSettings = await getLLMSettings();

  const deleteAction = deleteAsset.bind(null, aid, pid);

  // Resolve effective workflow — apply default if no explicit selection and no forced selector
  let effectiveWorkflowId: number | null = selectedWorkflowId;
  if (generationOpen && !selectedWorkflowId && !forceSelector) {
    const defaults = await getWorkflowDefaults();
    if (defaults.assetImageId !== null) {
      const [wf] = await db
        .select({ id: comfyWorkflows.id })
        .from(comfyWorkflows)
        .where(and(eq(comfyWorkflows.id, defaults.assetImageId), eq(comfyWorkflows.kind, "image")));
      if (wf) effectiveWorkflowId = wf.id;
    }
  }

  // Fetch workflows for selector only when panel is open and no effective workflow
  const imageWorkflows =
    generationOpen && !effectiveWorkflowId
      ? await db
          .select({
            id: comfyWorkflows.id,
            name: comfyWorkflows.name,
            kind: comfyWorkflows.kind,
            description: comfyWorkflows.description,
          })
          .from(comfyWorkflows)
          .where(eq(comfyWorkflows.kind, "image"))
          .orderBy(desc(comfyWorkflows.updatedAt))
      : [];

  const detailBaseUrl = `/projects/${pid}/assets/${aid}`;
  const closeUrl = detailBaseUrl;
  const openPanelUrl = `${detailBaseUrl}?generation=open`;
  const changePanelUrl = `${detailBaseUrl}?generation=open&selector=1`;

  // Build returnTo that preserves generation panel state
  const detailsEditParams = new URLSearchParams();
  if (generationOpen) {
    detailsEditParams.set("generation", "open");
    if (selectedWorkflowId) detailsEditParams.set("workflowId", String(selectedWorkflowId));
    if (forceSelector) detailsEditParams.set("selector", "1");
    if (activeJobId) detailsEditParams.set("jobId", String(activeJobId));
    for (const [nodeId, imageId] of Object.entries(selectedImageByNodeId)) {
      detailsEditParams.set(`imageNode_${nodeId}`, imageId);
    }
    for (const [nodeId, value] of Object.entries(scalarValueByNodeId)) {
      detailsEditParams.set(`scalarNode_${nodeId}`, value);
    }
    for (const [nodeId, value] of Object.entries(textOverrideByNodeId)) {
      detailsEditParams.set(`textNode_${nodeId}`, value);
    }
  }
  const detailsReturnTo = detailsEditParams.toString()
    ? `${detailBaseUrl}?${detailsEditParams.toString()}`
    : detailBaseUrl;

  return (
    <div className={generationOpen ? "flex gap-0 items-start" : ""}>
      <div className={generationOpen ? "flex-1 min-w-0 pr-6" : ""}>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name },
        ]}
      />

      <PageHeader
        title={asset.name}
        badge={<AssetTypeBadge type={asset.type} />}
        meta={project.name}
        actions={
          <>
            <Link
              href={openPanelUrl}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Generate Content
            </Link>
            <Link
              href={`/projects/${pid}/assets/${aid}/edit`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Edit
            </Link>
            <DeleteButton
              action={deleteAction}
              confirm={`Delete "${asset.name}"? This cannot be undone.`}
              className="rounded border border-[#cf7b6b]/30 text-[#cf7b6b] px-3 py-1.5 text-sm hover:border-[#cf7b6b]/60 hover:text-[#e0a194] transition-colors"
            />
          </>
        }
      />

      {/* ── Description ───────────────────────────────────── */}
      <section id="asset-details">
        <SectionLabel label="Description" />
        {detailsUpdated && (
          <div className="mb-4 rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-4 py-3">
            <p className="text-sm text-[#6b9e72]">Asset details updated.</p>
          </div>
        )}
        <Card title="Details">
          <AssetInlineDetailsForm
            projectId={pid}
            assetId={aid}
            description={asset.description}
            notes={asset.notes}
            visualIdentity={asset.visualIdentity}
            usageRules={asset.usageRules}
            forbiddenVariations={asset.forbiddenVariations}
            returnTo={detailsReturnTo}
          />
          <p className="mt-3 border-t border-[#1e2124] pt-3 text-xs text-[#4b5158]">
            Description and notes are used as the text prompt for asset image generation.
          </p>
          {/* SCHEMA.ASSET_SOURCING.1 (S1a) — informative only, never an
              editable field or an action. Renders nothing at all when the
              asset carries none of the three values, which is the case for
              every hand-created asset and every asset created before this
              metadata existed: no empty section, no "—", no orphaned label. */}
          {(asset.sourceLevel || asset.sourceExcerpt || asset.duplicateWarning) && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[#1e2124] pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                  Suggested by AI
                </span>
                {asset.sourceLevel && (
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${SOURCE_LEVEL_CHIP_CLASS[asset.sourceLevel]}`}
                  >
                    {asset.sourceLevel}
                  </span>
                )}
              </div>
              {asset.sourceExcerpt && (
                <p className="text-xs text-[#6e767d] italic leading-relaxed">
                  &ldquo;{asset.sourceExcerpt}&rdquo;
                </p>
              )}
              {asset.duplicateWarning && (
                <div className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1">
                  <p className="text-xs text-amber-500">
                    Possible duplicate of existing asset: &ldquo;{asset.duplicateWarning}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* ── AI Assist ─────────────────────────────────────── */}
      {/* UX.1.ASSETDETAIL.1: both AI-assist panels collapsed by default —
          they stay fully reachable but no longer compete with Details/
          References/Generation for default visual weight. Each auto-opens
          only when it has its own feedback to show (update banner or
          error), reusing the existing query-param signals already computed
          above — no new state introduced. */}
      <SectionLabel label="AI Assist" />
      <Collapsible label="Align with Project Style">
        <Card title="Align with Project Style">
          <AssetAlignmentPanel projectId={pid} assetId={aid} initialStatus={alignmentStatus} />
        </Card>
      </Collapsible>

      {/* UX.PRODUCTIVITY.POLISH.1 — Lot C: Enhance Description and Enhance
          Notes are two fully independent surfaces (own state, own
          anti-double-submit lock, own preview/Apply) — generating,
          applying, or discarding one never touches the other. */}
      <Collapsible label="Enhance Description" defaultOpen={descriptionUpdated || Boolean(assetDescriptionError)}>
        <Card title="Enhance Description">
          {descriptionUpdated && (
            <p className="mb-3 text-xs text-[#6b9e72]">Description updated.</p>
          )}
          {assetDescriptionError && (
            <p className="mb-3 text-xs text-[#c97c7c]">Unable to update asset description.</p>
          )}
          <AssetDescriptionEnhancePanel
            projectId={pid}
            assetId={aid}
            hasExistingDescription={Boolean(asset.description?.trim())}
            isConfigured={!!llmSettings.model.trim()}
            hasUsageContext={sequenceAppearances.length > 0 || shotAppearances.length > 0}
            commitAdvisory={bibleFreshness === "stale" ? assetDescriptionGenerateDescriptor.commitAdvisory : undefined}
          />
        </Card>
      </Collapsible>

      {/* LLMW.UC3.SURFACE.1 (S4) — `asset.retakeDirected` leaves the bench for
          this page, next to "Enhance Description" since both write the same
          `description` column through `updateAssetDescriptionFieldInline`. */}
      <Collapsible label="Retake Description (Directed)">
        <Card title="Retake Description (Directed)">
          <AssetRetakeDirectedPanel
            projectId={pid}
            assetId={aid}
            description={asset.description}
            commitAdvisory={bibleFreshness === "stale" ? assetRetakeDirectedDescriptor.commitAdvisory : undefined}
          />
        </Card>
      </Collapsible>

      <Collapsible label="Enhance Notes" defaultOpen={notesUpdated}>
        <Card title="Enhance Notes">
          {notesUpdated && (
            <p className="mb-3 text-xs text-[#6b9e72]">Notes updated.</p>
          )}
          <AssetNotesEnhancePanel
            projectId={pid}
            assetId={aid}
            hasExistingNotes={Boolean(asset.notes?.trim())}
            isConfigured={!!llmSettings.model.trim()}
            hasUsageContext={sequenceAppearances.length > 0 || shotAppearances.length > 0}
            commitAdvisory={bibleFreshness === "stale" ? assetNotesGenerateDescriptor.commitAdvisory : undefined}
          />
        </Card>
      </Collapsible>

      <Collapsible label="Enhance Asset Bible">
        <Card title="Enhance Asset Bible">
          <AssetBibleEnhancePanel
            projectId={pid}
            assetId={aid}
            description={asset.description}
            notes={asset.notes}
            visualIdentity={asset.visualIdentity}
            usageRules={asset.usageRules}
            forbiddenVariations={asset.forbiddenVariations}
            isConfigured={!!llmSettings.model.trim()}
          />
        </Card>
      </Collapsible>

      {/* ── References ────────────────────────────────────── */}
      <SectionLabel label="References" />
      {attachedReference === "1" && (
        <div className="mb-4 rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-4 py-3">
          <p className="text-sm text-[#6b9e72]">Reference image attached.</p>
        </div>
      )}
      <Card title="Reference Images">
        <ReferenceImagesPanel
          images={refImages}
          addHref={`/projects/${pid}/assets/${aid}/reference-images/new`}
          getEditHref={(imageId) =>
            `/projects/${pid}/assets/${aid}/reference-images/${imageId}/edit`
          }
          getDeleteAction={(imageId) =>
            deleteAssetReferenceImage.bind(null, imageId, aid, pid)
          }
          getApprovalAction={(imageId, nextApproved) =>
            setAssetReferenceImageApproval.bind(null, imageId, aid, pid, nextApproved)
          }
        />
      </Card>

      {/* ── Generation ────────────────────────────────────── */}
      <SectionLabel label="Generation" />
      {generationOpen ? (
        <Link
          href={`/projects/${pid}/assets/${aid}/workflows`}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Open full workflow page ↗
        </Link>
      ) : (
        <div className="flex items-center gap-4">
          <Link
            href={openPanelUrl}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Generate Content
          </Link>
          <Link
            href={`/projects/${pid}/assets/${aid}/workflows`}
            className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Open full workflow page ↗
          </Link>
        </div>
      )}

      {/* ── Appearances ───────────────────────────────────── */}
      <SectionLabel label="Appearances" />
      {hasAppearances ? (
        <Card title="Cast In">
          <div className="flex flex-col gap-4">
            {sequenceAppearances.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                  Sequences
                </p>
                {sequenceAppearances.map((a) => (
                  <Link
                    key={a.assignmentId}
                    href={`/projects/${pid}/sequences/${a.sequenceId}`}
                    className="text-sm text-[#a4abb2] hover:text-[#e7e9ec] transition-colors"
                  >
                    {a.sequenceTitle}
                  </Link>
                ))}
              </div>
            )}

            {shotAppearances.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                  Shots
                </p>
                {shotAppearances.map((a) => (
                  <div key={a.assignmentId} className="flex items-center gap-3">
                    <span className="text-xs text-[#4b5158] shrink-0">{a.sequenceTitle}</span>
                    <span className="text-[#3a4046] text-xs">·</span>
                    <Link
                      href={`/projects/${pid}/sequences/${a.sequenceId}/shots/${a.shotId}`}
                      className="text-sm text-[#a4abb2] hover:text-[#e7e9ec] transition-colors"
                    >
                      {a.shotCode ? `${a.shotCode} — ${a.shotTitle}` : a.shotTitle}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#6e767d]">
            Not yet assigned to any sequence or shot.
          </p>
          {!asset.description && !asset.notes && (
            <p className="text-xs text-[#4b5158]">
              Add a description and cast this asset in shots to make it more useful for generation.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center gap-4 border-t border-[#232629] pt-4">
        <Link
          href={`/projects/${pid}/assets`}
          className="text-sm text-[#6e767d] transition-colors hover:text-[#a4abb2]"
        >
          ← Back to Assets
        </Link>
        <Link
          href={`/projects/${pid}/story`}
          className="text-xs text-[#4b5158] transition-colors hover:text-[#6e767d]"
        >
          ↑ Story Workspace
        </Link>
      </div>
      </div>

      {/* ── Generation Panel ──────────────────────────────── */}
      {generationOpen && (
        <GenerationPanelShell scrollKey={`asset-${aid}`}>
          {effectiveWorkflowId ? (
            <AssetGenerationPanel
              projectId={pid}
              assetId={aid}
              workflowId={effectiveWorkflowId}
              closeUrl={closeUrl}
              selectorUrl={changePanelUrl}
              basePath={detailBaseUrl}
              currentSearchParams={currentSearchParams}
              selectedImageByNodeId={selectedImageByNodeId}
              scalarValueByNodeId={scalarValueByNodeId}
              textOverrideByNodeId={textOverrideByNodeId}
              generationError={generationError}
              activeJobId={activeJobId}
              attachedReference={attachedReference === "1"}
              attachError={attachError ?? null}
            />
          ) : (
            <WorkflowSelectorPanel
              workflows={imageWorkflows}
              basePanelUrl={openPanelUrl}
              closeUrl={closeUrl}
              context="asset"
            />
          )}
        </GenerationPanelShell>
      )}
    </div>
  );
}
