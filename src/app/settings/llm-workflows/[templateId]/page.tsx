import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, projects, sequences, shots } from "@/db/schema";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { loadBenchDescriptor } from "@/lib/llmWorkspace/benchDescriptor";
import { isBenchReturnToQueryKey, planBenchCommit, resolveBenchConfirmation } from "@/lib/llmWorkspace/benchRun";
import { requiredAnchorIdKeys, resolveOperationPreview } from "@/lib/llmWorkspace/runner";
import { estimateTokens } from "@/lib/llmWorkspace/tokenEstimate";
import {
  buildVariablePreviewRows,
  firstBenchParam,
  multiEnumBenchParam,
  multiEnumPresenceParamName,
  normalizeBenchSelection,
  parseIntentInputFromSearchParams,
  parseSelectionFromSearchParams,
  type BenchSearchParams,
} from "@/lib/llmWorkspace/bench";
import BenchRunPanel from "@/components/llmWorkspace/BenchRunPanel";
import type { Block } from "@/lib/llmWorkspace/types";

// LLMW.BENCH.READ.1 (B6b) — the three-pane bench in read-only form
// (`docs/LLM_WORKSPACE_ARCHITECTURE.md` §5.1, §5.3): left = the template's
// own descriptor, centre = the resolved context and the effective prompt.
// LLMW.BENCH.RUN.1 (B6c1) fills the third pane: Run, the proposal panel and
// a real Approve that writes in base (the variable library, §5.2, stays
// B6c2). This route answers `FB-20260716-035` — the effective prompt stops
// being a black box — and now also proves a stored template can actually be
// executed and applied (§1.1 of the ticket), not only previewed.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<BenchSearchParams>;
};

function describeBlock(block: Block): string {
  if ("text" in block) return `text: "${block.text}"`;
  if ("variable" in block) return `variable: ${block.variable} :: ${block.render}`;
  // "parameters" must be tested before "variables": the mixed variant carries both
  // keys, and testing "variables" first would hide the parameters it also reads.
  if ("parameters" in block) {
    return `variables: [${block.variables.join(", ")}], parameters: [${block.parameters.join(", ")}] :: ${block.render}`;
  }
  if ("variables" in block) return `variables: [${block.variables.join(", ")}] :: ${block.render}`;
  if ("parameter" in block) return `parameter: ${block.parameter} :: ${block.render}`;
  if ("mode" in block) return `mode :: ${block.render}`;
  return `freeText :: ${block.render}`;
}

