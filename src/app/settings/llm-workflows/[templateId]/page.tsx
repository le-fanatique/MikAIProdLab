import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, llmTemplates, projects, sequences, shots } from "@/db/schema";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import { requiredAnchorIdKeys, resolveOperationPreview } from "@/lib/llmWorkspace/runner";
import { estimateTokens } from "@/lib/llmWorkspace/tokenEstimate";
import {
  buildVariablePreviewRows,
  firstBenchParam,
  normalizeBenchSelection,
  parseIntentInputFromSearchParams,
  parseSelectionFromSearchParams,
  parseTemplateRef,
  type BenchSearchParams,
} from "@/lib/llmWorkspace/bench";
import type { Block, OperationDescriptor } from "@/lib/llmWorkspace/types";

// LLMW.BENCH.READ.1 (B6b) — the three-pane bench in read-only form
// (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §5.1, §5.3): left = the template's
// own descriptor, centre = the resolved context and the effective prompt,
// right = nothing yet (Run, the proposal panel and the variable library are
// B6c). This route answers `FB-20260716-035` — the effective prompt stops
// being a black box — without ever calling the model.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<BenchSearchParams>;
};

function describeBlock(block: Block): string {
  if ("text" in block) return `text: "${block.text}"`;
  if ("variable" in block) return `variable: ${block.variable} :: ${block.render}`;
  if ("variables" in block) return `variables: [${block.variables.join(", ")}] :: ${block.render}`;
  if ("parameter" in block) return `parameter: ${block.parameter} :: ${block.render}`;
  return `mode :: ${block.render}`;
}

