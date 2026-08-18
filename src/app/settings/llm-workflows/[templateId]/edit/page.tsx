import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { llmTemplates } from "@/db/schema";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { updateLlmTemplateContent } from "@/actions/llmTemplates";
import { validateLlmTemplateJson } from "@/lib/llmWorkspace/templateStorage";
import {
  availableVariableIds,
  freeTextRenderForms,
  modeRenderForms,
  multiVariableRenderForms,
  parameterRenderForms,
  renderFormsForVariable,
  variableParameterRenderForms,
} from "@/lib/llmWorkspace/templateEditorCatalogues";
import TemplateContentEditorForm, {
  type TemplateEditorCatalogues,
} from "@/components/llmWorkspace/TemplateContentEditorForm";

// ---------------------------------------------------------------------------
// [templateId]/edit/page.tsx — LLMW.EDITOR.SCREEN.1 (E1b)
//
// The screen `docs/LLM_WORKSPACE_TEMPLATE_EDITOR_SCOPING.md` §4 (E1) scopes:
// composing a prompt without leaving the application. Every decision — which
// blocks a list may hold, which render forms a block type may choose from,
// which variables exist — is `templateEditor.ts` (E1a); this route only
// resolves the stored row, computes the closed-vocabulary catalogues that
// module already derives, and hands both to the client form.
//
// Editable only: `llm_templates` rows (a numeric id) — a built-in descriptor
// (a string id, e.g. `story.generate`) has no row to patch, so this route
// 404s on anything that is not a positive integer segment, same discipline
// `bench.ts`'s own `parseTemplateRef` applies to distinguish the two.
//
// The coupled triangle (`anchor`, `output`, `commit`, `messages`,
// `preconditions`) is rendered read-only in its own card, server-side: no
// interactivity, so no reason to cross into the client bundle for it. Editing
// it is E2 (`.agents/supervised_task.md`, "Ce que tu ne fais pas").
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This template no longer exists.",
  missing_patch: "No changes were submitted.",
  invalid_patch_json: "The submitted changes could not be read.",
  invalid_json: "This template could not be saved — see the detail below.",
};

export default async function LlmTemplateEditPage({ params, searchParams }: Props) {
  const { templateId: rawId } = await params;
  const { error, detail } = await searchParams;

  const templateId = parseInt(rawId, 10);
  if (!Number.isInteger(templateId) || templateId <= 0) notFound();

  const [row] = await db
    .select({ id: llmTemplates.id, name: llmTemplates.name, templateJson: llmTemplates.templateJson })
    .from(llmTemplates)
    .where(eq(llmTemplates.id, templateId));
  if (!row) notFound();

  const validated = validateLlmTemplateJson(row.templateJson);

  const crumbs = [
    { label: "Settings", href: "/settings" },
    { label: "LLM Workflows", href: "/settings/llm-workflows" },
    { label: row.name, href: `/settings/llm-workflows/${templateId}` },
    { label: "Edit" },
  ];

  if (!validated.ok) {
    return (
      <div>
        <Breadcrumb crumbs={crumbs} />
        <PageHeader title={`Edit — ${row.name}`} meta={`Template #${row.id}`} />
        <Card title="Invalid Template">
          <p className="text-sm text-[#cf7b6b]">
            This template&apos;s stored JSON is not a valid operation descriptor and cannot be edited.
          </p>
          <p className="text-xs text-[#a4abb2] mt-2 font-mono">{validated.reason}</p>
        </Card>
      </div>
    );
  }

  const descriptor = validated.descriptor;

  const variableIds = availableVariableIds();
  const renderFormsByVariable: Record<string, string[]> = {};
  for (const id of variableIds) renderFormsByVariable[id] = renderFormsForVariable(id);

  const catalogues: TemplateEditorCatalogues = {
    variableIds,
    renderFormsByVariable,
    multiVariableForms: multiVariableRenderForms(),
    parameterForms: parameterRenderForms(),
    variableParameterForms: variableParameterRenderForms(),
    modeForms: modeRenderForms(),
    freeTextForms: freeTextRenderForms(),
  };

  const saveAction = updateLlmTemplateContent.bind(null, templateId);

  return (
    <div>
      <Breadcrumb crumbs={crumbs} />
      <PageHeader title={`Edit — ${descriptor.name}`} meta={`Template #${row.id}`} />

      {error && (
        <div className="mb-6 rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">{ERROR_MESSAGES[error] ?? "Save failed."}</p>
          {detail && <p className="mt-1 text-xs text-[#6e767d] font-mono whitespace-pre-wrap">{detail}</p>}
        </div>
      )}

      <Card title="Inherited from the duplicated built-in — read-only" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          Anchor, output, commit, messages and preconditions stay exactly as duplicated. Editing them is a
          later ticket (E2) — changing what a template writes needs cohesion rules this editor does not
          enforce yet, so the template stays applicable no matter what you change here.
        </p>
        <div className="flex flex-col gap-4 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Anchor</p>
            <p className="text-[#a4abb2] font-mono">
              {descriptor.anchor.kind} :: {descriptor.anchor.entity}
              {descriptor.anchor.kind === "entitySet" && ` (max ${descriptor.anchor.maxSize})`}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Output</p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
              {JSON.stringify(descriptor.output, null, 2)}
            </pre>
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
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Messages</p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
              {JSON.stringify(descriptor.messages, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#6e767d] mb-1">Preconditions</p>
            {!descriptor.preconditions || descriptor.preconditions.length === 0 ? (
              <p className="text-[#4b5158]">None declared.</p>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#8a8f96] bg-[#0d0e10] border border-[#1e2124] rounded p-2 leading-relaxed">
                {JSON.stringify(descriptor.preconditions, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </Card>

      <TemplateContentEditorForm
        templateId={templateId}
        descriptor={descriptor}
        catalogues={catalogues}
        saveAction={saveAction}
        hasError={Boolean(error)}
      />

      <div className="mt-8 pt-4 border-t border-[#232629] flex items-center gap-4">
        <Link
          href={`/settings/llm-workflows/${templateId}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to the bench — check the effective prompt
        </Link>
      </div>
    </div>
  );
}
