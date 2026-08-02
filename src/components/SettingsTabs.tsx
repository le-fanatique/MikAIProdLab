"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type SettingsTab = {
  id: string;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: SettingsTab[];
  initialTabId: string;
};

// Roving-tabindex ARIA tabs pattern, matching
// InfluenceResearchWorkspace.tsx. Every panel stays mounted at all times
// (only `hidden` toggles) so unsaved form values in an inactive tab survive
// a tab switch and back.
export default function SettingsTabs({ tabs, initialTabId }: Props) {
  const [activeId, setActiveId] = useState(
    tabs.some((t) => t.id === initialTabId) ? initialTabId : tabs[0]?.id
  );
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = (id: string) => {
    setActiveId(id);
    tabButtonRefs.current[id]?.focus();
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: string) => {
    const idx = tabs.findIndex((t) => t.id === current);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      focusTab(tabs[nextIdx].id);
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1.5 mb-6 pb-4 border-b border-[#232629] overflow-x-auto"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabButtonRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={activeId === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={activeId === t.id ? 0 : -1}
            onClick={() => focusTab(t.id)}
            onKeyDown={(e) => handleTabKeyDown(e, t.id)}
            className={`shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-xs transition-colors ${
              activeId === t.id
                ? "bg-[#141618] text-[#e7e9ec] border border-[#3a4046]"
                : "text-[#6e767d] hover:text-[#a4abb2] border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          id={`settings-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${t.id}`}
          tabIndex={0}
          hidden={activeId !== t.id}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
