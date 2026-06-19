import Breadcrumb from "@/components/Breadcrumb";

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-900">
      Configured
    </span>
  ) : (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-neutral-900 text-neutral-600 border border-neutral-800">
      Not configured
    </span>
  );
}

export default function SettingsPage() {
  const provider = process.env.LLM_PROVIDER ?? null;
  const baseUrl = process.env.LLM_BASE_URL ?? null;
  const model = process.env.LLM_MODEL ?? null;
  const apiKeySet = Boolean(process.env.LLM_API_KEY);
  const timeout = process.env.LLM_TIMEOUT_MS ?? null;

  const settings = [
    {
      key: "LLM_PROVIDER",
      value: provider,
      description: 'Provider to use. Supported values: "ollama", "openrouter", "openai-compatible".',
      sensitive: false,
    },
    {
      key: "LLM_BASE_URL",
      value: baseUrl,
      description: 'Base URL for the LLM API. e.g. "http://localhost:11434" for Ollama.',
      sensitive: false,
    },
    {
      key: "LLM_MODEL",
      value: model,
      description: 'Model identifier. e.g. "llama3.2", "mistral", "gpt-4o".',
      sensitive: false,
    },
    {
      key: "LLM_API_KEY",
      value: null,
      configured: apiKeySet,
      description: "API key for the provider. Not required for Ollama. Value never displayed.",
      sensitive: true,
    },
    {
      key: "LLM_TIMEOUT_MS",
      value: timeout,
      description: "Request timeout in milliseconds. Default: 30000.",
      sensitive: false,
    },
  ];

  return (
    <div>
      <Breadcrumb crumbs={[{ label: "Settings" }]} />
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Settings</h1>
      <p className="text-sm text-neutral-500 mb-10">
        Read-only. Configure these values in your <code className="text-neutral-400">.env.local</code> file.
      </p>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-5">
          LLM Provider
        </h2>
        <div className="flex flex-col gap-4">
          {settings.map((s) => {
            const configured = s.sensitive ? (s.configured ?? false) : Boolean(s.value);
            return (
              <div
                key={s.key}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-5 py-4 flex items-start gap-6"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <code className="text-sm text-neutral-300 font-mono">{s.key}</code>
                    <StatusBadge configured={configured} />
                  </div>
                  <p className="text-xs text-neutral-600">{s.description}</p>
                  {!s.sensitive && s.value && (
                    <p className="text-xs text-neutral-500 mt-1 font-mono">{s.value}</p>
                  )}
                  {s.sensitive && (
                    <p className="text-xs text-neutral-700 mt-1 italic">Value not displayed for security.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-10 pt-4 border-t border-neutral-900">
        <p className="text-xs text-neutral-700">
          LLM integration is not yet active. Configure these variables now to prepare for V0.4.
        </p>
      </div>
    </div>
  );
}
