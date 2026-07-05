"use client";

type Props = {
  translation: string;
  onReplace: () => void;
  onAppend: () => void;
  onCopy: () => void;
  onCancel: () => void;
  copied?: boolean;
};

export default function TextTranslationPreviewPanel({
  translation,
  onReplace,
  onAppend,
  onCopy,
  onCancel,
  copied,
}: Props) {
  const actionButtonClass =
    "rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors";

  return (
    <div className="rounded border border-[#2c3035] bg-[#0d0e10] p-3 flex flex-col gap-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
        Translation Preview
      </p>
      <p className="text-sm text-[#e7e9ec] leading-relaxed whitespace-pre-wrap">
        {translation}
      </p>
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onReplace} className={actionButtonClass}>
          Replace
        </button>
        <button type="button" onClick={onAppend} className={actionButtonClass}>
          Append
        </button>
        <button type="button" onClick={onCopy} className={actionButtonClass}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2.5 py-1 text-xs text-[#4b5158] hover:text-[#6e767d] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
