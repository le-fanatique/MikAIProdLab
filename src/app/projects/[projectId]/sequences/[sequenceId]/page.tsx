import type { ReactNode } from "react";
import { db } from "@/db";
import { projects, sequences, shots, assets, sequenceAssets } from "@/db/schema";
import { eq, and, notInArray, asc } from "drizzle-orm";
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
import { getLLMSettings } from "@/lib/settings";

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
        meta={
          totalDuration > 0
            ? `${shotList.length} shot${shotList.length !== 1 ? "s" : ""} · ${totalDuration.toFixed(1)}s`
            : `${shotList.length} shot${shotList.length !== 1 ? "s" : ""}`
        }
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

      {/* ── Context ───────────────────────────────────────────────── */}
      {hasContext && (
        <>
          <SectionLabel label="Context" />
          <Card className="mb-6">
            <div className="flex flex-col gap-3">
              {sequence.summary && (
                <p className="text-sm text-[#a4abb2] leading-relaxed">{sequence.summary}</p>
              )}
              {(sequence.narrativePurpose || sequence.mood || sequence.locationHint) && (
                <div className="flex flex-wrap gap-4 text-xs">
                  {sequence.narrativePurpose && (
                    <span>
                      <span className="text-[#4b5158]">Purpose </span>
                      <span className="text-[#6e767d]">{sequence.narrativePurpose}</span>
                    </span>
                  )}
                  {sequence.mood && (
                    <span>
                      <span className="text-[#4b5158]">Mood </span>
                      <span className="text-[#6e767d]">{sequence.mood}</span>
                    </span>
                  )}
                  {sequence.locationHint && (
                    <span>
                      <span className="text-[#4b5158]">Location </span>
                      <span className="text-[#6e767d]">{sequence.locationHint}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        </>
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
                  <tr
                    key={shot.id}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────── */}
      {shotList.length > 0 && (
        <>
          <SectionLabel label="Timeline" />
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

      {/* ── Production ────────────────────────────────────────────── */}
      <SectionLabel label="Production" />

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

      <Card title="Casting Suggestions" className="mb-6">
        <CastingSuggestionsPanel
          projectId={pid}
          sequenceId={sid}
          castingsApplied={Number.isFinite(castingsApplied) ? castingsApplied : null}
          castingsError={castingsError ?? null}
          isConfigured={llmSettings.isConfigured}
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
