import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import OllamaSettingsForm from "@/components/OllamaSettingsForm";
import ComfyUISettingsForm from "@/components/ComfyUISettingsForm";
import ChatSystemPromptManager from "@/components/ChatSystemPromptManager";
import { getLLMSettings, getComfySettings } from "@/lib/settings";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import { saveWorkflowDefaults } from "@/actions/settings";
import { fetchOllamaModelNames } from "@/lib/llm/ollama";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ defaultsSaved?: string }>;
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

export default async function SettingsPage({ searchParams }: Props) {
  const { defaultsSaved } = await searchParams;
  const settings = await getLLMSettings();
  const comfySettings = await getComfySettings();

  const [{ workflowCount }, allWorkflows, defaults] = await Promise.all([
    db.select({ workflowCount: sql<number>`count(*)` }).from(comfyWorkflows).then(([r]) => r),
    db
      .select({ id: comfyWorkflows.id, name: comfyWorkflows.name, kind: comfyWorkflows.kind })
      .from(comfyWorkflows)
      .orderBy(desc(comfyWorkflows.updatedAt)),
    getWorkflowDefaults(),
  ]);

  const imageWorkflows = allWorkflows.filter((wf) => wf.kind === "image");
  const videoWorkflows = allWorkflows.filter((wf) => wf.kind === "video");

  let initialModels: string[] = [];
  let initialModelsError: string | null = null;
  try {
    initialModels = await fetchOllamaModelNames(settings.baseUrl);
  } catch (err) {
    initialModelsError =
      err instanceof Error
        ? err.message
        : "Could not reach Ollama. Make sure Ollama is running.";
  }

  return (
    <div>
      <Breadcrumb crumbs={[{ label: "Settings" }]} />
      <PageHeader title="Settings" />

      {/* ── Language Model ─────────────────────────────────── */}
      <SectionLabel label="Language Model" />

      <Card title="Language Model" className="mb-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-[#4b5158] border border-[#232629] rounded px-2 py-0.5">
            Active provider: Ollama
          </span>
        </div>
        <OllamaSettingsForm
          initialBaseUrl={settings.baseUrl}
          initialModel={settings.model}
          initialTimeoutMs={settings.timeoutMs}
          initialModels={initialModels}
          initialModelsError={initialModelsError}
        />
      </Card>

      <Card title="Quick Setup" className="mb-6">
        <ol className="flex flex-col gap-2 text-sm text-[#6e767d] list-none">
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">1.</span>
            <span>
              Install Ollama at{" "}
              <span className="text-[#a4abb2] font-mono text-xs">ollama.com</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">2.</span>
            <span>
              Start the server:{" "}
              <code className="text-[#a4abb2] text-xs">ollama serve</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">3.</span>
            <span>
              Pull a model:{" "}
              <code className="text-[#a4abb2] text-xs">ollama pull llama3.2</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">4.</span>
            <span>Select a model from the dropdown above and click Test Connection.</span>
          </li>
        </ol>
      </Card>

      {/* ── LLM Chat System Prompt Library ───────────────────── */}
      <SectionLabel label="LLM Chat" />

      <Card title="LLM Chat System Prompt Library" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          Create and manage reusable system prompts for the sidebar LLM chat.
        </p>
        <ChatSystemPromptManager />
      </Card>

      {/* ── ComfyUI ────────────────────────────────────────── */}
      <SectionLabel label="ComfyUI" />

      <Card title="ComfyUI Connection" className="mb-6">
        <ComfyUISettingsForm initialBaseUrl={comfySettings.baseUrl} initialApiKey={comfySettings.apiKey} />
      </Card>

      <Card title="Workflow Library" className="mb-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#a4abb2]">
            <span className="text-[#e7e9ec] font-medium">{workflowCount}</span>{" "}
            {workflowCount === 1 ? "workflow saved" : "workflows saved"}
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/workflows/new"
              className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              + Add Workflow
            </Link>
            <Link
              href="/settings/workflows"
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Manage Workflows →
            </Link>
          </div>
        </div>
      </Card>

      {/* ── Generation Defaults ────────────────────────────── */}
      <SectionLabel label="Generation Defaults" />

      {defaultsSaved === "1" && (
        <div className="mb-4 rounded border border-[#6b9e72]/30 bg-[#1a2e1e] px-4 py-3">
          <p className="text-sm text-[#6b9e72]">Generation defaults saved.</p>
        </div>
      )}

      <Card title="Generation Defaults" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-5">
          Fast-track generation by opening a workflow directly from Asset or Shot pages.
        </p>
        <form action={saveWorkflowDefaults} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6e767d]">Default Asset Workflow</label>
            <select
              name="assetImageWorkflowId"
              defaultValue={String(defaults.assetImageId ?? "")}
              className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            >
              <option value="">-- None --</option>
              {imageWorkflows.map((wf) => (
                <option key={wf.id} value={String(wf.id)}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6e767d]">Default Shot Keyframe</label>
            <select
              name="shotImageWorkflowId"
              defaultValue={String(defaults.shotImageId ?? "")}
              className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            >
              <option value="">-- None --</option>
              {imageWorkflows.map((wf) => (
                <option key={wf.id} value={String(wf.id)}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6e767d]">Default Shot Video</label>
            <select
              name="shotVideoWorkflowId"
              defaultValue={String(defaults.shotVideoId ?? "")}
              className="rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
            >
              <option value="">-- None --</option>
              {videoWorkflows.map((wf) => (
                <option key={wf.id} value={String(wf.id)}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
            >
              Save Defaults
            </button>
          </div>
        </form>
      </Card>

      {/* ── Integrations ───────────────────────────────────── */}
      <SectionLabel label="Integrations" />
      <div className="flex flex-col gap-1">
        <p className="text-xs text-[#6e767d]">
          Active:{" "}
          <span className="text-[#a4abb2]">Generate Story from Pitch</span>
        </p>
        <p className="text-xs text-[#4b5158]">
          Coming soon: Generate Sequences from Story · Generate Shots from Sequence
        </p>
      </div>
    </div>
  );
}