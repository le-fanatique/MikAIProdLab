"use client";

import { useEffect, useRef } from "react";

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
 */

type Props = {
  batchNodeId: string;
};

export default function DynamicBatchFormSync({ batchNodeId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = `batchImages_${batchNodeId}`;

    function syncFromUrl() {
      if (!inputRef.current) return;
      const params = new URLSearchParams(window.location.search);
      const value = params.get(key) ?? "";
      inputRef.current.value = value;
    }

    // Sync on mount
    syncFromUrl();

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
     * by DynamicBatchImageList.pushState), then fall back to URL searchParams.
     * This eliminates the race where router.replace() hasn't updated the URL
     * by the time the form serializes its data.
     */
    function onFormSubmit(_event: Event) {
      let value = "";
      try {
        value = sessionStorage.getItem(key) ?? "";
      } catch {
        // sessionStorage unavailable — fall through to URL.
      }
      // Fallback: if sessionStorage is empty, try URL
      if (!value) {
        const params = new URLSearchParams(window.location.search);
        value = params.get(key) ?? "";
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
  }, [batchNodeId]);

  return (
    <input
      ref={inputRef}
      type="hidden"
      name={`batchImages_${batchNodeId}`}
      value=""
    />
  );
}