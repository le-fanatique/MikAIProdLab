import Link from "next/link";
import { db } from "@/db";
import {
  projects,
  sequences,
  shots,
  sequenceStoryboardImages,
  sequenceStoryboardExtractions,
  sequenceStoryboardExtractionRegions,
} from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  startStoryboardExtraction,
  addExtractionRegion,
  resizeExtractionRegion,
  reassignExtractionRegion,
  skipExtractionRegion,
  deleteExtractionRegion,
  confirmStoryboardExtraction,
} from "@/actions/storyboardExtraction";

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

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-8 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">{label}</span>
    </div>
  );
}

export default async function StoryboardExtractPage({ params, searchParams }: Props) {
  const { projectId, sequenceId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const basePath = `/projects/${pid}/sequences/${sid}/storyboard/extract`;
  const storyboardPagePath = `/projects/${pid}/storyboard?sequenceId=${sid}`;
  const returnTo = basePath;

  const extractError = sp(resolvedSearchParams["extractError"]);
  const okFlags = {
    added: sp(resolvedSearchParams["extractRegionAdded"]) === "1",
    resized: sp(resolvedSearchParams["extractRegionResized"]) === "1",
    reassigned: sp(resolvedSearchParams["extractRegionReassigned"]) === "1",
    skipped: sp(resolvedSearchParams["extractRegionSkipped"]) === "1",
    deleted: sp(resolvedSearchParams["extractRegionDeleted"]) === "1",
    confirmed: sp(resolvedSearchParams["extractConfirmed"]) === "1",
  };
  const okMessage = okFlags.confirmed
    ? "Extraction confirmed. Crops were saved as Shot storyboard drafts."
    : okFlags.added
      ? "Region added."
      : okFlags.resized
        ? "Region updated."
        : okFlags.reassigned
          ? "Region reassigned."
          : okFlags.skipped
            ? "Region skipped."
            : okFlags.deleted
              ? "Region deleted."
              : null;

  const extractionIdRaw = sp(resolvedSearchParams["extractionId"]);
  const extractionId = extractionIdRaw ? parseInt(extractionIdRaw, 10) : null;

  const crumbs = [
    { label: "Projects", href: "/projects" },
    { label: project.name, href: `/projects/${pid}` },
    { label: "Storyboard", href: storyboardPagePath },
    { label: "Extract Storyboard Panels" },
  ];

  // ── State A: no extraction chosen yet — explicit source selection ───────
  if (extractionId === null) {
    const sourceDrafts = await db
      .select()
      .from(sequenceStoryboardImages)
      .where(eq(sequenceStoryboardImages.sequenceId, sid))
      .orderBy(desc(sequenceStoryboardImages.createdAt));

    return (
      <div>
        <Breadcrumb crumbs={crumbs} />
        <PageHeader title="Extract Storyboard Panels" meta={`${project.name} · ${sequence.title}`} />

        {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}

        {sourceDrafts.length === 0 ? (
          <EmptyState
            title="No Sequence Storyboard images yet."
            description="Generate a Sequence Storyboard contact sheet first."
            action={
              <Link href={storyboardPagePath} className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors">
                ← Back to Storyboard
              </Link>
            }
          />
        ) : (
          <>
            <p className="text-xs text-[#6e767d] mb-4">
              Choose which Sequence Storyboard image to detect panels from. Nothing is analyzed until you pick one
              explicitly.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sourceDrafts.map((d) => (
                <div key={d.id} className="flex flex-col rounded border border-[#232629] bg-[#141618] overflow-hidden">
                  <div className="relative aspect-video w-full bg-[#0d0e10] shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImageUrl(d.imagePath)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1.5 px-2 py-1.5">
                    <span className="text-[10px] font-mono text-[#4b5158]">
                      {new Date(d.createdAt).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <form action={startStoryboardExtraction}>
                      <input type="hidden" name="sequenceId" value={String(sid)} />
                      <input type="hidden" name="sourceStoryboardImageId" value={String(d.id)} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="mt-0.5 block w-full text-center rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-2 py-1.5 text-[11px] font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors"
                      >
                        Extract from this image
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 pt-4 border-t border-[#232629]">
          <Link href={storyboardPagePath} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
            ← Back to Storyboard
          </Link>
        </div>
      </div>
    );
  }

  // ── State B: an extraction is active — preview + edit + confirm ─────────
  const [extraction] = await db
    .select()
    .from(sequenceStoryboardExtractions)
    .where(eq(sequenceStoryboardExtractions.id, extractionId));
  if (!extraction || extraction.sequenceId !== sid) notFound();

  const regions = await db
    .select()
    .from(sequenceStoryboardExtractionRegions)
    .where(eq(sequenceStoryboardExtractionRegions.extractionId, extractionId))
    .orderBy(asc(sequenceStoryboardExtractionRegions.orderIndex));

  const sequenceShots = await db
    .select({ id: shots.id, shotCode: shots.shotCode, title: shots.title })
    .from(shots)
    .where(eq(shots.sequenceId, sid))
    .orderBy(asc(shots.orderIndex));

  const assignedShotIds = new Set(regions.filter((r) => r.status !== "skipped" && r.targetShotId !== null).map((r) => r.targetShotId!));
  const shotsWithoutRegion = sequenceShots.filter((s) => !assignedShotIds.has(s.id));
  const unassignedRegions = regions.filter((r) => r.status === "pending");
  const isEditable = extraction.status === "ready";
  const assignedCount = regions.filter((r) => r.status === "assigned").length;

  return (
    <div>
      <Breadcrumb crumbs={crumbs} />
      <PageHeader title="Extract Storyboard Panels" meta={`${project.name} · ${sequence.title}`} />

      {extractError && <p className="text-xs text-[#cf7b6b] mb-4">{extractError}</p>}
      {okMessage && <p className="text-xs text-[#6b9e72] mb-4">{okMessage}</p>}

      {extraction.status === "detecting" && (
        <p className="text-xs text-[#cda24f] mb-4">Detecting panels…</p>
      )}

      {extraction.status === "failed" && (
        <p className="text-xs text-[#cf7b6b] mb-4">
          Detection failed: {extraction.errorMessage ?? "Unknown error."}
        </p>
      )}

      {extraction.status === "confirmed" && (
        <p className="text-xs text-[#6b9e72] mb-4">
          This extraction was already confirmed. Extracted crops are visible in the Storyboard grid for their
          assigned Shots.
        </p>
      )}

      {(extraction.status === "ready" || extraction.status === "confirmed") && (
        <>
          <SectionLabel label="Preview" />
          <Card>
            <div className="relative w-full max-w-3xl" style={{ aspectRatio: `${extraction.sourceWidth} / ${extraction.sourceHeight}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={refImageUrl(extraction.sourceImagePath)}
                alt="Storyboard source"
                className="absolute inset-0 w-full h-full object-contain"
              />
              {regions.map((r, i) => {
                const left = (r.x / extraction.sourceWidth) * 100;
                const top = (r.y / extraction.sourceHeight) * 100;
                const width = (r.width / extraction.sourceWidth) * 100;
                const height = (r.height / extraction.sourceHeight) * 100;
                const borderColor =
                  r.status === "extracted"
                    ? "border-[#6b9e72]"
                    : r.status === "skipped"
                      ? "border-[#4b5158]"
                      : r.status === "assigned"
                        ? "border-[#5b93d6]"
                        : "border-[#cda24f]";
                return (
                  <div
                    key={r.id}
                    className={`absolute border-2 ${borderColor} pointer-events-none`}
                    style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                  >
                    <span className="absolute top-0.5 left-0.5 text-[9px] font-mono bg-[#0d0e10]/85 text-[#e7e9ec] rounded px-1 py-px">
                      {i + 1} · {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {(unassignedRegions.length > 0 || shotsWithoutRegion.length > 0) && isEditable && (
        <p className="text-xs text-[#cda24f] mt-3">
          {unassignedRegions.length > 0 &&
            `${unassignedRegions.length} region${unassignedRegions.length !== 1 ? "s are" : " is"} not assigned to a Shot yet. `}
          {shotsWithoutRegion.length > 0 &&
            `${shotsWithoutRegion.length} Shot${shotsWithoutRegion.length !== 1 ? "s have" : " has"} no region assigned (${shotsWithoutRegion
              .map((s) => s.shotCode ?? `#${s.id}`)
              .join(", ")}).`}
        </p>
      )}

      {(extraction.status === "ready" || extraction.status === "confirmed") && (
        <>
          <SectionLabel label={`Regions (${regions.length})`} />
          {regions.length === 0 ? (
            <p className="text-xs text-[#4b5158]">No regions detected. Use “Add Region” below to create one manually.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {regions.map((r, i) => {
                const editable = isEditable && r.status !== "extracted";
                return (
                  <Card key={r.id}>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="text-xs font-mono text-[#6e767d] w-16 shrink-0">
                        #{i + 1}
                        <div className={`mt-1 text-[9px] uppercase tracking-wider ${
                          r.status === "extracted" ? "text-[#6b9e72]" : r.status === "skipped" ? "text-[#4b5158]" : r.status === "assigned" ? "text-[#5b93d6]" : "text-[#cda24f]"
                        }`}>
                          {r.status}
                        </div>
                        <div className="mt-1 text-[9px] text-[#4b5158]">{Math.round(r.confidence * 100)}% conf.</div>
                        {!r.textSeparationDetected && (
                          <div className="mt-1 text-[9px] text-[#4b5158]">Full cell (no caption split)</div>
                        )}
                      </div>

                      {editable ? (
                        <form action={resizeExtractionRegion} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="extractionId" value={String(extractionId)} />
                          <input type="hidden" name="regionId" value={String(r.id)} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          {(["x", "y", "width", "height"] as const).map((field) => (
                            <label key={field} className="flex flex-col gap-0.5">
                              <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">{field}</span>
                              <input
                                type="number"
                                name={field}
                                defaultValue={r[field]}
                                min={field === "x" || field === "y" ? 0 : 1}
                                className="w-20 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                              />
                            </label>
                          ))}
                          <button
                            type="submit"
                            className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                          >
                            Update
                          </button>
                        </form>
                      ) : (
                        <div className="text-xs font-mono text-[#4b5158]">
                          x={r.x} y={r.y} w={r.width} h={r.height}
                        </div>
                      )}

                      <div className="flex items-end gap-2">
                        {editable ? (
                          <form action={reassignExtractionRegion} className="flex items-end gap-2">
                            <input type="hidden" name="extractionId" value={String(extractionId)} />
                            <input type="hidden" name="regionId" value={String(r.id)} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Shot</span>
                              <select
                                name="targetShotId"
                                defaultValue={r.targetShotId ?? ""}
                                className="w-40 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                              >
                                <option value="">— Unassigned —</option>
                                {sequenceShots.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.shotCode ?? s.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-[11px] hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                            >
                              Assign
                            </button>
                          </form>
                        ) : (
                          <div className="text-xs text-[#4b5158]">
                            {sequenceShots.find((s) => s.id === r.targetShotId)?.shotCode ?? "—"}
                          </div>
                        )}
                      </div>

                      {editable && (
                        <div className="flex items-end gap-2 ml-auto">
                          {r.status !== "skipped" && (
                            <form action={skipExtractionRegion}>
                              <input type="hidden" name="extractionId" value={String(extractionId)} />
                              <input type="hidden" name="regionId" value={String(r.id)} />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <button type="submit" className="text-[10px] text-[#cda24f] hover:text-[#e0b968] transition-colors">
                                Skip
                              </button>
                            </form>
                          )}
                          <form action={deleteExtractionRegion}>
                            <input type="hidden" name="extractionId" value={String(extractionId)} />
                            <input type="hidden" name="regionId" value={String(r.id)} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button type="submit" className="text-[10px] text-[#cf7b6b] hover:text-[#e0958a] transition-colors">
                              Delete
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {isEditable && (
            <div className="mt-3">
              <form action={addExtractionRegion}>
                <input type="hidden" name="extractionId" value={String(extractionId)} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
                >
                  + Add Region
                </button>
              </form>
            </div>
          )}

          {isEditable && (
            <>
              <SectionLabel label="Confirm & Extract" />
              <Card>
                <p className="text-xs text-[#6e767d] mb-3">
                  {assignedCount === 0
                    ? "No regions are assigned to a Shot yet — assign at least one before extracting."
                    : `${assignedCount} region${assignedCount !== 1 ? "s" : ""} will be cropped and saved as draft storyboard images on their assigned Shots. Skipped and unassigned regions are left untouched.`}
                </p>
                <form action={confirmStoryboardExtraction} className="flex items-end gap-3">
                  <input type="hidden" name="extractionId" value={String(extractionId)} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-wider text-[#4b5158]">Padding (px, inward)</span>
                    <input
                      type="number"
                      name="padding"
                      defaultValue={0}
                      min={0}
                      className="w-28 rounded border border-[#2c3035] bg-[#0d0e10] text-[#e7e9ec] text-xs px-2 py-1"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={assignedCount === 0}
                    className="rounded border border-[#5b93d6]/50 bg-[#5b93d6]/10 text-[#5b93d6] px-3 py-1.5 text-sm font-medium hover:border-[#5b93d6] hover:bg-[#5b93d6]/20 hover:text-[#8fbbe8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm & Extract
                  </button>
                </form>
              </Card>
            </>
          )}
        </>
      )}

      <div className="mt-10 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link href={basePath} className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors">
          ← Choose a different source
        </Link>
        <Link href={storyboardPagePath} className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors">
          ↑ Back to Storyboard
        </Link>
      </div>
    </div>
  );
}
