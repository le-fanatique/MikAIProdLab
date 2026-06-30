"use client";

import { useMemo, useEffect, useState } from "react";

type Props = {
  models: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Settings only: current value was saved but is absent from the fetched list */
  savedNotInList?: boolean;
  /** Sidebar-style compact layout */
  compact?: boolean;
};

export default function ModelPickerWithFilter({
  models,
  value,
  onChange,
  disabled = false,
  savedNotInList = false,
  compact = false,
}: Props) {
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setFilter("");
  }, [models]);

  const filteredModels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, filter]);

  const filterActive = filter.trim() !== "";
  const selectedHidden =
    filterActive &&
    !!value &&
    models.includes(value) &&
    !filteredModels.includes(value);

  const showFilter = models.length > 0;

  const filterInputClass = compact
    ? "w-full bg-[#0d0e10] border border-[#232629] rounded px-1.5 py-0.5 text-[10px] text-[#a4abb2] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046] transition-colors"
    : "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors font-mono";

  const selectClass = compact
    ? "w-full bg-[#0d0e10] border border-[#232629] rounded px-1.5 py-0.5 text-[10px] text-[#a4abb2] focus:outline-none focus:border-[#3a4046] cursor-pointer"
    : "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] focus:outline-none focus:border-[#3a4046] transition-colors font-mono cursor-pointer";

  const countClass = compact
    ? "text-[9px] text-[#4b5158]"
    : "text-xs text-[#6e767d]";

  return (
    <div className="flex flex-col gap-1">
      {showFilter && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter models..."
          disabled={disabled}
          className={filterInputClass}
        />
      )}

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectClass}
      >
        {models.length === 0 && !savedNotInList && (
          <option value="">No models found</option>
        )}
        {savedNotInList && (
          <option value={value}>{value} — saved, not in list</option>
        )}
        {selectedHidden && (
          <option value={value}>{value} (current, hidden by filter)</option>
        )}
        {filteredModels.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {filterActive && models.length > 0 && (
        <p className={countClass}>
          {filteredModels.length === 0
            ? "No models found"
            : `${filteredModels.length} of ${models.length} models`}
        </p>
      )}
    </div>
  );
}
