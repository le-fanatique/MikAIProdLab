import { type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-[#2c3035] px-6 py-10 text-center">
      <p className="text-[#a4abb2] text-sm font-medium mb-1">{title}</p>
      {description && (
        <p className="text-[#6e767d] text-xs mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
