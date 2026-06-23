"use client";

import { useState } from "react";

type Props = {
  promptText: string;
  action: (formData: FormData) => Promise<void>;
};

function excerpt(text: string, max: number): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

export default function SegmentInlinePromptEdit({ promptText, action }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(promptText);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group w-full text-left text-sm text-[#e7e9ec] hover:text-white transition-colors"
        title={promptText || "No prompt text — click to edit"}
      >
        {value.trim() ? (
          <span className="truncate block">{excerpt(value, 80)}</span>
        ) : (
          <span className="text-[#4b5158] italic group-hover:text-[#6e767d] transition-colors">
            No prompt text
          </span>
        )}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1.5 w-full">
      <textarea
        name="promptText"
        autoFocus
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded bg-[#0d0e10] border border-[#3a4046] px-2 py-1.5 text-sm text-[#e7e9ec] placeholder-[#4b5158] focus:outline-none focus:border-[#5b93d6] transition-colors resize-none"
        placeholder="Describe what the model should generate for this segment..."
      />
      <div className="flex gap-3">
        <button
          type="submit"
          className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(promptText);
            setEditing(false);
          }}
          className="text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
