import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import OllamaSettingsForm from "@/components/OllamaSettingsForm";
import { getLLMSettings } from "@/lib/settings";
import { fetchOllamaModelNames } from "@/lib/llm/ollama";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getLLMSettings();

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

      {/* Language Model section */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
            Language Model
          </p>
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

      {/* Quick Setup */}
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

      {/* Active integrations */}
      <div className="pt-4 border-t border-[#232629] flex flex-col gap-1">
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
