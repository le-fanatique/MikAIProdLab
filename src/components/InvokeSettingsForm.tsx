"use client";

import { useState, useTransition } from "react";
import { saveInvokeBaseUrl, saveInvokePublicBaseUrl, testInvokeConnection } from "@/actions/settings";

type Props = {
  initialUrl: string;
  /** INVOKE.PUSH.1-FIX1 — the raw stored public URL, empty when unset (the single-machine case). */
  initialPublicUrl: string;
};

export default function InvokeSettingsForm({ initialUrl, initialPublicUrl }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [publicUrl, setPublicUrl] = useState(initialPublicUrl);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();

  function handleSave() {
    startSaveTransition(async () => {
      const res = await saveInvokeBaseUrl(url);
      if (!res.ok) {
        setSaveResult({ ok: false, message: res.error });
        return;
      }
      setUrl(res.value);

      const publicRes = await saveInvokePublicBaseUrl(publicUrl);
      if (!publicRes.ok) {
        setSaveResult({ ok: false, message: publicRes.error });
        return;
      }
      setPublicUrl(publicRes.value);
      setSaveResult({ ok: true, message: "Invoke URLs saved." });
    });
  }

  function handleTest() {
    startTestTransition(async () => {
      const res = await testInvokeConnection();
      setTestResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#a4abb2]" htmlFor="invoke-base-url">
          Invoke URL
        </label>
        <input
          id="invoke-base-url"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaveResult(null);
          }}
          placeholder="http://127.0.0.1:9090"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors"
        />
        <p className="text-xs text-[#4b5158]">
          URL used by MikAI to push images to the InvokeAI image editor. Use a full URL, including protocol and
          port.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#a4abb2]" htmlFor="invoke-public-base-url">
          Invoke URL for the browser (optional)
        </label>
        <input
          id="invoke-public-base-url"
          type="text"
          value={publicUrl}
          onChange={(e) => {
            setPublicUrl(e.target.value);
            setSaveResult(null);
          }}
          placeholder="Leave empty when Invoke runs on this machine"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors"
        />
        <p className="text-xs text-[#4b5158]">
          Only needed when you use MikAI from another machine. The field above is the URL the MikAI server
          calls; this one is the URL your browser opens after a push. Leave it empty and both are the same.
        </p>
        <p className="text-xs text-[#4b5158]">
          A tunnel exposing Invoke is public and unauthenticated: anyone with the link controls your Invoke
          instance. Prefer a private network, and close the tunnel when you are done.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isTesting ? "Testing…" : "Test Connection"}
        </button>

        {saveResult && (
          <p className={`text-xs ${saveResult.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>{saveResult.message}</p>
        )}
      </div>

      {testResult && (
        <p className={`text-xs ${testResult.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>{testResult.message}</p>
      )}
    </div>
  );
}
