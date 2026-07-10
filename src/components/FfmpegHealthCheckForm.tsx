"use client";

import { useState, useTransition } from "react";
import { checkBundledFfmpeg } from "@/actions/ffmpeg";
import type { FfmpegAvailability } from "@/lib/ffmpeg";

export default function FfmpegHealthCheckForm() {
  const [result, setResult] = useState<FfmpegAvailability | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCheck() {
    startTransition(async () => {
      const res = await checkBundledFfmpeg();
      setResult(res);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCheck}
          disabled={isPending}
          className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Checking…" : "Check FFmpeg"}
        </button>

        {result && (
          <span className={`text-xs font-medium ${result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
            {result.ok ? "OK" : "Failed"}
          </span>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-1.5 text-xs">
          <div>
            <span className="text-[#4b5158]">ffmpeg path </span>
            <span className="text-[#a4abb2] font-mono break-all">{result.ffmpegPath ?? "—"}</span>
          </div>
          <div>
            <span className="text-[#4b5158]">ffprobe path </span>
            <span className="text-[#a4abb2] font-mono break-all">{result.ffprobePath ?? "—"}</span>
          </div>
          {result.ffmpegVersion && (
            <div>
              <span className="text-[#4b5158]">ffmpeg version </span>
              <span className="text-[#a4abb2] font-mono">{result.ffmpegVersion}</span>
            </div>
          )}
          {result.ffprobeVersion && (
            <div>
              <span className="text-[#4b5158]">ffprobe version </span>
              <span className="text-[#a4abb2] font-mono">{result.ffprobeVersion}</span>
            </div>
          )}
          {result.error && <p className="text-[#cf7b6b] mt-1">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
