import { db } from "@/db";
import { projects, assets, shotAssets, shots, sequences, sequenceAssets, assetReferenceImages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import DeleteButton from "@/components/DeleteButton";
import ReferenceImagesPanel from "@/components/ReferenceImagesPanel";
import { deleteAsset } from "@/actions/assets";
import { deleteAssetReferenceImage } from "@/actions/assetReferenceImages";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

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

  const deleteAction = deleteAsset.bind(null, aid, pid);

  return (
    <div>
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
        actions={
          <>
            <Link
              href={`/projects/${pid}/assets/${aid}/workflows`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Generate Image
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

      {/* ── Overview ──────────────────────────────────────── */}
      <SectionLabel label="Overview" />
      {asset.description || asset.notes ? (
        <Card title="Details">
          <div className="flex flex-col gap-4">
            {asset.description && (
              <Field label="Description" value={asset.description} />
            )}
            {asset.notes && (
              <Field label="Notes" value={asset.notes} />
            )}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-[#6e767d]">
          No details recorded yet.{" "}
          <Link
            href={`/projects/${pid}/assets/${aid}/edit`}
            className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Edit this asset
          </Link>{" "}
          to add them.
        </p>
      )}

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
        />
      </Card>

      {/* ── Generation ────────────────────────────────────── */}
      <SectionLabel label="Generation" />
      <Link
        href={`/projects/${pid}/assets/${aid}/workflows`}
        className="flex items-center justify-between rounded-lg border border-[#232629] bg-[#141618] px-5 py-4 hover:border-[#2c3035] hover:bg-[#1a1d20] transition-colors group"
      >
        <div>
          <p className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors">
            Generate Image
          </p>
          <p className="text-xs text-[#4b5158] mt-0.5">
            Select a workflow to generate and attach a new reference image.
          </p>
        </div>
        <span className="text-[#3a4046] text-sm group-hover:text-[#6e767d] transition-colors shrink-0">
          →
        </span>
      </Link>

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
        <p className="text-sm text-[#6e767d]">
          Not yet assigned to any sequence or shot.
        </p>
      )}

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}/assets`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Assets
        </Link>
      </div>
    </div>
  );
}
