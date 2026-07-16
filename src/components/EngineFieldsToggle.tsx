"use client";

// ---------------------------------------------------------------------------
// EngineFieldsToggle.tsx — SEQGEN.STORYBOARD.EXTRACT.1-FIX6
//
// Progressive enhancement only: without JS, every advanced field stays
// enabled and is simply ignored server-side if irrelevant to the chosen
// engine (the worker never uses a Canny-only flag under `otsu`/`grid`).
// With JS, disables (grays out, `disabled`) any field tagged
// `data-engine-only="canny"` / `data-engine-only="otsu"` when the currently
// selected `name="engine"` radio doesn't match — never hides them (the
// values stay visible/readable, just non-interactive), so the ticket's "En
// Exact Grid, masquer/desactiver les controles Canny/Otsu sans pretendre les
// utiliser" is satisfied without ever submitting a value the worker would
// silently discard.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export default function EngineFieldsToggle({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const apply = () => {
      const selected = form.querySelector<HTMLInputElement>('input[name="engine"]:checked')?.value ?? "canny";
      const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-engine-only]");
      fields.forEach((el) => {
        const only = el.getAttribute("data-engine-only");
        const relevant = !only || only.split(/\s+/).includes(selected);
        el.disabled = !relevant;
        el.classList.toggle("opacity-40", !relevant);
      });
    };

    apply();
    const radios = form.querySelectorAll<HTMLInputElement>('input[name="engine"]');
    radios.forEach((r) => r.addEventListener("change", apply));
    return () => radios.forEach((r) => r.removeEventListener("change", apply));
  }, [formId]);

  return null;
}
