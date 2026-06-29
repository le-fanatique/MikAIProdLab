"use client";

import { useState, useTransition } from "react";
import { saveComfySettings } from "@/actions/settings";

type Props = {
  initialBaseUrl: string;
  initialApiKey: string;
  initialLocalVramAutoManagement: boolean;
};

export default function ComfyUISettingsForm({
  initialBaseUrl,
  initialApiKey,
  initialLocalVramAutoManagement,
}: Props) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [localVramAutoManagement, setLocalVramAutoManagement] = useState(initialLocalVramAutoManagement);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await saveComfySettings(baseUrl, apiKey, localVramAutoManagement);
      if (res.ok) {
        setResult({ ok: true, message: "ComfyUI settings saved." });
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
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
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors"
        />
        <p className="text-xs text-[#4b5158]">
          Local ComfyUI server used for workflow generation.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#a4abb2]" htmlFor="comfyui-api-key">
          API Key
        </label>
        <input
          id="comfyui-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setResult(null);
          }}
          placeholder="Optional ComfyUI API key"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors"
        />
        <p className="text-xs text-[#4b5158]">
          Optional. Used for ComfyUI API / partner nodes through extra_data.
        </p>
      </div>

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
          <p
            className={`text-xs ${
              result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"
            }`}
          >
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
