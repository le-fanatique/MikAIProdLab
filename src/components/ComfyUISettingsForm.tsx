"use client";

import { useRef, useState, useTransition } from "react";
import { saveComfySettings, testComfyConnection, mutateComfyLocalPresets } from "@/actions/settings";
import type { RuntimeProvider } from "@/lib/comfy/runtimeProvider";
import type { ComfyLocalPresetsDocument } from "@/lib/comfy/comfyLocalPresets";

type Props = {
  initialProvider: RuntimeProvider;
  initialBaseUrl: string;
  initialHasApiKey: boolean;
  initialLocalVramAutoManagement: boolean;
  cloudBaseUrl: string;
  initialLocalPresets: ComfyLocalPresetsDocument;
  /** True when the stored presets row exists but failed validation — Add/Edit/Delete are disabled and this is shown explicitly rather than silently presenting an empty list. */
  initialLocalPresetsCorrupted: boolean;
};

const inputClass =
  "rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors";

export default function ComfyUISettingsForm({
  initialProvider,
  initialBaseUrl,
  initialHasApiKey,
  initialLocalVramAutoManagement,
  cloudBaseUrl,
  initialLocalPresets,
  initialLocalPresetsCorrupted,
}: Props) {
  const [provider, setProvider] = useState<RuntimeProvider>(initialProvider);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);

  const [presetsDoc, setPresetsDoc] = useState<ComfyLocalPresetsDocument>(initialLocalPresets);
  const [presetsCorrupted, setPresetsCorrupted] = useState(initialLocalPresetsCorrupted);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUrl, setEditingUrl] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetPending, setPresetPending] = useState(false);
  // Synchronous guard against a double-activation racing two mutations with
  // the same revision — `presetPending` (React state) only reflects reality
  // after the next render, which is too late to stop a second synchronous
  // click handler invocation from starting a second request.
  const presetBusyRef = useRef(false);

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

  async function handleAddPreset() {
    if (presetBusyRef.current) return; // synchronous guard — blocks a second click before the first request even starts
    presetBusyRef.current = true;
    setPresetPending(true);
    setPresetError(null);
    try {
      const res = await mutateComfyLocalPresets({ type: "add", name: newPresetName, baseUrl }, presetsDoc.revision);
      if (res.ok) {
        setPresetsDoc(res.document);
        setPresetsCorrupted(false);
        setNewPresetName("");
      } else {
        if (res.document) setPresetsDoc(res.document);
        setPresetError(res.error);
      }
    } catch (err) {
      // Transport/network rejection — never leaves the UI silently stuck;
      // the draft (name/URL fields) is untouched so the user can retry.
      setPresetError(err instanceof Error ? err.message : "Network error while saving the preset. Please try again.");
    } finally {
      presetBusyRef.current = false;
      setPresetPending(false);
    }
  }

  function beginEditPreset(id: string, name: string, url: string) {
    setEditingPresetId(id);
    setEditingName(name);
    setEditingUrl(url);
    setPresetError(null);
  }

  async function handleSaveEditPreset() {
    if (!editingPresetId || presetBusyRef.current) return;
    presetBusyRef.current = true;
    setPresetPending(true);
    setPresetError(null);
    try {
      const res = await mutateComfyLocalPresets(
        { type: "rename", id: editingPresetId, name: editingName, baseUrl: editingUrl },
        presetsDoc.revision
      );
      if (res.ok) {
        setPresetsDoc(res.document);
        setPresetsCorrupted(false);
        setEditingPresetId(null);
      } else {
        if (res.document) setPresetsDoc(res.document);
        setPresetError(res.error);
      }
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Network error while saving the preset. Please try again.");
    } finally {
      presetBusyRef.current = false;
      setPresetPending(false);
    }
  }

  async function handleDeletePreset(id: string) {
    if (presetBusyRef.current) return;
    presetBusyRef.current = true;
    setPresetPending(true);
    setPresetError(null);
    try {
      const res = await mutateComfyLocalPresets({ type: "delete", id }, presetsDoc.revision);
      if (res.ok) {
        setPresetsDoc(res.document);
        setPresetsCorrupted(false);
        if (editingPresetId === id) setEditingPresetId(null);
      } else {
        if (res.document) setPresetsDoc(res.document);
        setPresetError(res.error);
      }
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Network error while deleting the preset. Please try again.");
    } finally {
      presetBusyRef.current = false;
      setPresetPending(false);
    }
  }

  function handleSelectPreset(url: string) {
    // Fills the draft Base URL only — the active runtime setting only
    // changes once the user clicks "Save Changes" below.
    setBaseUrl(url);
    setResult(null);
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

          <div className="mt-2 flex flex-col gap-2 rounded border border-[#2c3035] p-3">
            <p className="text-xs font-medium text-[#a4abb2]">Local endpoint presets</p>

            {presetsCorrupted && (
              <p className="text-xs text-[#cf7b6b]">
                Stored presets could not be read (corrupted data). Adding, renaming and deleting are disabled until
                this is resolved — your active Base URL above is unaffected.
              </p>
            )}

            {presetsDoc.presets.length === 0 ? (
              <p className="text-xs text-[#4b5158]">No saved presets yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {presetsDoc.presets.map((preset) =>
                  editingPresetId === preset.id ? (
                    <li key={preset.id} className="flex flex-col gap-1.5 rounded border border-[#3a4046] p-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className={inputClass}
                        placeholder="Preset name"
                        aria-label="Preset name"
                      />
                      <input
                        type="text"
                        value={editingUrl}
                        onChange={(e) => setEditingUrl(e.target.value)}
                        className={inputClass}
                        placeholder="http://127.0.0.1:8188"
                        aria-label="Preset Base URL"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEditPreset}
                          disabled={presetPending || presetsCorrupted}
                          className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40"
                        >
                          Save preset
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPresetId(null)}
                          disabled={presetPending || presetsCorrupted}
                          className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    </li>
                  ) : (
                    <li key={preset.id} className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(preset.baseUrl)}
                        className="min-w-0 flex-1 truncate text-left text-[#e7e9ec] hover:text-[#5b93d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5b93d6]"
                        title={preset.baseUrl}
                      >
                        {preset.name} <span className="text-[#4b5158]">— {preset.baseUrl}</span>
                      </button>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => beginEditPreset(preset.id, preset.name, preset.baseUrl)}
                          disabled={presetPending || presetsCorrupted}
                          className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1 hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset.id)}
                          disabled={presetPending || presetsCorrupted}
                          className="rounded border border-[#2c3035] text-[#cf7b6b] px-2 py-1 hover:border-[#3a4046] transition-colors disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name"
                aria-label="New preset name"
                className={inputClass + " flex-1"}
              />
              <button
                type="button"
                onClick={handleAddPreset}
                disabled={presetPending || presetsCorrupted || presetsDoc.presets.length >= 20}
                className="rounded border border-[#2c3035] text-[#a4abb2] px-2 py-1.5 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save current URL as preset
              </button>
            </div>
            <p className="text-xs text-[#4b5158]">
              Selecting a preset fills the Base URL above. Nothing becomes active until you click Save Changes.
            </p>
            {presetError && <p className="text-xs text-[#cf7b6b]">{presetError}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#a4abb2]">Base URL</label>
          <input type="text" value={cloudBaseUrl} disabled readOnly className={inputClass + " opacity-60"} />
          <p className="text-xs text-[#4b5158]">Comfy Cloud&apos;s endpoint is fixed and not editable.</p>
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
