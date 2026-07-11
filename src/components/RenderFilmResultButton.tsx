"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishFilmResultFromActiveSequenceResults } from "@/actions/filmPublish";

type Props = {
  projectId: number;
  /** Whether a Film Result already exists for this project — swaps the label/wording to read as a re-render rather than a first render. */
  hasExistingFilmResult: boolean;
  /** Sequences that currently have no active/non-outdated Sequence Result — surfaced in the confirm dialog so the user knows the render would be incomplete before triggering it. */
  missingOrOutdatedCount: number;
  totalSequenceCount: number;
};

export default function RenderFilmResultButton({
  projectId,
  hasExistingFilmResult,
  missingOrOutdatedCount,
  totalSequenceCount,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  const label = hasExistingFilmResult ? "Render Again" : "Render Film Result";

  function handleRender() {
    const lines = ["Render a new Film Result from the current active Sequence Results?"];
    if (missingOrOutdatedCount > 0) {
      lines.push(
        `Warning: ${missingOrOutdatedCount} of ${totalSequenceCount} sequence${totalSequenceCount === 1 ? "" : "s"} ${missingOrOutdatedCount === 1 ? "has" : "have"} no active result — the Film Result will be incomplete.`
      );
    }
    if (!window.confirm(lines.join("\n\n"))) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const result = await publishFilmResultFromActiveSequenceResults(projectId, { setActive: true });
      if (result.ok) {
        setStatus({ ok: true, message: "Film Result rendered.", warnings: result.warnings });
        router.refresh();
      } else {
        setStatus({ ok: false, message: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleRender}
        disabled={isPending}
        className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? "Rendering…" : label}
      </button>

      {status && (
        <div className={`text-xs text-right ${status.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
          {status.message}
          {status.warnings && status.warnings.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[#cda24f] text-left">
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
