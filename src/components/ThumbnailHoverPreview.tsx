"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  src: string;
  alt: string;
  previewSize?: number;
  children: React.ReactNode;
  className?: string;
};

export default function ThumbnailHoverPreview({
  src,
  alt,
  previewSize = 160,
  children,
  className,
}: Props) {
  const [preview, setPreview] = useState<{ x: number; y: number; size: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;

    // Clamp to 80% of viewport so large previewSize values never overflow
    const size = Math.min(previewSize, Math.floor(vw * 0.8), Math.floor(vh * 0.8));

    // Prefer right side, fall back to left if not enough space
    let x = rect.right + gap;
    if (x + size > vw - 4) x = rect.left - size - gap;
    // Final clamp in case both sides are tight
    x = Math.max(4, Math.min(x, vw - size - 4));

    // Align top with thumbnail, clamp to viewport
    let y = rect.top;
    if (y + size > vh - 4) y = vh - size - 4;
    y = Math.max(4, y);

    setPreview({ x, y, size });
  }, [previewSize]);

  const hide = useCallback(() => setPreview(null), []);

  return (
    <div ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} className={className}>
      {children}
      {preview !== null && (
        <div
          style={{
            position: "fixed",
            left: preview.x,
            top: preview.y,
            width: preview.size,
            height: preview.size,
            zIndex: 9999,
            pointerEvents: "none",
          }}
          className="rounded border border-[#2c3035] bg-[#141618] shadow-xl overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="w-full h-full object-contain" />
        </div>
      )}
    </div>
  );
}
