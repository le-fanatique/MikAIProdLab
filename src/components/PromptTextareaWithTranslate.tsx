"use client";

import { useState } from "react";
import TextFieldTranslationButton from "@/components/TextFieldTranslationButton";

type Props = {
  name: string;
  initialValue: string;
  rows?: number;
  placeholder?: string;
  id?: string;
  className?: string;
};

/**
 * Controlled textarea with a Translate button, for use inside server-action
 * forms. Keeps the given `name` so the surrounding form submit is unchanged —
 * translation only updates the local value that will be submitted.
 */
export default function PromptTextareaWithTranslate({
  name,
  initialValue,
  rows = 4,
  placeholder,
  id,
  className,
}: Props) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={
          className ??
          "w-full rounded border border-[#2c3035] bg-[#141618] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#4b5158] resize-y focus:outline-none focus:border-[#3a4046] leading-relaxed"
        }
      />
      <TextFieldTranslationButton
        getSourceText={() => value}
        onReplace={(t) => setValue(t)}
        onAppend={(t) => setValue(value.trim() ? `${value}\n\n${t}` : t)}
      />
    </div>
  );
}
