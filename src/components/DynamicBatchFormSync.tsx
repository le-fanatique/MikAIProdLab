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
 * On each form submit, this component injects the latest batchImages_* value
 * from the actual URL into the form data, ensuring the server action always
 * receives the current selection.
 */

type Props = {
  batchNodeId: string;
};

export default function DynamicBatchFormSync({ batchNodeId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function syncFromUrl() {
      if (!inputRef.current) return;
      const params = new URLSearchParams(window.location.search);
      const key = `batchImages_${batchNodeId}`;
      const value = params.get(key) ?? "";
      inputRef.current.value = value;
    }

    // Sync on mount
    syncFromUrl();

    // Sync whenever popstate or pushState/replaceState occurs
    // (pushState doesn't fire popstate, so we also observe navigation)
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);

    function onHistoryChange() {
      syncFromUrl();
    }

    history.pushState = function (...args) {
      origPushState(...args);
      onHistoryChange();
    };

    history.replaceState = function (...args) {
      origReplaceState(...args);
      onHistoryChange();
    };

    window.addEventListener("popstate", syncFromUrl);

    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
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