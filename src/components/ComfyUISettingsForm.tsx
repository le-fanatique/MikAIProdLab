"use client";

import { useState, useTransition } from "react";
import { saveComfySettings, testComfyConnection } from "@/actions/settings";
import type { RuntimeProvider } from "@/lib/comfy/runtimeProvider";

type Props = {
  initialProvider: RuntimeProvider;
  initialBaseUrl: string;
  initialHasApiKey: boolean;
  initialLocalVramAutoManagement: boolean;
  cloudBaseUrl: string;
};

const inputClass =
  "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors";

export default function ComfyUISettingsForm({
  initialProvider,
  initialBaseUrl,
  initialHasApiKey,
  initialLocalVramAutoManagement,
  cloudBaseUrl,
}: Props) {
  const [provider, setProvider] = useState<RuntimeProvider>(initialProvider);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);

  // CAMLAB.POLISH.1 retake — single canonical key, serving both the Partner
  // Node billing key (extra_data.api_key_comfy_org, local + Cloud) and Comfy
  // Cloud's own X-API-Key auth. Never pre-filled with the real value; only a
  // "configured" indicator until the user types a new one.
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  const [localVramAutoManagement, setLocalVramAutoManagement] = useState(initialLocalVramAutoManagement);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    const res = await testComfyConnection(provider, baseUrl, apiKeyTouched ? apiKey : "");
    setTestResult({ ok: res.ok, message: res.ok ? res.message : res.error });
    setIsTesting(false);
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveComfySettings(
        provider,
        baseUrl,
        apiKeyTouched ? apiKey : "",
        apiKeyTouched ? "replace" : "keep",
        localVramAutoManagement
      );
      if (res.ok) {
        setResult({ ok: true, message: "ComfyUI settings saved." });
        setHasApiKey(apiKeyTouched ? apiKey.trim().length > 0 : hasApiKey);
        setApiKey("");
        setApiKeyTouched(false);
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#a4abb2]" htmlFor="comfyui-provider">
          Runtime
        </label>
        <select
          id="comfyui-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as RuntimeProvider);
            setResult(null);
            setTestResult(null);
          }}
          className={inputClass + " cursor-pointer"}
        >
          <option value="local">Local ComfyUI</option>
          <option value="cloud">Comfy Cloud</option>
        </select>
        <p className="text-xs text-[#4b5158]">
          Only new generations use this setting — jobs already queued keep the
          runtime they were started with.
        </p>
      </div>

      {provider === "local" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#a4abb2]" htmlFor="comfyui-base-url">
            Base URL
          </label>
          <input
            id="comfyui-base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setResult(null);
            }}
            placeholder="http://127.0.0.1:8188"
            className={inputClass}
          />
          <p className="text-xs text-[#4b5158]">
            Local ComfyUI server used for workflow generation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#a4abb2]">Base URL</label>
          <input type="text" value={cloudBaseUrl} disabled readOnly className={inputClass + " opacity-60"} />
          <p className="text-xs text-[#4b5158]">Comfy Cloud's endpoint is fixed and not editable.</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#a4abb2]" htmlFor="comfyui-api-key">
            Comfy.org API Key for Partner Nodes
          </label>
          {hasApiKey && !apiKeyTouched && (
            <span className="text-[10px] text-[#6b9e72]">Key saved</span>
          )}
        </div>
        <input
          id="comfyui-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setApiKeyTouched(true);
            setResult(null);
            setTestResult(null);
          }}
          placeholder={hasApiKey ? "•••• (unchanged)" : provider === "cloud" ? "Required for Comfy Cloud" : "Optional ComfyUI API key"}
          className={inputClass}
        />
        <p className="text-xs text-[#4b5158]">
          {provider === "cloud"
            ? "Required for Comfy Cloud. Sent as X-API-Key on every Comfy Cloud request, and as the Partner Node billing key (e.g. Gemini/GPT image nodes) via extra_data. Get it from your platform.comfy.org profile."
            : "Optional. Billing key for Partner Nodes (e.g. Gemini/GPT image nodes), sent via extra_data for Local submissions. The same key also authenticates Comfy Cloud if you switch runtime."}
        </p>
      </div>

      {provider === "local" && (
        <div className="flex items-start gap-3">
          <input
            id="comfyui-local-vram-auto"
            type="checkbox"
            checked={localVramAutoManagement}
            onChange={(e) => {
              setLocalVramAutoManagement(e.target.checked);
              setResult(null);
            }}
            className="mt-0.5 rounded border border-[#2c3035] bg-[#0d0e10] accent-[#5b93d6] cursor-pointer"
          />
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="comfyui-local-vram-auto"
              className="text-xs font-medium text-[#a4abb2] cursor-pointer select-none"
            >
              Auto manage local VRAM between ComfyUI and Ollama
            </label>
            <p className="text-xs text-[#4b5158]">
              When enabled, MikAI unloads the inactive local runtime before starting a local Ollama request or a ComfyUI generation.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </button>

          {result && (
            <p className={`text-xs ${result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
              {result.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || isPending}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isTesting ? "Testing..." : `Test ${provider === "cloud" ? "Comfy Cloud" : "ComfyUI"} Connection`}
          </button>

          {testResult && (
            <p className={`text-xs ${testResult.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
              {testResult.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
