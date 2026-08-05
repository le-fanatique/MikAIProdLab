"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  src: string;
  alt: string;
  previewSize?: number;
  children: React.ReactNode;
  className?: string;
  /**
   * Retake Round 1 (Codex P2) — explicit, opt-in accessible contract: set
   * `true` when `children` contains NO focusable descendant and no
   * ancestor already forwards focus here (a bare `<img>`, a decorative
   * chip, etc.) — the wrapper itself then becomes the keyboard target
   * (`tabIndex={0}`), so "hover or focus opens the same preview" holds even
   * with nothing else to focus. Leave `false` (default, unchanged
   * behavior) when `children`/an ancestor is already independently
   * focusable (a real `<button>`/`<a>`) — the two would otherwise become
   * two separate tab stops for the same visual thumbnail.
   */
  focusable?: boolean;
};

export default function ThumbnailHoverPreview({
  src,
  alt,
  previewSize = 160,
  children,
  className,
  focusable = false,
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
    <div
      ref={wrapRef}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      // UX.MEDIA.PREVIEW.1 — keyboard focus opens the same popup as mouse
      // hover (React's onFocus/onBlur here behave like native
      // focusin/focusout: they bubble from any focusable descendant, e.g. a
      // wrapped <button>/<a>, without this wrapper itself needing
      // tabIndex). onBlur only hides when focus actually leaves this
      // wrapper — not when it merely moves between two focusable
      // descendants of the SAME thumbnail (relatedTarget still inside).
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
      className={className}
    >
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
