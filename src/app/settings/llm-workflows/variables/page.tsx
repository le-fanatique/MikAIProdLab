import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, projects, sequences, shots } from "@/db/schema";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { firstBenchParam, parseSelectionFromSearchParams, type BenchSearchParams } from "@/lib/llmWorkspace/bench";
import type { AnchorIds } from "@/lib/llmWorkspace/runner";
import { resolveVariableLibraryRows } from "@/lib/llmWorkspace/variableLibrary";
import type { EntityKind } from "@/lib/llmWorkspace/types";

// LLMW.VARLIB.1 (B6c2) — the variable library
// (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §5.2): the registry filtered by
// anchor type, showing every declared variable's value resolved against the
// current test entity, next to its token cost. Read-only, strictly — no
// write, no LLM call, no cost. Assembles what already exists: the resolved
// Context pane and cost line the bench (`[templateId]/page.tsx`) already
// renders per-descriptor, `VARIABLE_REGISTRY` as the one authority on which
// variables exist, and the same entity-cascade selector the bench uses,
// widened here to all four levels at once since this page is not anchored to
// one operation's `anchor.entity`.

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<BenchSearchParams>;
};

const ANCHOR_FILTERS: Array<{ value: EntityKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "project", label: "Project" },
  { value: "sequence", label: "Sequence" },
  { value: "shot", label: "Shot" },
  { value: "asset", label: "Asset" },
];

function isEntityKind(value: string | undefined): value is EntityKind {
  return value === "project" || value === "sequence" || value === "shot" || value === "asset";
}

export default async function VariableLibraryPage({ searchParams }: Props) {
  const search = await searchParams;
  const rawSelection = parseSelectionFromSearchParams(search);

  const anchorFilterParam = firstBenchParam(search.anchor);
  const anchorFilter: EntityKind | "all" = isEntityKind(anchorFilterParam) ? anchorFilterParam : "all";

  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name));

  const sequenceRows =
    rawSelection.projectId != null
      ? await db
          .select({ id: sequences.id, title: sequences.title })
          .from(sequences)
          .where(eq(sequences.projectId, rawSelection.projectId))
          .orderBy(asc(sequences.orderIndex))
      : [];

  // Same stale-selection guard as the bench (`[templateId]/page.tsx`, R1
  // retake note): a raw `sequenceId` that does not belong to the currently
  // selected project must not drive the Shot query, or the Shot `<select>`
  // would keep listing a previous project's shots.
  const validSequenceId = sequenceRows.some((s) => s.id === rawSelection.sequenceId)
    ? rawSelection.sequenceId
    : undefined;

  const shotRows =
    validSequenceId != null
      ? await db
          .select({ id: shots.id, title: shots.title })
          .from(shots)
          .where(eq(shots.sequenceId, validSequenceId))
          .orderBy(asc(shots.orderIndex))
      : [];

  const validShotId = shotRows.some((s) => s.id === rawSelection.shotId) ? rawSelection.shotId : undefined;

  const assetRows =
    rawSelection.projectId != null
      ? await db
          .select({ id: assets.id, name: assets.name })
          .from(assets)
          .where(eq(assets.projectId, rawSelection.projectId))
          .orderBy(asc(assets.orderIndex))
      : [];

  const validAssetId = assetRows.some((a) => a.id === rawSelection.assetId) ? rawSelection.assetId : undefined;

  const selection: AnchorIds = {
    projectId: rawSelection.projectId,
    sequenceId: validSequenceId,
    shotId: validShotId,
    assetId: validAssetId,
  };

  const rows = await resolveVariableLibraryRows(selection);
  const visibleRows = anchorFilter === "all" ? rows : rows.filter((row) => row.anchor === anchorFilter);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "LLM Workflows", href: "/settings/llm-workflows" },
          { label: "Variable Library" },
        ]}
      />
      <PageHeader
        title="Variable Library"
        meta="Read-only — resolves every registered variable against a test entity. No write, no LLM call."
      />

      <Card title="Test Entity" className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Project</label>
            <AutoSubmitSelect
              name="projectId"
              defaultValue={selection.projectId != null ? String(selection.projectId) : ""}
              placeholder="Select a project…"
              options={projectRows.map((p) => ({ value: String(p.id), label: p.name }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Sequence</label>
            <AutoSubmitSelect
              name="sequenceId"
              defaultValue={selection.sequenceId != null ? String(selection.sequenceId) : ""}
              placeholder="Select a sequence…"
              options={sequenceRows.map((s) => ({ value: String(s.id), label: s.title }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Shot</label>
            <AutoSubmitSelect
              name="shotId"
              defaultValue={selection.shotId != null ? String(selection.shotId) : ""}
              placeholder="Select a shot…"
              options={shotRows.map((s) => ({ value: String(s.id), label: s.title }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Asset</label>
            <AutoSubmitSelect
              name="assetId"
              defaultValue={selection.assetId != null ? String(selection.assetId) : ""}
              placeholder="Select an asset…"
              options={assetRows.map((a) => ({ value: String(a.id), label: a.name }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Anchor</label>
            <AutoSubmitSelect
              name="anchor"
              defaultValue={anchorFilter}
              options={ANCHOR_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Apply
          </button>
        </form>
      </Card>

      <Card title={`Registered Variables (${visibleRows.length} of ${rows.length})`}>
        <div className="flex flex-col divide-y divide-[#232629]">
          {visibleRows.map((row) => (
            <div key={row.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-[#a4abb2]">{row.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#6e767d]/30 text-[#a4abb2] bg-[#141618] uppercase tracking-wide">
                    {row.anchor}
                  </span>
                </div>
                {row.status === "resolved" && (
                  <span className="text-[10px] text-[#4b5158]">
                    {row.charCount} chars — ~{row.tokenEstimate} tokens (est.)
                  </span>
                )}
              </div>

              {row.status === "unresolved" && (
                <p className="text-xs text-[#6e767d] mt-1">
                  Not resolvable — select a {row.anchor} to preview this variable.
                </p>
              )}

              {row.status === "error" && (
                <p className="text-xs text-[#cf7b6b] mt-1 font-mono">{row.message}</p>
              )}

              {row.status === "resolved" && (
                <details className="mt-1">
                  <summary className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors cursor-pointer select-none">
                    Show resolved value
                  </summary>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed mt-2">
                    {row.text}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
