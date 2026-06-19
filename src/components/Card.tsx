import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export default function Card({ children, className = "", title }: Props) {
  return (
    <div className={`bg-[#1a1d20] border border-[#2c3035] rounded-lg p-5 ${className}`}>
      {title && (
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6e767d] mb-3">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
