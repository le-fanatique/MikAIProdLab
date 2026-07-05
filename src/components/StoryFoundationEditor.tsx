"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveProjectStoryFoundation } from "@/actions/projects";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

function appendText(current: string, addition: string): string {
  return current.trim() ? `${current}\n\n${addition}` : addition;
}

type Props = {
  projectId: number;
  initialPitch: string | null;
  initialStory: string | null;
  initialDescription: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function StoryFoundationEditor({
  projectId,
  initialPitch,
  initialStory,
  initialDescription,
}: Props) {
  const router = useRouter();
  const [pitch, setPitch] = useState(initialPitch ?? "");
  const [story, setStory] = useState(initialStory ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => { setPitch(initialPitch ?? ""); }, [initialPitch]);
  useEffect(() => { setStory(initialStory ?? ""); }, [initialStory]);
  useEffect(() => { setDescription(initialDescription ?? ""); }, [initialDescription]);

  const handleChange = () => {
    if (saveState === "saved" || saveState === "error") setSaveState("idle");
  };

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    setErrorMessage(null);
    const fd = new FormData();
    fd.set("pitch", pitch);
    fd.set("story", story);
    fd.set("description", description);
    const result = await saveProjectStoryFoundation(projectId, fd);
    if (result.ok) {
      setSaveState("saved");
      router.refresh();
      setTimeout(() => setSaveState("idle"), 2500);
    } else {
      setSaveState("error");
      setErrorMessage(result.error);
    }
  }, [projectId, pitch, story, description, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
          Pitch
        </label>
        <textarea
          value={pitch}
          onChange={(e) => { setPitch(e.target.value); handleChange(); }}
          rows={3}
          placeholder="A short logline or creative pitch…"
          className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-3 py-2.5 leading-relaxed resize-y focus:outline-none focus:border-[#3a4046]"
        />
        <TextFieldTranslationButton
          getSourceText={() => pitch}
          onReplace={(t) => { setPitch(t); handleChange(); }}
          onAppend={(t) => { setPitch(appendText(pitch, t)); handleChange(); }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
          Story
        </label>
        <textarea
          value={story}
          onChange={(e) => { setStory(e.target.value); handleChange(); }}
          rows={7}
          placeholder="The full narrative — world, characters, arc…"
          className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-3 py-2.5 leading-relaxed resize-y focus:outline-none focus:border-[#3a4046]"
        />
        <TextFieldTranslationButton
          getSourceText={() => story}
          onReplace={(t) => { setStory(t); handleChange(); }}
          onAppend={(t) => { setStory(appendText(story, t)); handleChange(); }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#4b5158]">
          Project Notes
        </label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); handleChange(); }}
          rows={3}
          placeholder="Internal notes, references, constraints…"
          className="w-full rounded border border-[#2c3035] bg-[#141618] text-sm text-[#e7e9ec] placeholder-[#3a4046] px-3 py-2.5 leading-relaxed resize-y focus:outline-none focus:border-[#3a4046]"
        />
        <TextFieldTranslationButton
          getSourceText={() => description}
          onReplace={(t) => { setDescription(t); handleChange(); }}
          onAppend={(t) => { setDescription(appendText(description, t)); handleChange(); }}
        />
      </div>

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
          {saveState === "saving" ? "Saving…" : "Save Story Foundation"}
        </button>
        {saveState === "saved" && (
          <span className="text-xs text-[#6e767d]">Saved.</span>
        )}
        {saveState === "error" && errorMessage && (
          <span className="text-xs text-[#cf7b6b]">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}
