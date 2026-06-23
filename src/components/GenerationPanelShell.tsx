"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 460;
const LS_KEY = "gen-panel-width";

type Props = {
  scrollKey: string;
  children: React.ReactNode;
};

export default function GenerationPanelShell({ scrollKey, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const ssKey = `gen-panel-scroll:${scrollKey}`;
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Read saved width from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w);
      }
    } catch {}
  }, []);

  // Restore panel scroll from sessionStorage on mount / scrollKey change
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    try {
      const saved = sessionStorage.getItem(ssKey);
      if (saved !== null) {
        const top = parseInt(saved, 10);
        requestAnimationFrame(() => {
          if (panelRef.current) panelRef.current.scrollTop = top;
        });
      }
    } catch {}
  }, [ssKey]);

  // Save panel scroll before any click / form submit inside the panel
  const saveScroll = useCallback(() => {
    if (!panelRef.current) return;
    try {
      sessionStorage.setItem(ssKey, String(panelRef.current.scrollTop));
    } catch {}
  }, [ssKey]);

  // Drag resize — skip on small screens
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (window.innerWidth < 640) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };

      function onMove(ev: MouseEvent) {
        if (!dragRef.current) return;
        // Drag left = widen panel (panel is on the right)
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
        setWidth(newW);
      }

      function onUp(ev: MouseEvent) {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
        try { localStorage.setItem(LS_KEY, String(newW)); } catch {}
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width]
  );

  const handleDoubleClick = useCallback(() => {
    if (window.innerWidth < 640) return;
    setWidth(DEFAULT_WIDTH);
    try { localStorage.setItem(LS_KEY, String(DEFAULT_WIDTH)); } catch {}
  }, []);

  return (
    <div
      className="gen-panel-shell shrink-0 bg-[#141618] fixed inset-0 z-50 sm:sticky sm:top-0 sm:inset-auto sm:z-10 sm:border-l sm:border-[#232629] sm:-mr-6 sm:flex sm:flex-row"
      style={{ "--panel-w": `${width}px` } as React.CSSProperties}
    >
      {/* Drag handle — sm+ only */}
      <div
        className="hidden sm:flex w-1 shrink-0 cursor-col-resize self-stretch bg-[#1a1d20] hover:bg-[#2c3035] transition-colors"
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClick}
        aria-hidden="true"
      />
      {/* Scrollable panel content */}
      <div
        ref={panelRef}
        className="flex-1 h-full min-w-0 overflow-y-auto overscroll-contain"
        onClickCapture={saveScroll}
        onSubmitCapture={saveScroll}
      >
        {children}
      </div>
    </div>
  );
}
