"use client";

// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3, ticket §1.1. Two
// trigger paths calling the SAME server action (`syncInvokeBoards`, no
// duplicated logic):
//
//   - automatic — this component, mounted once per page load, calls the
//     action on mount and again on `visibilitychange`/`focus`, with a >=5s
//     debounce and a guard against two concurrent calls in flight;
//   - manual — the plain `<form action={syncInvokeBoards}>` below, which
//     keeps working with NO JavaScript at all: at the author's own remote
//     setup, client hydration can fail outright and every React handler with
//     it (`docs/PROJECT_STATE.md`, section `INVOKE.PUSH.2`). A real HTML
//     form POST does not depend on hydration succeeding.
//
// Everything stateful (the effect, the refs, the transition) stays in this
// one file — mikai-method §5: no DOM test harness in this repository, so
// nothing that carries state is extracted or unit-tested; rendering is
// verified in a real browser instead (see the executor report for whether
// that happened this session).

import { useEffect, useRef, useTransition } from "react";
import { syncInvokeBoards } from "@/actions/invoke";

const DEBOUNCE_MS = 5000;
// A `syncInvokeBoards` call that has something to report (an import, or an
// error) redirects — and a Server Action redirect remounts this client
// component on the freshly-rendered page, which would otherwise reset the
// in-memory debounce and fire again immediately. A real, persistently
// failing board (e.g. Invoke unreachable) turned that into a tight
// redirect/re-trigger loop hammering the real Invoke server, found by
// navigating a real browser at a page with real linked boards during this
// ticket's own verification (see the executor report). `sessionStorage`
// survives that remount while still resetting on a genuinely new tab/session
// — the case ticket §1.1 means by "on load".
const LAST_RUN_STORAGE_KEY = "mikai:invokeSyncButton:lastRunAt";

function readLastRunAt(): number {
  try {
    return Number(window.sessionStorage.getItem(LAST_RUN_STORAGE_KEY)) || 0;
  } catch {
    return 0; // Storage unavailable (private mode, etc.) — debounce falls back to per-mount only.
  }
}

function writeLastRunAt(value: number): void {
  try {
    window.sessionStorage.setItem(LAST_RUN_STORAGE_KEY, String(value));
  } catch {
    /* best-effort only */
  }
}

type Props = {
  /** Where `syncInvokeBoards` should redirect back to when it has something to show — the current page's own canonical URL. */
  returnTo: string;
};

export default function InvokeSyncButton({ returnTo }: Props) {
  const [isPending, startTransition] = useTransition();
  const inFlightRef = useRef(false);

  useEffect(() => {
    function trigger() {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (now - readLastRunAt() < DEBOUNCE_MS) return;
      writeLastRunAt(now);
      inFlightRef.current = true;

      const formData = new FormData();
      formData.set("returnTo", returnTo);

      startTransition(async () => {
        try {
          await syncInvokeBoards(formData);
        } finally {
          inFlightRef.current = false;
        }
      });
    }

    // On load (ticket §1.1 — "on load and on regaining focus").
    trigger();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") trigger();
    }

    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [returnTo]);

  return (
    <form action={syncInvokeBoards} className="mb-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-[#5b93d6]/50 text-[#8fbbe8] px-3 py-1.5 text-xs hover:border-[#5b93d6] hover:bg-[#5b93d6]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? "Checking Invoke…" : "Check Invoke for new images"}
      </button>
    </form>
  );
}
