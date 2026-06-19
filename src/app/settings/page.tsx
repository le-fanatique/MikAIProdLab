import Breadcrumb from "@/components/Breadcrumb";
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
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

      {/* Language Model section */}
      <section className="max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Language Model
          </h2>
          <span className="text-xs text-neutral-600 border border-neutral-800 rounded px-2 py-0.5">
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
      </section>

      {/* Quick Setup */}
      <section className="max-w-lg mt-12 pt-8 border-t border-neutral-900">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">
          Quick Setup
        </h2>
        <ol className="flex flex-col gap-2 text-sm text-neutral-500 list-none">
          <li className="flex gap-3">
            <span className="text-neutral-700 font-mono text-xs mt-0.5 shrink-0">1.</span>
            <span>
              Install Ollama at{" "}
              <span className="text-neutral-400 font-mono text-xs">ollama.com</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-neutral-700 font-mono text-xs mt-0.5 shrink-0">2.</span>
            <span>
              Start the server:{" "}
              <code className="text-neutral-400 text-xs">ollama serve</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-neutral-700 font-mono text-xs mt-0.5 shrink-0">3.</span>
            <span>
              Pull a model:{" "}
              <code className="text-neutral-400 text-xs">ollama pull llama3.2</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-neutral-700 font-mono text-xs mt-0.5 shrink-0">4.</span>
            <span>Select a model from the dropdown above and click Test Connection.</span>
          </li>
        </ol>
      </section>

      {/* Active integrations */}
      <div className="max-w-lg mt-8 pt-4 border-t border-neutral-900 flex flex-col gap-1">
        <p className="text-xs text-neutral-500">
          Active:{" "}
          <span className="text-neutral-400">Generate Story from Pitch</span>
        </p>
        <p className="text-xs text-neutral-700">
          Coming soon: Generate Sequences from Story · Generate Shots from Sequence
        </p>
      </div>
    </div>
  );
}
