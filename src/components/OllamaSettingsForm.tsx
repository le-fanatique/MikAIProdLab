"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveOllamaSettings,
  testOllamaConnection,
  fetchOllamaModels,
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
  initialBaseUrl: string;
  initialModel: string;
  initialTimeoutMs: number;
  initialModels: string[];
  initialModelsError: string | null;
};

export default function OllamaSettingsForm({
  initialBaseUrl,
  initialModel,
  initialTimeoutMs,
  initialModels,
  initialModelsError,
}: Props) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [model, setModel] = useState(initialModel);
  const [timeoutMs, setTimeoutMs] = useState(String(initialTimeoutMs));
  const [models, setModels] = useState<string[]>(initialModels);
  const [modelsError, setModelsError] = useState<string | null>(initialModelsError);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: "idle" });
  const [testStatus, setTestStatus] = useState<TestStatus>({ status: "idle" });
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({ status: "idle" });

  const isBusy =
    saveStatus.status === "saving" ||
    testStatus.status === "testing" ||
    refreshStatus.status === "loading";

  const inputClass =
    "w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors font-mono";

  const savedModelInList = models.includes(model);
  const hasSavedModel = !!model.trim();

  async function handleSave() {
    setSaveStatus({ status: "saving" });
    setTestStatus({ status: "idle" });
    const result = await saveOllamaSettings(baseUrl, model, timeoutMs);
    if (result.ok) {
      setSaveStatus({ status: "saved" });
      router.refresh();
      setTimeout(() => setSaveStatus({ status: "idle" }), 2500);
    } else {
      setSaveStatus({ status: "error", message: result.error });
    }
  }

  async function handleTest() {
    setTestStatus({ status: "testing" });
    const result = await testOllamaConnection(baseUrl, model);
    if (result.ok) {
      setTestStatus({ status: "ok", message: result.message });
    } else {
      setTestStatus({ status: "error", message: result.error });
    }
  }

  async function handleRefreshModels() {
    setRefreshStatus({ status: "loading" });
    setTestStatus({ status: "idle" });
    const result = await fetchOllamaModels(baseUrl);
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

  return (
    <div className="flex flex-col gap-5">
      {/* Base URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
          Ollama Server URL
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          disabled={isBusy}
          className={inputClass}
        />
      </div>

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Model
          </label>
          <button
            type="button"
            onClick={handleRefreshModels}
            disabled={isBusy}
            className={
              isBusy
                ? "text-xs text-neutral-700 cursor-not-allowed"
                : "text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
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
              <option value={model}>{model} — saved, not found locally</option>
            )}
            {models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <div className={inputClass + " text-neutral-600 cursor-not-allowed select-none"}>
            {modelsError
              ? "No models loaded — click Refresh Models"
              : "No local models found. Pull one with: ollama pull llama3.2"}
          </div>
        )}

        {modelsError && (
          <p className="text-xs text-amber-500">{modelsError}</p>
        )}
      </div>

      {/* Timeout */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
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
              ? "rounded bg-neutral-700 text-neutral-500 px-4 py-2 text-sm cursor-not-allowed"
              : "rounded bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
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
              ? "rounded border border-neutral-800 text-neutral-700 px-4 py-2 text-sm cursor-not-allowed"
              : "rounded border border-neutral-700 text-neutral-400 px-4 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          }
        >
          {testStatus.status === "testing" ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {/* Save feedback */}
      {saveStatus.status === "saved" && (
        <p className="text-xs text-emerald-400">Settings saved.</p>
      )}
      {saveStatus.status === "error" && (
        <p className="text-xs text-red-400">{saveStatus.message}</p>
      )}

      {/* Test feedback */}
      {testStatus.status === "ok" && (
        <p className="text-xs text-emerald-400">✓ {testStatus.message}</p>
      )}
      {testStatus.status === "error" && (
        <p className="text-xs text-red-400">✗ {testStatus.message}</p>
      )}
    </div>
  );
}
