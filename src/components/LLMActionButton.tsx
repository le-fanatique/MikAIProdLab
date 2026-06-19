type Props = {
  label: string;
  hint?: string;
};

export default function LLMActionButton({ label, hint }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled
        className="rounded border border-neutral-800 text-neutral-700 px-4 py-2 text-sm opacity-50 cursor-not-allowed self-start"
      >
        {label} — Coming soon
      </button>
      {hint && (
        <p className="text-xs text-neutral-700">{hint}</p>
      )}
    </div>
  );
}
