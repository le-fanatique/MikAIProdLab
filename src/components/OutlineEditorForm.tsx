"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveProjectOutline } from "@/actions/projects";

type Props = {
  projectId: number;
  initialOutline: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function OutlineEditorForm({ projectId, initialOutline }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialOutline ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    setErrorMessage(null);
    const result = await saveProjectOutline(projectId, text);
    if (result.ok) {
      setSaveState("saved");
      router.refresh();
      setTimeout(() => setSaveState("idle"), 2000);
    } else {
      setSaveState("error");
      setErrorMessage(result.error);
    }
  }, [projectId, text, router]);

  const isEmpty = !text.trim();

  return (
    <div className="flex flex-col gap-3">
      {isEmpty && (
        <p className="text-xs text-[#4b5158] italic">
          Generate a draft below or write your outline directly.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (saveState === "saved" || saveState === "error") setSaveState("idle");
        }}
        rows={16}
        placeholder={"## Opening — The Arrival\nEstablishing the world..."}
        className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-3 py-2.5 leading-relaxed resize-y focus:outline-none focus:border-[#3a4046] font-mono"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className={
            saveState === "saving"
              ? "rounded border border-[#2c3035] text-[#4b5158] px-4 py-1.5 text-sm cursor-not-allowed"
              : "rounded border border-[#2c3035] text-[#a4abb2] px-4 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          }
        >
          {saveState === "saving" ? "Saving..." : "Save Outline"}
        </button>

        {saveState === "saved" && (
          <span className="text-xs text-[#6e767d]">Saved.</span>
        )}
        {saveState === "error" && errorMessage && (
          <span className="text-xs text-red-400">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}
