import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import OllamaSettingsForm from "@/components/OllamaSettingsForm";
import ComfyUISettingsForm from "@/components/ComfyUISettingsForm";
import ChatSystemPromptManager from "@/components/ChatSystemPromptManager";
import ChatProviderSettingsForm from "@/components/ChatProviderSettingsForm";
import NomenclatureSettingsForm from "@/components/NomenclatureSettingsForm";
import OpenReelSidecarSettingsForm from "@/components/OpenReelSidecarSettingsForm";
import MikAIPublicBaseUrlSettingsForm from "@/components/MikAIPublicBaseUrlSettingsForm";
import FfmpegHealthCheckForm from "@/components/FfmpegHealthCheckForm";
import ThemeModeToggle from "@/components/ThemeModeToggle";
import { getAllLLMSettings, getActiveProvider, getComfySettings, getLLMConfig, getChatProviderInfo, getNomenclatureSettings, getOpenReelSidecarUrl, getMikAIPublicBaseUrl, COMFY_CLOUD_BASE_URL } from "@/lib/settings";
import { getWorkflowDefaults } from "@/lib/workflowDefaults";
import { saveWorkflowDefaults } from "@/actions/settings";
import { fetchLLMModelNames } from "@/lib/llm";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ defaultsSaved?: string }>;
};

