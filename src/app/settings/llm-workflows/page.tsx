import Link from "next/link";
import { db } from "@/db";
import { llmTemplates, projects } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/DeleteButton";
import { DESCRIPTORS } from "@/lib/llmWorkspace/descriptors";
import {
  createLlmTemplateFromDescriptor,
  deleteLlmTemplate,
  importLlmTemplate,
  updateLlmTemplateMetadata,
} from "@/actions/llmTemplates";

// LLMW.STORAGE.1 (B6a) — the list `docs/USER_FEEDBACK.md`'s
// FB-20260715-013 asked for: every LLM prompt of the application in one
// place, each associated with its operating entity. Two sections: the eight
// code descriptors (read-only, "built-in"), and the editable
// `llm_templates` rows the workshop created or imported. No workbench UI
// here — that is B6b/B6c.

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Template not found.",
  unknown_descriptor: "Unknown built-in operation.",
  missing_json: "Choose a JSON file to import.",
  too_large: "The file is too large.",
  invalid_json: "This file is not a valid LLM template.",
  missing_name: "Name is required.",
  invalid_project: "Selected project does not exist.",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function LlmWorkflowsListPage({ searchParams }: Props) {
  const { error } = await searchParams;

  const [rows, allProjects] = await Promise.all([
    db
      .select({
        id: llmTemplates.id,
        name: llmTemplates.name,
        description: llmTemplates.description,
        anchorKind: llmTemplates.anchorKind,
        projectId: llmTemplates.projectId,
        projectName: projects.name,
        sourceFilename: llmTemplates.sourceFilename,
        updatedAt: llmTemplates.updatedAt,
      })
      .from(llmTemplates)
      .leftJoin(projects, eq(llmTemplates.projectId, projects.id))
      .orderBy(desc(llmTemplates.id)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name),
  ]);

  const descriptorEntries = Object.entries(DESCRIPTORS);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "LLM Workflows" },
        ]}
      />
      <PageHeader title="LLM Workflows" />

      {error && ERROR_MESSAGES[error] && (
        <div className="mb-4 rounded border border-[#cf7b6b]/30 bg-[#1a0e0e] px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">{ERROR_MESSAGES[error]}</p>
        </div>
      )}

      <Card title="Built-in Operations" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          These operations ship with the application and cannot be edited directly. Duplicate one
          into an editable template to customize it.
        </p>
        <div className="flex flex-col gap-3">
          {descriptorEntries.map(([id, descriptor]) => {
            const duplicateAction = createLlmTemplateFromDescriptor.bind(null, id);
            return (
              <Card key={id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#6e767d]/30 text-[#a4abb2] bg-[#141618] uppercase tracking-wide">
                        {descriptor.anchor.entity}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#5b93d6]/30 text-[#5b93d6] bg-[#1a2535]">
                        Built-in
                      </span>
                      <span className="text-sm font-medium text-[#e7e9ec] truncate">
                        {descriptor.name}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-[#6e767d]">{id}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <form action={duplicateAction}>
                      <button
                        type="submit"
                        className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                      >
                        Duplicate as editable template
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      <Card title="Import Template" className="mb-6">
        <form action={importLlmTemplate} className="flex items-center gap-3">
          <input
            type="file"
            name="templateFile"
            accept="application/json,.json"
            className="text-xs text-[#a4abb2]"
          />
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Import
          </button>
        </form>
      </Card>

      <Card title="Templates">
        {rows.length === 0 ? (
          <EmptyState title="No editable templates yet." description="Duplicate a built-in operation above to get started." />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const deleteAction = deleteLlmTemplate.bind(null, row.id);
              const updateAction = updateLlmTemplateMetadata.bind(null, row.id);
              const scope = row.projectId != null ? (row.projectName ?? `Project ${row.projectId}`) : "Global";
              return (
                <Card key={row.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#6e767d]/30 text-[#a4abb2] bg-[#141618] uppercase tracking-wide">
                          {row.anchorKind}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#6b9e72]/30 text-[#6b9e72] bg-[#1a2e1e]">
                          {scope}
                        </span>
                        <span className="text-sm font-medium text-[#e7e9ec] truncate">
                          {row.name}
                        </span>
                      </div>
                      {row.description && (
                        <p className="text-xs text-[#a4abb2] mb-1">{row.description}</p>
                      )}
                      {row.sourceFilename && (
                        <p className="text-xs font-mono text-[#6e767d]">{row.sourceFilename}</p>
                      )}
                      <p className="text-[10px] text-[#4b5158] mt-1">
                        Updated {fmtDate(row.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Link
                        href={`/api/llm-templates/${row.id}/export`}
                        className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                      >
                        Export
                      </Link>
                      <DeleteButton
                        action={deleteAction}
                        confirm="Delete this template?"
                        label="Delete"
                        className="text-xs text-[#cf7b6b]/50 hover:text-[#cf7b6b] transition-colors"
                      />
                    </div>
                  </div>
                  <form
                    action={updateAction}
                    className="mt-3 pt-3 border-t border-[#232629] flex items-center gap-2"
                  >
                    <input type="hidden" name="name" value={row.name} />
                    <input type="hidden" name="description" value={row.description ?? ""} />
                    <label className="text-[10px] text-[#6e767d] uppercase tracking-wide">Project scope</label>
                    <select
                      name="projectId"
                      defaultValue={row.projectId != null ? String(row.projectId) : ""}
                      className="rounded border border-[#2c3035] bg-[#141618] text-xs text-[#a4abb2] px-2 py-1 focus:outline-none focus:border-[#3a4046]"
                    >
                      <option value="">Global</option>
                      {allProjects.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                    >
                      Save
                    </button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href="/settings"
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to Settings
        </Link>
      </div>
    </div>
  );
}
