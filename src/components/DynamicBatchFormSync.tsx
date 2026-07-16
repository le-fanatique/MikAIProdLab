"use client";

import { useEffect, useRef } from "react";
import { buildBatchKey } from "@/components/DynamicBatchImageList";

/**
 * DynamicBatchFormSync
 *
 * Renders a hidden input inside the Generate form that stays in sync with
 * the current URL searchParams. This solves the problem where a server-rendered
 * hidden input would become stale after the client-side DynamicBatchImageList
 * updates the URL via pushState().
 *
 * FIX (WFBUILD.1A.C): On each form submit, reads the latest batchImages_*
 * value from sessionStorage (written synchronously by DynamicBatchImageList
 * before router.replace finishes), guaranteeing the server action always
 * receives the current selection on the first click.
 *
 * FIX (WFBUILD.1B.B): sessionStorage key is now workflow-keyed to avoid
 * collisions when two different workflows share the same nodeId.
 *
 * FIX (SEQGEN.STORYBOARD.3-FIX5): `initialValue` lets a caller (the
 * Sequence Storyboard generate page, whose direct-repeatable-inputs mode
 * can auto-initialize a selection from `storyboardRefs` server-side —
 * SEQGEN.STORYBOARD.3-FIX3 — without that selection ever having been
 * pushed into the browser's own URL) seed the hidden input's SSR-rendered
 * value directly. Without this, a genuinely first click — before React
 * hydration has attached the submit listener and before any client effect
 * has run — would submit the literal server-rendered `value=""`, even
 * though a real selection already exists. Optional and defaults to `""`,
 * so every existing Shot/Asset caller is unaffected.
 */

type Props = {
  batchNodeId: string;
  workflowId: string;
  initialValue?: string;
};

export default function DynamicBatchFormSync({ batchNodeId, workflowId, initialValue }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitialValue = initialValue !== undefined;
  const initial = initialValue ?? "";

  useEffect(() => {
    // T2 — workflow-keyed sessionStorage
    const ssKey = buildBatchKey(workflowId, batchNodeId);
    // URL param key stays the same (unchanged server contract)
    const urlKey = `batchImages_${batchNodeId}`;

    function resolveCurrentValue(): string {
      const params = new URLSearchParams(window.location.search);
      // Distinguish "the browser's own URL never had this param" (fall
      // back to the SSR-computed initial selection) from "the param is
      // present but empty" (an explicit, deliberate empty selection —
      // e.g. after Clear Images — must stay empty, never resurrected).
      const raw = params.get(urlKey);
      return raw !== null ? raw : initial;
    }

    function syncFromUrl() {
      if (!inputRef.current) return;
      inputRef.current.value = resolveCurrentValue();
    }

    // Sync on mount
    syncFromUrl();

    // SEQGEN.STORYBOARD.3-FIX5 (retake) — `ssKey` (buildBatchKey) is scoped
    // to workflow+node only, never Sequence. A caller that supplies an
    // authoritative SSR `initialValue` (only the Sequence Storyboard direct
    // mode does) may be rendering for a DIFFERENT Sequence than whichever
    // one last wrote this same sessionStorage key — reusing the same
    // workflow and node id. Without this reset, the submit handler below
    // would prioritize that stale cross-Sequence value over the fresh
    // server-computed truth. Resetting sessionStorage to the resolved
    // current value at mount time (once, synchronously within this same
    // effect, before the submit listener can ever fire) makes the current
    // Sequence's selection authoritative from the very first submit.
    // Shot/Asset callers never pass `initialValue`, so this never runs for
    // them — their existing sessionStorage-priority behavior is untouched.
    if (hasInitialValue) {
      try {
        const current = resolveCurrentValue();
        if (current) {
          sessionStorage.setItem(ssKey, current);
        } else {
          sessionStorage.removeItem(ssKey);
        }
      } catch {
        // sessionStorage unavailable — URL-based sync remains the fallback.
      }
    }

    // Keep hidden input in sync on history changes (best-effort)
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      origPushState(...args);
      syncFromUrl();
    };

    history.replaceState = function (...args) {
      origReplaceState(...args);
      syncFromUrl();
    };

    window.addEventListener("popstate", syncFromUrl);

    /**
     * On submit, read from sessionStorage first (synchronous, set immediately
     * by DynamicBatchImageList.pushState using the workflow-keyed key), then
     * fall back to URL searchParams, then to the SSR-computed initial
     * selection — covering a submit that races ahead of every client effect
     * (sessionStorage never seeded, URL never touched).
     */
    function onFormSubmit(_event: Event) {
      let value = "";
      try {
        value = sessionStorage.getItem(ssKey) ?? "";
      } catch {
        // sessionStorage unavailable — fall through to URL.
      }
      if (!value) {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(urlKey);
        value = raw !== null ? raw : initial;
      }
      const el = inputRef.current;
      if (el && el.value !== value) {
        el.value = value;
      }
    }

    const el0 = inputRef.current;
    const form = el0?.form;
    if (form) {
      form.addEventListener("submit", onFormSubmit);
    }

    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      if (form) {
        form.removeEventListener("submit", onFormSubmit);
      }
    };
  }, [batchNodeId, workflowId, initial, hasInitialValue]);

  return (
    <input
      ref={inputRef}
      type="hidden"
      name={`batchImages_${batchNodeId}`}
      value={initial}
    />
  );
}