export default async function LlmWorkflowBenchPage({ params, searchParams }: Props) {
  const { templateId } = await params;
  const search = await searchParams;

  // §4.1 — the page and both bench Server Actions (`src/actions/llmWorkspace/bench.ts`)
  // share this one resolution: Approve writes according to exactly the
  // descriptor the screen displayed, never a second, independently
  // re-resolved one.
  const resolved = await loadBenchDescriptor(templateId);

  if (resolved.status === "notFound") notFound();

  if (resolved.status === "invalid") {
    return (
      <div>
        <Breadcrumb
          crumbs={[
            { label: "Settings", href: "/settings" },
            { label: "LLM Workflows", href: "/settings/llm-workflows" },
            { label: resolved.storedName },
          ]}
        />
        <PageHeader title={resolved.storedName} meta={`Stored template #${resolved.storedId}`} />
        <Card title="Invalid Template">
          <p className="text-sm text-[#cf7b6b]">
            This template&apos;s stored JSON is not a valid operation descriptor and cannot be opened
            in the bench.
          </p>
          <p className="text-xs text-[#a4abb2] mt-2 font-mono">{resolved.reason}</p>
        </Card>
      </div>
    );
  }

  const descriptor = resolved.descriptor;
  const sourceLabel = resolved.source === "builtin" ? "Built-in" : "Stored";

  // Narrowed once, per `OperationDescriptor["output"]`'s discriminant
  // (LLMW.OUTPUT.LIST.1, B7a) — kept only for the Template pane's
  // object-shaped field listing below, which has no list-output analogue.
  // `BenchRunPanel` (LLMW.PROPOSAL.LIST.1, B7d) serves both kinds directly
  // from `descriptor.output` and no longer needs this narrowing.
  const objectOutput = descriptor.output.kind === "object" ? descriptor.output : null;

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

  // §4.3 — decided once, server-side, and passed down to `BenchRunPanel` as
  // data: whether Approve can write at all, and how.
  const plan = planBenchCommit(descriptor);

  // LLMW.BENCH.CONFIRM.1 (B7d-f) — the confirmation banner for a
  // `redirectOnly` Approve, decided once from the current query string. Null
  // for every other plan kind, or when no confirmation parameter is present.
  const confirmation = resolveBenchConfirmation(plan, search);

  // §4.6 — computed server-side from the current query string, so both
  // `redirectOnly` Approve paths (`updateShotPrompt` / `updateSequencePrompt`)
  // return to this exact bench state, selection intact, instead of the
  // Shot/Sequence screen their own action would otherwise redirect to by
  // default. `isBenchReturnToQueryKey` drops the confirmation parameter
  // those two actions append to `returnTo` on their own redirect (review
  // retake, post-B6c1) — left in, it would ride along into the *next*
  // `returnTo` and grow the URL by one parameter per Approve.
  const returnQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (!isBenchReturnToQueryKey(key)) continue;
    const first = firstBenchParam(value);
    if (first != null) returnQuery.set(key, first);
  }
  const returnQueryString = returnQuery.toString();
  const returnTo = `/settings/llm-workflows/${templateId}${returnQueryString ? `?${returnQueryString}` : ""}`;

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
            <AutoSubmitSelect
              name="projectId"
              defaultValue={selection.projectId != null ? String(selection.projectId) : ""}
              placeholder="Select a project…"
              options={projectRows.map((p) => ({ value: String(p.id), label: p.name }))}
              className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            />
          </div>

          {needsSequence && (
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
          )}

          {needsShot && (
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
          )}

          {needsAsset && (
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
          )}

          {descriptor.intent.mode && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">Mode</label>
              <AutoSubmitSelect
                name="mode"
                // R2 retake (supervisor review): read straight from `search`,
                // not from `intentInput` — `intentInput` is `{}` whenever the
                // entity selection is incomplete (resolution never starts on
                // an incomplete selection), which would otherwise reset this
                // control to `defaultMode` on every Apply that doesn't yet
                // resolve, exactly while the user is still working down the
                // project → sequence → shot cascade and setting their
                // controls. `intent.parameters` inputs below already read
                // `search` directly for the same reason. This still holds now
                // that Mode auto-submits: an incomplete cascade round-trip
                // still resolves this control's value from `search`, not
                // `descriptor.intent.mode.defaultMode`.
                defaultValue={firstBenchParam(search.mode) ?? descriptor.intent.mode.defaultMode}
                options={descriptor.intent.mode.modes.map((m) => ({ value: m.id, label: m.id }))}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
              />
            </div>
          )}

          {descriptor.intent.parameters?.map((p) => {
            // LLMW.BENCH.CONTROLS.1 (S3) — "boolean" is a checkbox, "multiEnum"
            // a checkbox per member. Both need a hidden marker: a GET form
            // sends nothing for an unchecked box, which would otherwise be
            // indistinguishable from "this parameter was never submitted".
            if (p.type === "boolean") {
              const raw = firstBenchParam(search[p.id]);
              const checked = raw === "true" ? true : raw === "false" ? false : Boolean(p.default);
              return (
                <div key={p.id} className="flex items-center gap-2">
                  {/* Piège A — unchecked sends only the hidden "false"
                      below; the checkbox must come first in document order
                      so a *checked* box's "true" is the value
                      `firstBenchParam` picks (form fields serialize in DOM
                      order: checked -> ["true","false"], unchecked ->
                      "false" alone). */}
                  <input
                    type="checkbox"
                    id={`param-${p.id}`}
                    name={p.id}
                    value="true"
                    defaultChecked={checked}
                    className="h-3.5 w-3.5"
                  />
                  <input type="hidden" name={p.id} value="false" />
                  <label htmlFor={`param-${p.id}`} className="text-[10px] uppercase tracking-wide text-[#6e767d]">
                    {p.label}
                  </label>
                </div>
              );
            }

            if (p.type === "multiEnum") {
              const selected = multiEnumBenchParam(search[p.id]);
              return (
                <div key={p.id} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#6e767d]">{p.label}</span>
                  {/* Piège B — this marker is what tells the parser "the
                      group was on the page, nothing checked" (a valid,
                      significant empty selection) apart from "the group was
                      never submitted" (the declared default applies). */}
                  <input type="hidden" name={multiEnumPresenceParamName(p.id)} value="1" />
                  <div className="flex flex-wrap gap-3">
                    {(p.values ?? []).map((v) => (
                      <label key={v} className="flex items-center gap-1 text-xs text-[#a4abb2]">
                        <input
                          type="checkbox"
                          name={p.id}
                          value={v}
                          defaultChecked={selected.includes(v)}
                          className="h-3.5 w-3.5"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              );
            }

            return (
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
            );
          })}

          {descriptor.intent.freeText && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-[#6e767d]">
                {descriptor.intent.freeText.label}
              </label>
              <input
                type="text"
                name="freeText"
                // Same reason as Mode's `defaultValue` above (R2 retake, B6b):
                // read straight from `search`, not from `intentInput` — the
                // latter is `{}` whenever the entity selection is incomplete,
                // which would otherwise blank this field on every Apply that
                // doesn't yet resolve, mid-cascade. No auto-submit: this is a
                // text input, submitted with Apply, like `intent.parameters`.
                defaultValue={firstBenchParam(search.freeText) ?? ""}
                className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1.5 w-64 focus:outline-none focus:border-[#3a4046]"
              />
            </div>
          )}

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {objectOutput ? (
                <>
                  <ul className="flex flex-col gap-1">
                    {objectOutput.fields.map((f) => (
                      <li key={f.field} className="font-mono text-[#a4abb2]">
                        {f.field} ← {f.jsonKey}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[#6e767d] mt-1">require: {objectOutput.require}</p>
                </>
              ) : (
                <p className="text-[#4b5158]">List-output templates cannot be inspected here yet.</p>
              )}
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
              description="Choose every required level above — each selection applies automatically."
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

        <Card title="Proposed Output">
          {!complete && (
            <EmptyState
              title="Select a test entity to run this template."
              description="Choose every required level above — each selection applies automatically."
            />
          )}

          {complete && preview && !preview.ok && (
            <p className="text-sm text-[#cf7b6b]">
              The context must resolve before this template can run — see Resolved Context.
            </p>
          )}

          {confirmation && (
            <p
              className={`text-sm mb-3 ${confirmation.kind === "error" ? "text-[#cf7b6b]" : "text-[#6b9e72]"}`}
            >
              {confirmation.message}
            </p>
          )}

          {complete && preview && preview.ok && (
            <BenchRunPanel
              templateId={templateId}
              ids={selection}
              searchParams={search}
              plan={plan}
              output={
                descriptor.output.kind === "object"
                  ? { kind: "object", fields: descriptor.output.fields }
                  : {
                      kind: "list",
                      itemFields: descriptor.output.item.fields,
                      formDataKey: descriptor.output.selection.formDataKey,
                    }
              }
              returnTo={returnTo}
              commitAdvisory={descriptor.commitAdvisory}
            />
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
