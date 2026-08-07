"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishBasicSequenceResult } from "@/actions/basicEditorial";
import {
  DEFAULT_VIDEO_SOURCE_MODE,
  videoSourceModeLabel,
  type VideoSourceMode,
} from "@/lib/editorial/videoSourceModeShared";

type Props = {
  projectId: number;
  sequenceId: number;
  /**
   * EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — optional so the Sequence Detail
   * page's own copy of this button (no segmented control, no mode concept)
   * keeps behaving exactly as before: omitted, it defaults to
   * `"approved-only"`, byte-identical to this component's pre-existing
   * behavior.
   */
  videoSourceMode?: VideoSourceMode;
};

export default function PublishBasicSequenceResultButton({
  projectId,
  sequenceId,
  videoSourceMode = DEFAULT_VIDEO_SOURCE_MODE,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  // EDITORIAL.SEQUENCE.RESULT.SOURCES.1 — synchronous lock acquired BEFORE
  // the first `await`, so a double click (both firing inside the same
  // render tick, before React has re-rendered `isPending`'s disabled state)
  // can only ever start one publish. `isPending` alone is not sufficient:
  // it only takes effect on the NEXT render, which is exactly the window a
  // fast double click lands in.
  const publishInFlightRef = useRef(false);

  const modeLabel = videoSourceModeLabel(videoSourceMode);

  function handlePublish() {
    if (publishInFlightRef.current) return;

    if (
      !window.confirm(
        `Publish a new Basic Sequence Result using "${modeLabel}" sources from the current editorial order?`
      )
    ) {
      return;
    }

    publishInFlightRef.current = true;
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await publishBasicSequenceResult(projectId, sequenceId, { setActive: true, videoSourceMode });
        if (result.ok) {
          setStatus({
            ok: true,
            message: `Sequence Result published with "${modeLabel}" sources (${result.durationSeconds.toFixed(1)}s).`,
            warnings: result.warnings,
          });
          router.refresh();
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        // Transport/unexpected failure — a sanitized, generic message only;
        // never the raw error (could leak stack/internal detail), and never
        // auto-retried.
        setStatus({ ok: false, message: "Publish failed due to a connection or server error. Please try again." });
      } finally {
        publishInFlightRef.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending}
        className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start"
      >
        {isPending ? "Publishing…" : `Publish Basic Sequence Result (${modeLabel})`}
      </button>

      {status && (
        <div className={`text-xs ${status.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
          {status.message}
          {status.warnings && status.warnings.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[#cda24f]">
              {status.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
