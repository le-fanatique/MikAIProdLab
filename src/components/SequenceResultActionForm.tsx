"use client";

type Props = {
  action: () => Promise<void>;
  label: string;
  className?: string;
  confirmMessage?: string;
};

/** Minimal confirm-optional form-action button, for low-risk/reversible Sequence Result actions (Set Active, Archive) that don't warrant DeleteButton's always-confirm behavior. */
export default function SequenceResultActionForm({ action, label, className, confirmMessage }: Props) {
  return (
    <form
      action={async () => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        await action();
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
