"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LLMProvider, ProviderSettings } from "@/types/llm";
import {
  saveLLMSettings,
  testLLMConnection,
  fetchLLMModels,
} from "@/actions/settings";

type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type TestStatus =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

type RefreshStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type Props = {
  activeProvider: LLMProvider;
  providers: Record<LLMProvider, ProviderSettings>;
  initialModels: string[];
  initialModelsError: string | null;
};

const PROVIDER_OPTIONS: { value: LLMProvider; label: string; defaultUrl: string }[] = [
  { value: "ollama", label: "Ollama", defaultUrl: "http://localhost:11434" },
  { value: "openrouter", label: "OpenRouter", defaultUrl: "https://openrouter.ai/api/v1" },
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM", defaultUrl: "http://localhost:8000/v1" },
];

export default function OllamaSettingsForm({
  activeProvider,
  providers,
  initialModels,
  initialModelsError,
}: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState<LLMProvider>(activeProvider);

  // Form state for the current provider
  const cur = providers[provider];
  const [baseUrl, setBaseUrl] = useState(cur.baseUrl);
  const [model, setModel] = useState(cur.model);
  const [timeoutMs, setTimeoutMs] = useState(String(cur.timeoutMs));
  const [temperature, setTemperature] = useState(String(cur.temperature));
  const [hasApiKey, setHasApiKey] = useState(cur.hasApiKey);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  const [models, setModels] = useState<string[]>(initialModels);
  const [modelsError, setModelsError] = useState<string | null>(initialModelsError);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: "idle" });
  const [testStatus, setTestStatus] = useState<TestStatus>({ status: "idle" });
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({ status: "idle" });

  const isBusy =
    saveStatus.status === "saving" ||
    testStatus.status === "testing" ||
    refreshStatus.status === "loading";

  const needsApiKey = provider === "openrouter";
  const apiKeyOptional = provider === "openai-compatible";
  const showApiKeyField = needsApiKey || apiKeyOptional;

  const inputClass =
    "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors font-mono";

  const savedModelInList = models.includes(model);
  const hasSavedModel = !!model.trim();

  function handleProviderChange(newProvider: LLMProvider) {
    const newCur = providers[newProvider];
    setProvider(newProvider);
    setBaseUrl(newCur.baseUrl);
    setModel(newCur.model);
    setTimeoutMs(String(newCur.timeoutMs));
    setTemperature(String(newCur.temperature));
    setHasApiKey(newCur.hasApiKey);
    setApiKey("");
    setApiKeyTouched(false);
    setTestStatus({ status: "idle" });
    setSaveStatus({ status: "idle" });
    setModels([]);
    setModelsError(null);
  }

  async function handleSave() {
    setSaveStatus({ status: "saving" });
    setTestStatus({ status: "idle" });
    const mode = apiKeyTouched ? "replace" : "keep";
    const result = await saveLLMSettings(
      provider,
      baseUrl,
      model,
      apiKeyTouched ? apiKey : "",
      timeoutMs,
      temperature,
      mode
    );
    if (result.ok) {
      setSaveStatus({ status: "saved" });
      setHasApiKey(apiKeyTouched ? !!apiKey : hasApiKey);
      setApiKeyTouched(false);
      setApiKey("");
      router.refresh();
      setTimeout(() => setSaveStatus({ status: "idle" }), 2500);
    } else {
      setSaveStatus({ status: "error", message: result.error });
    }
  }

  async function handleTest() {
    setTestStatus({ status: "testing" });
    const result = await testLLMConnection(provider, baseUrl, model, apiKey);
    if (result.ok) {
      setTestStatus({ status: "ok", message: result.message });
    } else {
      setTestStatus({ status: "error", message: result.error });
    }
  }

  async function handleRefreshModels() {
    setRefreshStatus({ status: "loading" });
    setTestStatus({ status: "idle" });
    const result = await fetchLLMModels(provider, baseUrl, apiKey);
    if (result.ok) {
      setModels(result.models);
      setModelsError(null);
      setRefreshStatus({ status: "idle" });
      if (result.models.length > 0 && !result.models.includes(model)) {
        setModel(result.models[0]);
      }
    } else {
      setModelsError(result.error);
      setRefreshStatus({ status: "error", message: result.error });
    }
  }

  async function handleClearApiKey() {
    setApiKey("");
    setApiKeyTouched(true);
    const result = await saveLLMSettings(
      provider, baseUrl, model, "", timeoutMs, temperature, "replace"
    );
    if (result.ok) {
      setHasApiKey(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Provider */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
          Provider
        </label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
          disabled={isBusy}
          className={inputClass + " cursor-pointer"}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Base URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
          Base URL
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={PROVIDER_OPTIONS.find((p) => p.value === provider)?.defaultUrl}
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* API Key */}
      {showApiKeyField && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
              API Key {needsApiKey ? "(required)" : "(optional)"}
            </label>
            {hasApiKey && !apiKeyTouched && (
              <span className="text-[10px] text-[#6b9e72]">Key saved for {PROVIDER_OPTIONS.find((p) => p.value === provider)?.label.toLowerCase()}</span>
            )}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setApiKeyTouched(true); }}
            placeholder={needsApiKey ? "sk-..." : "Optional"}
            disabled={isBusy}
            className={inputClass}
          />
          {hasApiKey && (
            <button
              type="button"
              onClick={handleClearApiKey}
              disabled={isBusy}
              className="text-xs text-[#6e767d] hover:text-[#cf7b6b] transition-colors self-start"
            >
              Clear saved API key
            </button>
          )}
        </div>
      )}

      {/* Model */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
            Model
          </label>
          <button
            type="button"
            onClick={handleRefreshModels}
            disabled={isBusy}
            className={
              isBusy
                ? "text-xs text-[#4b5158] cursor-not-allowed"
                : "text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
            }
          >
            {refreshStatus.status === "loading" ? "Refreshing..." : "Refresh Models"}
          </button>
        </div>

        {models.length > 0 || (hasSavedModel && !savedModelInList) ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isBusy}
            className={inputClass + " cursor-pointer"}
          >
            {hasSavedModel && !savedModelInList && (
              <option value={model}>{model} — saved, not in list</option>
            )}
            {models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Enter model ID manually"
            disabled={isBusy}
            className={inputClass}
          />
        )}

        {modelsError && (
          <p className="text-xs text-[#cda24f]">{modelsError}</p>
        )}
      </div>

      {/* Temperature */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
          Temperature
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder="0.7"
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Timeout */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
          Timeout (ms)
        </label>
        <input
          type="number"
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(e.target.value)}
          placeholder="30000"
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isBusy}
          className={
            isBusy
              ? "rounded bg-[#1a1d20] text-[#4b5158] px-4 py-2 text-sm cursor-not-allowed"
              : "rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          }
        >
          {saveStatus.status === "saving" ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={isBusy || !model.trim()}
          className={
            isBusy || !model.trim()
              ? "rounded border border-[#232629] text-[#4b5158] px-4 py-2 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-4 py-2 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          {testStatus.status === "testing" ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {/* Validation warnings */}
      {needsApiKey && !hasApiKey && !apiKeyTouched && !apiKey.trim() && (
        <p className="text-xs text-[#cda24f]">API key is required for {PROVIDER_OPTIONS.find((p) => p.value === provider)?.label}. Enter a key or save an existing one.</p>
      )}

      {/* Save feedback */}
      {saveStatus.status === "saved" && (
        <p className="text-xs text-[#6b9e72]">Settings saved for {PROVIDER_OPTIONS.find((p) => p.value === provider)?.label.toLowerCase()}.</p>
      )}
      {saveStatus.status === "error" && (
        <p className="text-xs text-[#cf7b6b]">{saveStatus.message}</p>
      )}

      {/* Test feedback */}
      {testStatus.status === "ok" && (
        <p className="text-xs text-[#6b9e72]">✓ {testStatus.message}</p>
      )}
      {testStatus.status === "error" && (
        <p className="text-xs text-[#cf7b6b]">✗ {testStatus.message}</p>
      )}
    </div>
  );
}