import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, assets } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import SequenceResultActionForm from "@/components/SequenceResultActionForm";
import CreateFilmResultDraftButton from "@/components/CreateFilmResultDraftButton";
import { deleteProject } from "@/actions/projects";
import { listFilmResults, setActiveFilmResult, archiveFilmResult } from "@/actions/filmResults";
import { refImageUrl } from "@/lib/refImageUrl";
import {
  parseFilmResultManifest,
  parseFilmResultWarnings,
  filmManifestSourceModeLabel,
} from "@/types/filmResult";

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

type Props = { params: Promise<{ projectId: string }> };

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.projectId, id))
    .orderBy(asc(sequences.orderIndex));

  const seqIds = seqs.map((s) => s.id);
  let totalShots = 0;
  if (seqIds.length > 0) {
    const shotRows = await db
      .select({ id: shots.id })
      .from(shots)
      .where(inArray(shots.sequenceId, seqIds));
    totalShots = shotRows.length;
  }

  const assetRows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.projectId, id));
  const totalAssets = assetRows.length;

  const deleteAction = deleteProject.bind(null, id);

  const filmResultsList = await listFilmResults(id);
  // Same display convention as the Sequence Result viewer (EDITORIAL.INSERT.1):
  // show the active one, else fall back to the most recent outdated one
  // rather than dropping to the empty state — the old result is still
  // playable/inspectable, just clearly flagged stale.
  const activeFilmResult =
    filmResultsList.find((r) => r.status === "active") ??
    filmResultsList.find((r) => r.status === "outdated") ??
    null;
  const previousFilmResults = filmResultsList.filter((r) => r.id !== activeFilmResult?.id);
  const activeFilmResultManifest = activeFilmResult ? parseFilmResultManifest(activeFilmResult.sequenceResultManifest) : null;
  const activeFilmResultWarnings = activeFilmResult ? parseFilmResultWarnings(activeFilmResult.warnings) : [];

  return (
    <div>
      <Breadcrumb
        crumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
      />

      <PageHeader
        title={project.name}
        badge={<StatusBadge status={project.status} />}
        meta={`${seqs.length} sequence${seqs.length !== 1 ? "s" : ""} · ${totalShots} shot${totalShots !== 1 ? "s" : ""} · ${totalAssets} asset${totalAssets !== 1 ? "s" : ""}`}
        actions={
          <>
            <Link
              href={`/projects/${id}/story`}
              className="rounded border border-[#2c3035] text-[#6e767d] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
            >
              Story Workspace
            </Link>
            <Link
              href={`/projects/${id}/assets`}
              className="rounded border border-[#2c3035] text-[#6e767d] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#a4abb2] transition-colors"
            >
              Assets
            </Link>
            <Link
              href={`/projects/${id}/edit`}
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Edit
            </Link>
            <DeleteButton
              action={deleteAction}
              confirm="Delete this project and all its sequences/shots?"
              className="rounded border border-[#cf7b6b]/30 text-[#cf7b6b] px-3 py-1.5 text-sm hover:border-[#cf7b6b]/60 hover:text-[#e0a194] transition-colors"
            />
          </>
        }
      />

      {/* ── Film Result ───────────────────────────────────── */}
      <SectionLabel
        label="Film Result"
        action={<CreateFilmResultDraftButton projectId={id} />}
      />

      <Card className="mb-6">
        {activeFilmResult ? (
          <div className="flex flex-col gap-3">
            {activeFilmResult.videoPath ? (
              <video
                src={refImageUrl(activeFilmResult.videoPath)}
                controls
                className="w-full rounded border border-[#2c3035]"
              />
            ) : (
              <p className="text-xs text-[#4b5158]">This Film Result has no rendered video yet.</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="text-[#4b5158]">Status</span>
                <StatusBadge status={activeFilmResult.status} />
              </span>
              {activeFilmResult.durationSeconds != null && (
                <span>
                  <span className="text-[#4b5158]">Duration </span>
                  <span className="text-[#a4abb2]">{activeFilmResult.durationSeconds.toFixed(1)}s</span>
                </span>
              )}
              {activeFilmResult.publishedAt && (
                <span>
                  <span className="text-[#4b5158]">Published </span>
                  <span className="text-[#a4abb2]">{new Date(activeFilmResult.publishedAt).toLocaleString()}</span>
                </span>
              )}
            </div>
            {activeFilmResult.status === "outdated" && (
              <p className="text-xs text-[#cda24f]">
                This result is outdated because a sequence result changed after it was published.
                Create a new Film Result Draft to update it.
              </p>
            )}
            {activeFilmResult.notes && (
              <p className="text-xs text-[#6e767d]">{activeFilmResult.notes}</p>
            )}
            {activeFilmResultWarnings.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-[#cda24f]">
                {activeFilmResultWarnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}

            {activeFilmResultManifest && (
              <div className="border-t border-[#232629] pt-3 mt-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158] mb-2">
                  Sequences included
                </p>
                <div className="flex flex-col gap-1.5">
                  {activeFilmResultManifest.sequences.map((s) => (
                    <div key={s.sequenceId} className="flex items-center gap-3 text-xs">
                      <span className="text-[#a4abb2] flex-1 truncate">{s.sequenceTitle ?? `Sequence ${s.sequenceId}`}</span>
                      <span className="text-[#4b5158] w-16 shrink-0">{filmManifestSourceModeLabel(s.sequenceResultSourceMode)}</span>
                      <span className="text-[#4b5158] w-16 shrink-0 text-right font-mono">
                        {s.durationSeconds != null ? `${s.durationSeconds.toFixed(1)}s` : "—"}
                      </span>
                      <span className={`w-32 shrink-0 text-right ${s.included ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
                        {s.included
                          ? "Included"
                          : s.missingReason?.toLowerCase().includes("outdated")
                            ? "Outdated Result"
                            : "Missing Result"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="No film result created yet."
            description="Publish active sequence results first, then create a Film Result."
          />
        )}
      </Card>

      {previousFilmResults.length > 0 && (
        <>
          <SectionLabel label="Previous Film Results" />
          <div className="rounded-lg border border-[#232629] overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#232629] bg-[#141618]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] w-20">
                    Dur.
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
                    Created
                  </th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {previousFilmResults.map((r) => {
                  const setActiveAction = async () => {
                    "use server";
                    await setActiveFilmResult(id, r.id);
                  };
                  const archiveAction = async () => {
                    "use server";
                    await archiveFilmResult(id, r.id);
                  };
                  return (
                    <tr key={r.id} className="border-b border-[#1a1d20] last:border-0 hover:bg-[#1a1d20] transition-colors">
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-[#6e767d] font-mono text-xs">
                        {r.durationSeconds != null ? `${r.durationSeconds.toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#6e767d] text-xs">
                        {new Date(r.createdAt).toLocaleString()}
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
                              confirmMessage="Archive this film result?"
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
        </>
      )}

      {/* ── Overview ──────────────────────────────────────── */}
      {(project.pitch || project.story) && (
        <>
          <SectionLabel label="Overview" />
          {project.pitch && (
            <p className="text-[#a4abb2] text-sm mb-4 leading-relaxed">{project.pitch}</p>
          )}
          {project.story && (
            <div className="border-l-2 border-[#232629] pl-4 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158] mb-2">
                Story
              </p>
              <p className="text-sm text-[#6e767d] whitespace-pre-wrap leading-relaxed line-clamp-3">
                {project.story}
              </p>
              <Link
                href={`/projects/${id}/story`}
                className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors mt-2 inline-block"
              >
                View full story →
              </Link>
            </div>
          )}
        </>
      )}

      {/* ── Sequences ─────────────────────────────────────── */}
      <SectionLabel
        label="Sequences"
        action={
          <Link
            href={`/projects/${id}/sequences/new`}
            className="rounded bg-[#212529] text-[#a4abb2] px-3 py-1.5 text-sm hover:bg-[#2c3035] hover:text-[#e7e9ec] transition-colors"
          >
            + New Sequence
          </Link>
        }
      />

      {seqs.length === 0 ? (
        <EmptyState
          title="No sequences yet."
          action={
            <Link
              href={`/projects/${id}/sequences/new`}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Add the first sequence →
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {seqs.map((seq, i) => (
            <Link
              key={seq.id}
              href={`/projects/${id}/sequences/${seq.id}`}
              className="flex items-center gap-4 rounded-lg border border-[#232629] bg-[#1a1d20] px-5 py-3.5 hover:border-[#2c3035] hover:bg-[#212529] transition-colors group"
            >
              <span className="text-[#4b5158] text-sm font-mono w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[#e7e9ec] group-hover:text-white transition-colors">
                  {seq.title}
                </span>
                {seq.summary && (
                  <p className="text-xs text-[#6e767d] truncate mt-0.5">{seq.summary}</p>
                )}
                {(seq.mood || seq.locationHint) && (
                  <div className="flex gap-3 mt-1">
                    {seq.mood && (
                      <span className="text-[10px] text-[#4b5158]">
                        <span className="text-[#3a4046]">Mood </span>
                        {seq.mood}
                      </span>
                    )}
                    {seq.locationHint && (
                      <span className="text-[10px] text-[#4b5158]">
                        <span className="text-[#3a4046]">Location </span>
                        {seq.locationHint}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[#3a4046] text-sm shrink-0 group-hover:text-[#6e767d] transition-colors">
                →
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Assets ────────────────────────────────────────── */}
      <SectionLabel label="Assets" />
      <div className="flex items-center justify-between rounded-lg border border-[#232629] bg-[#141618] px-5 py-4">
        <div>
          <p className="text-sm text-[#a4abb2]">
            {totalAssets === 0
              ? "No assets yet."
              : `${totalAssets} asset${totalAssets !== 1 ? "s" : ""}`}
          </p>
          {totalAssets === 0 && (
            <p className="text-xs text-[#4b5158] mt-0.5">
              Characters, locations, and props for this project.
            </p>
          )}
        </div>
        <Link
          href={`/projects/${id}/assets`}
          className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors shrink-0"
        >
          {totalAssets === 0 ? "Add Assets →" : "View Assets →"}
        </Link>
      </div>

      {/* ── Production ────────────────────────────────────── */}
      <SectionLabel label="Production" />
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${id}/story`}
          className="flex items-center justify-between rounded-lg border border-[#232629] bg-[#141618] px-5 py-3 hover:border-[#2c3035] hover:bg-[#1a1d20] transition-colors group"
        >
          <span className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors">
            Story Workspace
          </span>
          <span className="text-[#3a4046] text-sm group-hover:text-[#6e767d] transition-colors">
            →
          </span>
        </Link>
        <Link
          href={`/projects/${id}/outline`}
          className="flex items-center justify-between rounded-lg border border-[#232629] bg-[#141618] px-5 py-3 hover:border-[#2c3035] hover:bg-[#1a1d20] transition-colors group"
        >
          <span className="text-sm text-[#a4abb2] group-hover:text-[#e7e9ec] transition-colors">
            Outline
          </span>
          <span className="text-[#3a4046] text-sm group-hover:text-[#6e767d] transition-colors">
            →
          </span>
        </Link>
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href="/projects"
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← All Projects
        </Link>
      </div>
    </div>
  );
}