function SectionLabel({ label, id }: { label: string; id?: string }) {
  return (
    <div id={id} className="border-t border-[#232629] pt-4 mt-6 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

// UX.2.SETTINGS.NAV.1 — stable anchor ids, one per SectionLabel below.
// Kept as a single source of truth so the nav links and the section ids
// can never drift out of sync with each other.
const SETTINGS_SECTIONS = [
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-language-model", label: "Language Model" },
  { id: "settings-llm-chat", label: "LLM Chat" },
  { id: "settings-comfyui", label: "ComfyUI" },
  { id: "settings-generation-defaults", label: "Generation Defaults" },
  { id: "settings-nomenclature", label: "Nomenclature" },
  { id: "settings-integrations", label: "Integrations" },
  { id: "settings-technical", label: "Technical" },
] as const;

export default async function SettingsPage({ searchParams }: Props) {
  const { defaultsSaved } = await searchParams;
  const allSettings = await getAllLLMSettings();
  const activeProvider = allSettings.activeProvider;
  const [comfySettings, chatProviderInfo] = await Promise.all([
    getComfySettings(),
    getChatProviderInfo(),
  ]);

  const nomenclatureSettings = await getNomenclatureSettings();
  const openReelSidecarUrl = await getOpenReelSidecarUrl();
  const mikaiPublicBaseUrl = await getMikAIPublicBaseUrl();

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
    const activeSettings = allSettings[activeProvider];
    const activeConfig = await getLLMConfig();
    initialModels = await fetchLLMModelNames({
      provider: activeProvider,
      baseUrl: activeSettings.baseUrl,
      model: activeSettings.model,
      apiKey: activeConfig?.apiKey ?? null,
      timeoutMs: activeSettings.timeoutMs,
    });
  } catch (err) {
    initialModelsError =
      err instanceof Error
        ? err.message
        : "Could not reach LLM server.";
  }

  return (
    <div>
      <Breadcrumb crumbs={[{ label: "Settings" }]} />
      <PageHeader title="Settings" />

      {/* UX.2.SETTINGS.NAV.1 — compact internal navigation. Plain native
          anchor links (href="#...") to each section's id below; the
          browser handles the scroll itself, no client-side logic needed.
          Wraps onto multiple lines at narrow widths via flex-wrap. */}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-x-4 gap-y-1.5 mb-6 pb-4 border-b border-[#232629]"
      >
        {SETTINGS_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors whitespace-nowrap"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {/* ── Appearance ─────────────────────────────────────── */}
      <SectionLabel label="Appearance" id="settings-appearance" />

      <Card title="Appearance" className="mb-6">
        <div className="mikai-appearance-preview rounded border border-[#232629] p-4">
          <ThemeModeToggle />
        </div>
      </Card>

      {/* ── Language Model ─────────────────────────────────── */}
      <SectionLabel label="Language Model" id="settings-language-model" />

      <Card title="Language Model" className="mb-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-[#4b5158] border border-[#232629] rounded px-2 py-0.5">
            Active provider: {activeProvider}
          </span>
        </div>
        <OllamaSettingsForm
          activeProvider={activeProvider}
          providers={{
            ollama: allSettings.ollama,
            openrouter: allSettings.openrouter,
            "openai-compatible": allSettings["openai-compatible"],
          }}
          initialModels={initialModels}
          initialModelsError={initialModelsError}
        />
      </Card>

      <Card title="Quick Setup" className="mb-6">
        <ol className="flex flex-col gap-2 text-sm text-[#6e767d] list-none">
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">Ollama</span>
            <span>
              Install at{" "}
              <span className="text-[#a4abb2] font-mono text-xs">ollama.com</span>,{" "}
              run <code className="text-[#a4abb2] text-xs">ollama serve</code> +{" "}
              <code className="text-[#a4abb2] text-xs">ollama pull llama3.2</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">OpenRouter</span>
            <span>
              Select "OpenRouter" provider, get API key from{" "}
              <span className="text-[#a4abb2] font-mono text-xs">openrouter.ai</span>,{" "}
              enter key + model ID.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">vLLM</span>
            <span>
              Select "OpenAI-compatible", set base URL to{" "}
              <code className="text-[#a4abb2] text-xs">http://server:8000/v1</code>,{" "}
              enter model ID.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#4b5158] font-mono text-xs mt-0.5 shrink-0">Test</span>
            <span>Click Test Connection to verify, then Save Changes.</span>
          </li>
        </ol>
      </Card>

      {/* ── LLM Chat ─────────────────────────────────────────── */}
      <SectionLabel label="LLM Chat" id="settings-llm-chat" />

      <Card title="Chat LLM Provider" className="mb-6">
        <ChatProviderSettingsForm
          initialUseSeparate={chatProviderInfo.useSeparate}
          initialChatProvider={chatProviderInfo.chatProvider}
          providers={{
            ollama: allSettings.ollama,
            openrouter: allSettings.openrouter,
            "openai-compatible": allSettings["openai-compatible"],
          }}
        />
      </Card>

      <Card title="LLM Chat System Prompt Library" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          Create and manage reusable system prompts for the sidebar LLM chat.
        </p>
        <ChatSystemPromptManager />
      </Card>

      {/* ── ComfyUI ────────────────────────────────────────── */}
      <SectionLabel label="ComfyUI" id="settings-comfyui" />

      <Card title="ComfyUI Connection" className="mb-6">
        <ComfyUISettingsForm
          initialProvider={comfySettings.provider}
          initialBaseUrl={comfySettings.baseUrl}
          initialHasApiKey={comfySettings.hasApiKey}
          initialLocalVramAutoManagement={comfySettings.localVramAutoManagement}
          cloudBaseUrl={COMFY_CLOUD_BASE_URL}
        />
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
      <SectionLabel label="Generation Defaults" id="settings-generation-defaults" />

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
          {/* CAMLAB.POLISH.1 — Lot A. Same "-- None --" absent/invalid
              behavior as the three defaults above; lists existing workflows
              only, never inferred by name/id/SHARP class. */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#6e767d]">Default Gaussian PLY</label>
            <select
              name="gaussianPlyWorkflowId"
              defaultValue={String(defaults.gaussianPlyId ?? "")}
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
            <label className="text-xs text-[#6e767d]">Default Gaussian-to-image</label>
            <select
              name="gaussianToImageWorkflowId"
              defaultValue={String(defaults.gaussianToImageId ?? "")}
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

      {/* ── Nomenclature ───────────────────────────────────── */}
      <SectionLabel label="Nomenclature" id="settings-nomenclature" />

      <Card title="Code Templates" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          Templates define how sequence and shot codes are generated. Use a numeric seed followed by X's to set the step size.
        </p>
        <NomenclatureSettingsForm
          initialSequenceTemplate={nomenclatureSettings.sequenceTemplate}
          initialShotTemplate={nomenclatureSettings.shotTemplate}
        />
      </Card>

      {/* ── Integrations ───────────────────────────────────── */}
      <SectionLabel label="Integrations" id="settings-integrations" />
      <div className="flex flex-col gap-1 mb-6">
        <p className="text-xs text-[#6e767d]">
          Active:{" "}
          <span className="text-[#a4abb2]">Generate Story from Pitch</span>
        </p>
        <p className="text-xs text-[#4b5158]">
          Coming soon: Generate Sequences from Story · Generate Shots from Sequence
        </p>
      </div>

      <Card title="Advanced Editor (OpenReel)" className="flex flex-col gap-6">
        <OpenReelSidecarSettingsForm initialUrl={openReelSidecarUrl} />
        <div className="border-t border-[#232629] pt-6">
          <MikAIPublicBaseUrlSettingsForm initialUrl={mikaiPublicBaseUrl} />
        </div>
      </Card>

      {/* ── Technical ──────────────────────────────────────── */}
      <SectionLabel label="Technical" id="settings-technical" />

      <Card title="Bundled FFmpeg" className="mb-6">
        <p className="text-xs text-[#6e767d] mb-4">
          FFmpeg and FFprobe are bundled with MikAI (no system install required) for future video rendering features.
        </p>
        <FfmpegHealthCheckForm />
      </Card>
    </div>
  );
}