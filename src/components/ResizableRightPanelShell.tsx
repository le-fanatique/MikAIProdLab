"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const STORAGE_KEY = "mikai.rightPanelWidth";

function clampWidth(value: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
}

type Props = {
  children: React.ReactNode;
};

export default function ResizableRightPanelShell({ children }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Read persisted width on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
          setWidth(n);
        }
      }
    } catch {
      // localStorage unavailable
    }
    setHasMounted(true);
  }, []);

  // Persist width changes
  useEffect(() => {
    if (!hasMounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // localStorage unavailable
    }
  }, [width, hasMounted]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextWidth = clampWidth(window.innerWidth - e.clientX);
      setWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  return (
    <aside
      className="relative shrink-0 border-l border-[#232629] bg-[#141618] overflow-y-auto py-4"
      style={{ width }}
    >
      {/* Drag handle on left edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        title="Drag to resize panel"
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors ${
          isResizing ? "bg-[#5b93d6]/40" : "bg-transparent hover:bg-[#5b93d6]/30"
        }`}
      />

      {children}
    </aside>
  );
}