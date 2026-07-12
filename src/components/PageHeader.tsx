import { type ReactNode } from "react";

type Props = {
  title: string;
  badge?: ReactNode;
  meta?: string;
  actions?: ReactNode;
};

export default function PageHeader({ title, badge, meta, actions }: Props) {
  return (
    <div className="mikai-page-header flex items-start justify-between gap-4 mb-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[#e7e9ec]">{title}</h1>
          {badge}
        </div>
        {meta && <p className="text-xs text-[#6e767d]">{meta}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 mt-0.5">{actions}</div>
      )}
    </div>
  );
}
