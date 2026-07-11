"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFilmResultDraftFromActiveSequenceResults } from "@/actions/filmResults";

type Props = {
  projectId: number;
};

export default function CreateFilmResultDraftButton({ projectId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  function handleCreate() {
    setResult(null);
    startTransition(async () => {
      const res = await createFilmResultDraftFromActiveSequenceResults(projectId);
      if (res.ok) {
        setResult({ ok: true, message: "Film Result draft created.", warnings: res.warnings });
        router.refresh();
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? "Creating…" : "Create Film Result Draft"}
      </button>
      {result && (
        <div className={`text-xs text-right ${result.ok ? "text-[#6b9e72]" : "text-[#cf7b6b]"}`}>
          {result.message}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[#cda24f] text-left">
              {result.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
