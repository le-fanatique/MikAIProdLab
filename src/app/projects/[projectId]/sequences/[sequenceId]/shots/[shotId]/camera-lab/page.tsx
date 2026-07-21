import { db } from "@/db";
import { projects, sequences, shots, generationJobs, shotReferenceImages } from "@/db/schema";
import { eq, and, desc, asc, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  extractEligiblePlyOutput,
  buildCameraLabPlyUrl,
  parseIdParam,
  type EligiblePlyOutput,
} from "@/lib/cameraLab/eligibility";
import CameraLabWorkspace from "@/components/cameraLab/CameraLabWorkspace";

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

  const baseUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}/camera-lab`;
  const shotDetailUrl = `/projects/${pid}/sequences/${sid}/shots/${shid}`;

  function selectionUrl(jobId: number | null, refId: number | null): string {
    const qs = new URLSearchParams();
    if (jobId !== null) qs.set("jobId", String(jobId));
    if (refId !== null) qs.set("refId", String(refId));
    const s = qs.toString();
    return s ? `${baseUrl}?${s}` : baseUrl;
  }

  const bothSelected = selectedPly !== null && selectedRef !== null;

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

      <div className="flex flex-col gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-2">
                  Gaussian PLY ({eligiblePlys.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {eligiblePlys.map((ply) => {
                    const active = selectedPly?.jobId === ply.jobId;
                    return (
                      <Link
                        key={ply.jobId}
                        href={selectionUrl(ply.jobId, selectedRef?.id ?? null)}
                        aria-current={active ? "true" : undefined}
                        className={`rounded border px-3 py-2 text-xs transition-colors ${
                          active
                            ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]"
                            : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
                        }`}
                      >
                        <span className="font-mono">Job #{ply.jobId}</span>
                        <span className="text-[#6e767d]"> — {ply.filename}</span>
                        {ply.completedAt && (
                          <span className="block text-[10px] text-[#4b5158]">
                            Completed {ply.completedAt}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
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
                        <Link
                          key={ref.id}
                          href={selectionUrl(selectedPly?.jobId ?? null, ref.id)}
                          aria-current={active ? "true" : undefined}
                          className={`flex items-center gap-3 rounded border px-3 py-2 text-xs transition-colors ${
                            active
                              ? "border-[#5b93d6] text-[#e7e9ec] bg-[#14202e]"
                              : "border-[#2c3035] text-[#a4abb2] hover:border-[#3a4046]"
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
                        </Link>
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
            Select a Gaussian PLY and a source image to open the viewer.
          </p>
        )}
      </div>
    </div>
  );
}
