import { db } from "@/db";
import { projects, sequences, shots, generationJobs, shotReferenceImages, comfyWorkflows } from "@/db/schema";
import { eq, and, desc, asc, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  extractEligiblePlyOutput,
  buildCameraLabPlyUrl,
  parseIdParam,
  type EligiblePlyOutput,
} from "@/lib/cameraLab/eligibility";
import CameraLabWorkspace from "@/components/cameraLab/CameraLabWorkspace";
import CameraLabPolishWorkspace from "@/components/cameraLab/CameraLabPolishWorkspace";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import { clearShotPlyCaches } from "@/actions/cameraLabPlyCache";
import { parseComfyWorkflow } from "@/lib/comfy/parseWorkflow";
import { requireSingleImageInput, classifyNonImageInputs, type ClassifiedNonImageInput } from "@/lib/cameraLab/workflowInputContract";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CameraLabPage({ params, searchParams }: Props) {
  const { projectId, sequenceId, shotId } = await params;
  const resolvedSearchParams = await searchParams;

  function sp(key: string): string | undefined {
    const v = resolvedSearchParams[key];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  }

  const pid = parseIdParam(projectId);
  const sid = parseIdParam(sequenceId);
  const shid = parseIdParam(shotId);
  if (pid === null || sid === null || shid === null) notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();
  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  // Eligible PLY outputs: done jobs of THIS Shot whose outputPath is a
  // confinable job-cache PLY. The strict rule lives in the pure module.
  const doneJobRows = await db
    .select({
      id: generationJobs.id,
      shotId: generationJobs.shotId,
      status: generationJobs.status,
      outputPath: generationJobs.outputPath,
      completedAt: generationJobs.completedAt,
    })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.shotId, shid),
        eq(generationJobs.status, "done"),
        isNotNull(generationJobs.outputPath)
      )
    )
    .orderBy(desc(generationJobs.createdAt));

  const eligiblePlys: Array<EligiblePlyOutput & { completedAt: string | null }> = [];
  for (const row of doneJobRows) {
    const output = extractEligiblePlyOutput(row, shid);
    if (output) eligiblePlys.push({ ...output, completedAt: row.completedAt });
  }

  const referenceImages = await db
    .select({
      id: shotReferenceImages.id,
      imagePath: shotReferenceImages.imagePath,
      label: shotReferenceImages.label,
      imageRole: shotReferenceImages.imageRole,
      sourceFilename: shotReferenceImages.sourceFilename,
    })
    .from(shotReferenceImages)
    .where(eq(shotReferenceImages.shotId, shid))
    .orderBy(asc(shotReferenceImages.orderIndex));

  // CAMLAB.POLISH.1 — Lots A-E: three-column guided workspace, additive
  // above Setup. Workflow names/ids are only ever read from the configured
  // Generation Defaults — never inferred by name/id/SHARP class.
  const workflowDefaults = await getWorkflowDefaults();
  const [gaussianPlyWorkflowRow, gaussianToImageWorkflowRow] = await Promise.all([
    workflowDefaults.gaussianPlyId
      ? db.select({ id: comfyWorkflows.id, name: comfyWorkflows.name }).from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowDefaults.gaussianPlyId))
      : Promise.resolve([]),
    workflowDefaults.gaussianToImageId
      ? db.select({ id: comfyWorkflows.id, name: comfyWorkflows.name }).from(comfyWorkflows).where(eq(comfyWorkflows.id, workflowDefaults.gaussianToImageId))
      : Promise.resolve([]),
  ]);

  // CAMLAB.POLISH.1 retake round 2 — every non-image `(Input)` node the
  // configured Default Gaussian PLY workflow currently has, re-derived
  // server-side on every page load (never cached/inferred), so Column 1 can
  // render editable controls for them. An unrecognized kind or a missing
  // single image input surfaces as an explicit diagnostic, never a silently
  // empty control list.
  let gaussianPlyNonImageInputs: ClassifiedNonImageInput[] = [];
  let gaussianPlyInputsError: string | null = null;
  if (gaussianPlyWorkflowRow[0]) {
    const [fullWorkflow] = await db
      .select({ workflowJson: comfyWorkflows.workflowJson })
      .from(comfyWorkflows)
      .where(eq(comfyWorkflows.id, gaussianPlyWorkflowRow[0].id));
    if (!fullWorkflow) {
      gaussianPlyInputsError = "The configured Default Gaussian PLY workflow no longer exists.";
    } else {
      const parsed = parseComfyWorkflow(fullWorkflow.workflowJson);
      if (!parsed) {
        gaussianPlyInputsError = "The Default Gaussian PLY workflow's JSON could not be parsed.";
      } else {
        const single = requireSingleImageInput(parsed.inputs);
        if (!single.ok) {
          gaussianPlyInputsError = single.error;
        } else {
          const classified = classifyNonImageInputs(parsed.inputs);
          if (!classified.ok) {
            gaussianPlyInputsError = classified.error;
          } else {
            gaussianPlyNonImageInputs = classified.inputs;
          }
        }
      }
    }
  }

  // Explicit selections via URL — every id must be one of THIS Shot's
  // admissible entries; anything else 404s without detail.
  const rawJobId = sp("jobId");
  const rawRefId = sp("refId");

  let selectedPly: (EligiblePlyOutput & { completedAt: string | null }) | null = null;
  if (rawJobId !== undefined) {
    const jobId = parseIdParam(rawJobId);
    if (jobId === null) notFound();
    selectedPly = eligiblePlys.find((p) => p.jobId === jobId) ?? null;
    if (!selectedPly) notFound();
  }

  let selectedRef: (typeof referenceImages)[number] | null = null;
  if (rawRefId !== undefined) {
    const refId = parseIdParam(rawRefId);
    if (refId === null) notFound();
    selectedRef = referenceImages.find((r) => r.id === refId) ?? null;
    if (!selectedRef) notFound();
  }

  const shotDetailUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}`;
  const cameraLabUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}/camera-lab`;

  const bothSelected = selectedPly !== null && selectedRef !== null;

  // CAMLAB.POLISH.1 retake round 5 — Clear Shot PLY caches feedback, read
  // from the redirect query the real, current server action produces
  // (`src/actions/cameraLabPlyCache.ts`). Field names must track that
  // action exactly — a stale name here would silently swallow real
  // failure feedback (Codex round 6 finding).
  const plyCacheError = sp("plyCacheError") ?? null;
  const plyCachesCleared = sp("plyCachesCleared");
  const plyCacheReverted = sp("plyCacheReverted") ?? null;
  const plyCacheIncompleteCompensation = sp("plyCacheIncompleteCompensation") ?? null;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: shot.shotCode ?? shot.title, href: shotDetailUrl },
          { label: "Gaussian Camera" },
        ]}
      />

      <PageHeader
        title="Gaussian Camera"
        meta={shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title}
      />

      <CameraLabPolishWorkspace
        projectId={pid}
        sequenceId={sid}
        shotId={shid}
        referenceImages={referenceImages}
        gaussianPlyWorkflow={gaussianPlyWorkflowRow[0] ?? null}
        gaussianToImageWorkflow={gaussianToImageWorkflowRow[0] ?? null}
        gaussianPlyNonImageInputs={gaussianPlyNonImageInputs}
        gaussianPlyInputsError={gaussianPlyInputsError}
        attachedReference={sp("attachedReference") === "1"}
        attachError={sp("attachError") ?? null}
      />

      <Collapsible label="Setup" defaultOpen={false}>
        <div className="flex flex-col gap-4">
          {plyCacheError && (
            <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">{plyCacheError}</p>
          )}
          {plyCacheIncompleteCompensation && (
            <p className="text-xs text-[#cf7b6b] border border-[#3d2323] rounded px-3 py-2 bg-[#1a1212]">
              Cleanup could not be fully compensated — a stray file and/or an incorrect database state may remain:{" "}
              {plyCacheIncompleteCompensation}
            </p>
          )}
          {plyCachesCleared !== undefined && (
            <div className="text-xs border border-[#2c6142]/40 rounded px-3 py-2 bg-[#12241a] text-[#8fc9a0] flex flex-col gap-1">
              <span>
                {plyCachesCleared === "0" && !plyCacheReverted && !plyCacheIncompleteCompensation
                  ? "No eligible Gaussian PLY caches were found for this Shot."
                  : `${plyCachesCleared} Gaussian PLY cache(s) cleared for this Shot. Their generation jobs remain in history.`}
              </span>
              {plyCachesCleared !== "0" && (
                <span className="text-[10px] text-[#c9a24b]">
                  A viewer already open in Column 2 may still hold cached geometry in memory — it will no longer be
                  recognized as available on the next Refresh or page reload.
                </span>
              )}
            </div>
          )}
          {plyCacheReverted && (
            <p className="text-xs text-[#c9a24b] border border-[#4a3a1f] rounded px-3 py-2 bg-[#1f1a10]">
              {plyCacheReverted} cache(s) could not be fully cleaned up and were reverted (file and database both
              restored to their original state) — nothing was lost, but they were not cleared.
            </p>
          )}

          {eligiblePlys.length === 0 ? (
            <Card title="Gaussian PLY">
              <p className="text-sm text-[#a4abb2]">
                No finished Gaussian PLY output is available for this Shot. Run a
                Gaussian Splat generation for this Shot first, then come back here
                to explore it.
              </p>
              <Link
                href={shotDetailUrl}
                className="mt-3 inline-block text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
              >
                ← Back to Shot
              </Link>
            </Card>
          ) : (
            <Card title="Setup">
              <p className="text-[10px] leading-relaxed text-[#4b5158] mb-3">
                Read-only inventory. Use Columns 1–3 above to generate and select — this list has no selection
                controls; existing deep links already in the URL still open the legacy viewer below.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-2">
                    Gaussian PLY ({eligiblePlys.length})
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {eligiblePlys.map((ply) => {
                      const active = selectedPly?.jobId === ply.jobId;
                      return (
                        <div
                          key={ply.jobId}
                          aria-current={active ? "true" : undefined}
                          className={`rounded border px-3 py-2 text-xs ${
                            active
                              ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]"
                              : "border-[#2c3035] text-[#a4abb2]"
                          }`}
                        >
                          <span className="font-mono">Job #{ply.jobId}</span>
                          <span className="text-[#6e767d]"> — {ply.filename}</span>
                          {ply.completedAt && (
                            <span className="block text-[10px] text-[#4b5158]">
                              Completed {ply.completedAt}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <form action={clearShotPlyCaches} className="mt-3">
                    <input type="hidden" name="projectId" value={String(pid)} />
                    <input type="hidden" name="sequenceId" value={String(sid)} />
                    <input type="hidden" name="shotId" value={String(shid)} />
                    <input type="hidden" name="returnTo" value={cameraLabUrl} />
                    <ConfirmSubmitButton
                      confirmMessage={`Clear all ${eligiblePlys.length} Gaussian PLY cache file(s) for this Shot? Generation jobs stay in history; only the cached .ply files are removed.`}
                      className="rounded border border-[#3d2323] px-3 py-1.5 text-xs text-[#cf7b6b] hover:border-[#5a3030] transition-colors"
                    >
                      Clear Shot PLY caches
                    </ConfirmSubmitButton>
                  </form>
                </div>

                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-2">
                    Source image ({referenceImages.length})
                  </div>
                  {referenceImages.length === 0 ? (
                    <p className="text-xs text-[#a4abb2]">
                      This Shot has no reference images yet. Add one to define the
                      capture ratio and resolution.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {referenceImages.map((ref) => {
                        const active = selectedRef?.id === ref.id;
                        return (
                          <div
                            key={ref.id}
                            aria-current={active ? "true" : undefined}
                            className={`flex items-center gap-3 rounded border px-3 py-2 text-xs ${
                              active
                                ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]"
                                : "border-[#2c3035] text-[#a4abb2]"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={refImageUrl(ref.imagePath)}
                              alt={ref.label ?? ref.sourceFilename ?? `Reference ${ref.id}`}
                              className="h-9 w-14 rounded object-cover border border-[#232629]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate">
                                {ref.label ?? ref.sourceFilename ?? `Reference #${ref.id}`}
                              </span>
                              <span className="block text-[10px] text-[#4b5158]">{ref.imageRole}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] leading-relaxed text-[#4b5158]">
                    Your explicit choice — this image defines the capture aspect
                    ratio and exact resolution. It is not an automatically proven
                    source of the selected PLY.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </Collapsible>

      <div className="flex flex-col gap-4 mt-4">
        {bothSelected && selectedPly && selectedRef && (
          <CameraLabWorkspace
            key={`${selectedPly.jobId}-${selectedRef.id}`}
            projectId={pid}
            sequenceId={sid}
            shotId={shid}
            jobId={selectedPly.jobId}
            refId={selectedRef.id}
            plyUrl={buildCameraLabPlyUrl(selectedPly)}
            plyLabel={`Job #${selectedPly.jobId} — ${selectedPly.filename}`}
            sourceImageUrl={refImageUrl(selectedRef.imagePath)}
            sourceImageLabel={
              selectedRef.label ?? selectedRef.sourceFilename ?? `Reference #${selectedRef.id}`
            }
          />
        )}

        {!bothSelected && eligiblePlys.length > 0 && (
          <p className="text-xs text-[#6e767d]">
            The legacy viewer opens from a deep link with both `jobId` and `refId` in the URL. Use Columns 1–3 above
            for the guided flow instead.
          </p>
        )}
      </div>
    </div>
  );
}
