"use client";

type Props = {
  action: () => Promise<void>;
  confirm?: string;
  label?: string;
  className?: string;
};

export default function DeleteButton({
  action,
  confirm: confirmMsg = "Are you sure?",
  label = "Delete",
  className,
}: Props) {
  return (
    <form
      action={async () => {
        if (!window.confirm(confirmMsg)) return;
        await action();
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
