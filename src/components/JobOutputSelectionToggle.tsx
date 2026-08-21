"use client";

import { useState } from "react";

/**
 * GEN.MULTIOUT.1 — the one control in the outputs gallery that needs
 * JavaScript.
 *
 * The checkboxes themselves stay **uncontrolled** (`defaultChecked`): there is
 * no DOM test harness in this repository, so the less state the gallery holds
 * the less of it can only be verified in a browser. This component owns a
 * single boolean — which word to show — and reads the real checkbox states
 * from the form on click rather than mirroring them.
 *
 * Without JavaScript the button is inert and every box stays ticked, which is
 * the default the user asked for.
 */
export default function JobOutputSelectionToggle({ formId }: { formId: string }) {
  const [allSelected, setAllSelected] = useState(true);

  function toggle() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const boxes = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="outputIndex"]')
    );
    if (boxes.length === 0) return;

    // The DOM is the source of truth: the user may have ticked boxes by hand
    // since the last click, so deciding from local state alone could produce a
    // button that does the opposite of what it says.
    const next = boxes.some((box) => !box.checked);
    for (const box of boxes) box.checked = next;
    setAllSelected(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors underline underline-offset-2"
    >
      {allSelected ? "Unselect all" : "Select all"}
    </button>
  );
}
