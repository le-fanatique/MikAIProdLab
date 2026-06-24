import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import AssetTypeBadge from "@/components/AssetTypeBadge";
import AssetsLLMExtractPanel from "@/components/AssetsLLMExtractPanel";
import { deleteAsset } from "@/actions/assets";
import { getLLMSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export default async function AssetsPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const assetList = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, pid))
    .orderBy(asc(assets.orderIndex));

  const llmSettings = await getLLMSettings();

  const rawCreatedCount = resolvedSearchParams["assetsCreated"];
  const createdCountStr =
    typeof rawCreatedCount === "string"
      ? rawCreatedCount
      : Array.isArray(rawCreatedCount)
      ? rawCreatedCount[0]
      : undefined;
  const createdCount = createdCountStr ? parseInt(createdCountStr, 10) : null;

  const rawCreateError = resolvedSearchParams["assetsCreateError"];
  const createError =
    typeof rawCreateError === "string"
      ? rawCreateError
      : Array.isArray(rawCreateError)
      ? rawCreateError[0]
      : null;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets" },
        ]}
      />

      <PageHeader
        title="Assets"
        actions={
          <Link
            href={`/projects/${pid}/assets/new`}
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            + Add Asset
          </Link>
        }
      />

      {assetList.length === 0 ? (
        <EmptyState
          title="No assets yet."
          description="Start building your project universe."
          action={
            <Link
              href={`/projects/${pid}/assets/new`}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Add the first asset →
            </Link>
          }
        />
      ) : (
        <>
          {(() => {
            const counts: Record<string, number> = {};
            for (const a of assetList) counts[a.type] = (counts[a.type] ?? 0) + 1;
            const LABELS: Record<string, [string, string]> = {
              character: ["character", "characters"],
              environment: ["environment", "environments"],
              prop: ["prop", "props"],
              vehicle: ["vehicle", "vehicles"],
              crowd: ["crowd", "crowd"],
              other: ["other", "other"],
            };
            const parts = (
              ["character", "environment", "prop", "vehicle", "crowd", "other"] as const
            )
              .filter((t) => counts[t])
              .map(
                (t) =>
                  `${counts[t]} ${counts[t] === 1 ? LABELS[t][0] : LABELS[t][1]}`
              );
            return (
              <p className="text-xs text-[#6e767d] mb-3">{parts.join(" · ")}</p>
            );
          })()}
          <div className="rounded-lg border border-[#232629] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#232629] bg-[#141618]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] w-32">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] hidden md:table-cell">
                    Description
                  </th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {assetList.map((asset) => {
                  const deleteAction = deleteAsset.bind(null, asset.id, pid);
                  return (
                    <tr
                      key={asset.id}
                      className="border-b border-[#1a1d20] last:border-0 hover:bg-[#1a1d20] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${pid}/assets/${asset.id}`}
                          className="font-medium text-[#e7e9ec] hover:text-white transition-colors"
                        >
                          {asset.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <AssetTypeBadge type={asset.type} />
                      </td>
                      <td className="px-4 py-3 text-[#6e767d] hidden md:table-cell max-w-xs">
                        {asset.description ? (
                          <span className="line-clamp-1 text-xs">
                            {asset.description}
                          </span>
                        ) : (
                          <span className="text-[#3a4046]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/projects/${pid}/assets/${asset.id}/edit`}
                            className="text-[#6e767d] hover:text-[#a4abb2] transition-colors text-xs"
                          >
                            Edit
                          </Link>
                          <DeleteButton
                            action={deleteAction}
                            confirm={`Delete "${asset.name}"?`}
                            label="Del"
                            className="text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors text-xs"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── LLM Assist ───────────────────────────────────────────────── */}
      <SectionLabel label="LLM Assist" />
      <Card title="Extract Asset Drafts" className="mb-6">
        <AssetsLLMExtractPanel
          projectId={pid}
          existingAssetNames={assetList.map((a) => a.name)}
          createdCount={Number.isFinite(createdCount) ? createdCount : null}
          createError={createError ?? null}
          isConfigured={llmSettings.isConfigured}
        />
      </Card>

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {project.name}
        </Link>
      </div>
    </div>
  );
}
