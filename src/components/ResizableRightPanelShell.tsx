"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const WIDTH_STORAGE_KEY = "mikai.rightPanelWidth";
const COLLAPSED_STORAGE_KEY = "mikai.rightPanelCollapsed";
const PANEL_ID = "right-context-panel";

function clampWidth(value: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h15v9h-8l-4 3v-3h-3z" />
    </svg>
  );
}

type Props = {
  children: React.ReactNode;
};

/**
 * Shell for the whole Right Context Panel column (RightPanel content +
 * SidebarLLMChat, stacked together — see RightPanel.tsx). Collapsed by
 * default (UX.POLISH.4): the aside stays mounted at all times (children,
 * including SidebarLLMChat's own conversation/model/draft state, are never
 * unmounted) but toggles the native `hidden` attribute, which drops it out
 * of layout entirely — the column reserves zero width while collapsed. A
 * floating button reopens it; a Close button inside reopens... closes it.
 */
export default function ResizableRightPanelShell({ children }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Read persisted width + collapsed state on mount
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (savedWidth) {
        const n = parseInt(savedWidth, 10);
        if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
          setWidth(n);
        }
      }
      const savedCollapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      // Anything other than the literal string "false" keeps the default
      // (collapsed) — matches "collapsed by default" for first-time visitors
      // while still honoring a previously reopened panel.
      if (savedCollapsed === "false") {
        setCollapsed(false);
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
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch {
      // localStorage unavailable
    }
  }, [width, hasMounted]);

  // Persist collapsed changes
  useEffect(() => {
    if (!hasMounted) return;
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable
    }
  }, [collapsed, hasMounted]);

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
    <>
      {/* Floating reopen button — only rendered while collapsed, never
          simultaneously with the open column. */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-controls={PANEL_ID}
          aria-label="Open chat"
          title="Open chat"
          className="fixed bottom-6 right-6 z-30 flex items-center justify-center w-11 h-11 rounded-full border border-[#2c3035] text-[#a4abb2] shadow-lg hover:border-[#5b93d6]/50 hover:text-[#e7e9ec] transition-colors"
          style={{ backgroundColor: "var(--mikros-topbar, #141618)" }}
        >
          <ChatIcon />
        </button>
      )}

      <aside
        id={PANEL_ID}
        hidden={collapsed}
        aria-hidden={collapsed}
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

        {/* Close control */}
        <div className="flex justify-end px-3 mb-2">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-expanded={true}
            aria-controls={PANEL_ID}
            aria-label="Close chat"
            title="Close chat"
            className="text-[#4b5158] hover:text-[#a4abb2] text-sm leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {children}
      </aside>
    </>
  );
}
