"use client";

import { useState, useTransition } from "react";
import { saveOpenReelSidecarUrl } from "@/actions/settings";

type Props = {
  initialUrl: string;
};

export default function OpenReelSidecarSettingsForm({ initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await saveOpenReelSidecarUrl(url);
      if (res.ok) {
        setUrl(res.value);
        setResult({ ok: true, message: "OpenReel Sidecar URL saved." });
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#a4abb2]" htmlFor="openreel-sidecar-url">
          OpenReel Sidecar URL
        </label>
        <input
          id="openreel-sidecar-url"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
          placeholder="http://127.0.0.1:5173"
          className="rounded border border-[#2c3035] bg-[#0d0e10] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:border-[#3a4046] focus:outline-none transition-colors"
        />
        <p className="text-xs text-[#4b5158]">
          URL used by MikAI to open the OpenReel advanced editor. Use a full URL, including protocol and port.
        </p>
        <p className="text-xs text-[#4b5158]">
          For a server/Tailscale setup, use the URL reachable from your browser (e.g. a tailnet address or MagicDNS name), not the address MikAI's server sees internally.
        </p>
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
          <p className={`text-xs ${result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