export default async function LlmWorkflowBenchPage({ params, searchParams }: Props) {
  const { templateId } = await params;
  const search = await searchParams;

  const ref = parseTemplateRef(templateId);

  let descriptor: OperationDescriptor;
  let sourceLabel: string;

  if (ref.kind === "builtin") {
    const found = (DESCRIPTORS as Record<string, OperationDescriptor>)[ref.id];
    if (!found) notFound();
    descriptor = found;
    sourceLabel = "Built-in";
  } else {
    const [row] = await db.select().from(llmTemplates).where(eq(llmTemplates.id, ref.id));
    if (!row) notFound();

    const validated = validateLlmTemplateJson(row.templateJson);
    if (!validated.ok) {
      return (
        <div>
          <Breadcrumb
            crumbs={[
              { label: "Settings", href: "/settings" },
              { label: "LLM Workflows", href: "/settings/llm-workflows" },
              { label: row.name },
            ]}
          />
          <PageHeader title={row.name} meta={`Stored template #${row.id}`} />
          <Card title="Invalid Template">
            <p className="text-sm text-[#cf7b6b]">
              This template&apos;s stored JSON is not a valid operation descriptor and cannot be opened
              in the bench.
            </p>
            <p className="text-xs text-[#a4abb2] mt-2 font-mono">{validated.reason}</p>
          </Card>
        </div>
      );
    }

    descriptor = validated.descriptor;
    sourceLabel = "Stored";
  }

  const anchorEntity = descriptor.anchor.entity;
  const requiredKeys = requiredAnchorIdKeys(anchorEntity);
  const needsSequence = requiredKeys.includes("sequenceId");
  const needsShot = requiredKeys.includes("shotId");
  const needsAsset = requiredKeys.includes("assetId");

  const rawSelection = parseSelectionFromSearchParams(search);

  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name));

  const sequenceRows =
    needsSequence && rawSelection.projectId != null
      ? await db
          .select({ id: sequences.id, title: sequences.title })
          .from(sequences)
          .where(eq(sequences.projectId, rawSelection.projectId))
          .orderBy(asc(sequences.orderIndex))
      : [];

  // R1 retake (supervisor review): a raw `sequenceId` that does not belong to
  // the selected project must not drive this query — otherwise, on a project
  // switch, the Shot `<select>` keeps showing the previous project's shots
  // while the Sequence `<select>` has already gone back to empty (a state
  // that does not exist). `normalizeBenchSelection` already drops the shot in
  // that case for *resolution*; this list is the display-side counterpart,
  // checked against `sequenceRows` (the sequences that actually belong to the
  // selected project) before it is even queried.
  const validSequenceId = sequenceRows.some((s) => s.id === rawSelection.sequenceId)
    ? rawSelection.sequenceId
    : undefined;

  const shotRows =
    needsShot && validSequenceId != null
      ? await db
          .select({ id: shots.id, title: shots.title })
          .from(shots)
          .where(eq(shots.sequenceId, validSequenceId))
          .orderBy(asc(shots.orderIndex))
      : [];

  const assetRows =
    needsAsset && rawSelection.projectId != null
      ? await db
          .select({ id: assets.id, name: assets.name })
          .from(assets)
          .where(eq(assets.projectId, rawSelection.projectId))
          .orderBy(asc(assets.orderIndex))
      : [];

  const { selection, complete } = normalizeBenchSelection({
    anchorEntity,
    selection: rawSelection,
    sequenceIds: sequenceRows.map((r) => r.id),
    shotIds: shotRows.map((r) => r.id),
    assetIds: assetRows.map((r) => r.id),
  });

  const intentInput = complete ? parseIntentInputFromSearchParams(descriptor, search) : {};
  const preview = complete ? await resolveOperationPreview(descriptor, selection, intentInput) : null;

  const isBatch = descriptor.anchor.kind === "entitySet";

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "LLM Workflows", href: "/settings/llm-workflows" },
          { label: descriptor.name },
        ]}
      />
      <PageHeader
        title={descriptor.name}
        meta={descriptor.id}
        badge={
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide ${
              sourceLabel === "Built-in"
                ? "border-[#5b93d6]/30 text-[#5b93d6] bg-[#1a2535]"
                : "border-[#6b9e72]/30 text-[#6b9e72] bg-[#1a2e1e]"
            }`}
          >
            {sourceLabel}
          </span>
        }
      />

      <Card title="Test Entity" className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Project</label>
            <select
              name="projectId"
              defaultValue={selection.projectId != null ? String(selection.projectId) : ""}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            >
              <option value="">Select a project…</option>
              {projectRows.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {needsSequence && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Sequence</label>
              <select
                name="sequenceId"
                defaultValue={selection.sequenceId != null ? String(selection.sequenceId) : ""}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                <option value="">Select a sequence…</option>
                {sequenceRows.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsShot && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Shot</label>
              <select
                name="shotId"
                defaultValue={selection.shotId != null ? String(selection.shotId) : ""}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                <option value="">Select a shot…</option>
                {shotRows.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsAsset && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Asset</label>
              <select
                name="assetId"
                defaultValue={selection.assetId != null ? String(selection.assetId) : ""}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                <option value="">Select an asset…</option>
                {assetRows.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {descriptor.intent.mode && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Mode</label>
              <select
                name="mode"
                // R2 retake (supervisor review): read straight from `search`,
                // not from `intentInput` — `intentInput` is `{}` whenever the
                // entity selection is incomplete (resolution never starts on
                // an incomplete selection), which would otherwise reset this
                // control to `defaultMode` on every Apply that doesn't yet
                // resolve, exactly while the user is still working down the
                // project → sequence → shot cascade and setting their
                // controls. `intent.parameters` inputs below already read
                // `search` directly for the same reason.
                defaultValue={firstBenchParam(search.mode) ?? descriptor.intent.mode.defaultMode}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              >
                {descriptor.intent.mode.modes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {descriptor.intent.parameters?.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">{p.label}</label>
              <input
                type={p.type === "integer" ? "number" : "text"}
                name={p.id}
                min={p.min}
                max={p.max}
                defaultValue={firstBenchParam(search[p.id]) ?? ""}
                placeholder={p.default != null ? String(p.default) : undefined}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 w-32 focus:outline-none focus:border-[#3a4046]"
              />
            </div>
          ))}

          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Apply
          </button>
        </form>

        {isBatch && (
          <p className="text-xs text-[#b89a5a] mt-3">
            This operation runs per item of a batch; the preview resolves one item.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Template">
          <div className="flex flex-col gap-4 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Anchor</p>
              <p className="text-[#a4abb2] font-mono">
                {descriptor.anchor.kind} :: {descriptor.anchor.entity}
                {descriptor.anchor.kind === "entitySet" && ` (max ${descriptor.anchor.maxSize})`}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Context variables</p>
              <ul className="flex flex-col gap-1">
                {descriptor.context.variables.map((v) => (
                  <li key={v.id} className="font-mono text-[#a4abb2]">
                    {v.id} <span className="text-[#6e767d]">({v.userAdjustable ? "user-adjustable" : "fixed"})</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Role</p>
              <p className="text-[#a4abb2]">{descriptor.expertise.role}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">System message blocks</p>
              <ul className="flex flex-col gap-1">
                {descriptor.expertise.system.blocks.map((b, i) => (
                  <li key={i} className="font-mono text-[#a4abb2]">
                    {describeBlock(b)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Knowledge</p>
              {descriptor.expertise.knowledge.length === 0 ? (
                <p className="text-[#4b5158]">None declared.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {descriptor.expertise.knowledge.map((k) => (
                    <li key={k} className="font-mono text-[#a4abb2]">
                      {k}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Output fields</p>
              <ul className="flex flex-col gap-1">
                {descriptor.output.fields.map((f) => (
                  <li key={f.field} className="font-mono text-[#a4abb2]">
                    {f.field} ← {f.jsonKey}
                  </li>
                ))}
              </ul>
              <p className="text-[#6e767d] mt-1">require: {descriptor.output.require}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Commit</p>
              {descriptor.commit.length === 0 ? (
                <p className="text-[#4b5158]">None declared.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {descriptor.commit.map((a) => (
                    <li key={a} className="font-mono text-[#a4abb2]">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card title="Resolved Context">
          {!complete && (
            <EmptyState
              title="Select a test entity to resolve the context."
              description="Choose every required level above and click Apply."
            />
          )}

          {complete && preview && !preview.ok && (
            <p className="text-sm text-[#cf7b6b]">{preview.error}</p>
          )}

          {complete && preview && preview.ok && (
            <div className="flex flex-col gap-4 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-2">Variables</p>
                <div className="flex flex-col gap-3">
                  {buildVariablePreviewRows(preview.variables).map((row) => (
                    <div key={row.id}>
                      <p className="font-mono text-[#a4abb2] mb-1">{row.id}</p>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
                        {row.text}
                      </pre>
                      <p className="text-[10px] text-[#4b5158] mt-1">
                        {row.charCount} chars — ~{row.tokenEstimate} tokens (est.)
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-2">
                  -- EFFECTIVE PROMPT --
                </p>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] text-[#6e767d] mb-1">system:</p>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed">
                      {preview.prompt.system}
                    </pre>
                    <p className="text-[10px] text-[#4b5158] mt-1">
                      {preview.prompt.system.length} chars — ~{estimateTokens(preview.prompt.system)} tokens (est.)
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6e767d] mb-1">user:</p>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-[#a4abb2] bg-[#0d0e10] border border-[#2c3035] rounded p-3 leading-relaxed">
                      {preview.prompt.user}
                    </pre>
                    <p className="text-[10px] text-[#4b5158] mt-1">
                      {preview.prompt.user.length} chars — ~{estimateTokens(preview.prompt.user)} tokens (est.)
                    </p>
                  </div>
                  <p className="text-[#a4abb2]">
                    Total: ~
                    {estimateTokens(preview.prompt.system) + estimateTokens(preview.prompt.user)} tokens
                    (est.)
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link
          href="/settings/llm-workflows"
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to LLM Workflows
        </Link>
      </div>
    </div>
  );
}
