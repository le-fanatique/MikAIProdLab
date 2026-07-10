"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishBasicSequenceResult } from "@/actions/basicEditorial";

type Props = {
  projectId: number;
  sequenceId: number;
};

export default function PublishBasicSequenceResultButton({ projectId, sequenceId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  function handlePublish() {
    if (
      !window.confirm(
        "Publish a new Basic Sequence Result from the current editorial order?"
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const result = await publishBasicSequenceResult(projectId, sequenceId, { setActive: true });
      if (result.ok) {
        setStatus({
          ok: true,
          message: `Sequence Result published (${result.durationSeconds.toFixed(1)}s).`,
          warnings: result.warnings,
        });
        router.refresh();
      } else {
        setStatus({ ok: false, message: result.error });
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
        {isPending ? "Publishing…" : "Publish Basic Sequence Result"}
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
