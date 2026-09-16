// ---------------------------------------------------------------------------
// Fetch error cause extraction — shared by every LLM transport
// ---------------------------------------------------------------------------
//
// Moved out of `openaiCompatible.ts` by `LLM.ERROR.CAUSE.2` so `ollama.ts` and
// `openrouterImages.ts` can use it without depending on the OpenAI-compatible
// transport. Body unchanged from `LLM.ERROR.CAUSE.1` (commit `0524e06`).

// Maximum depth walked down an `err.cause` chain — guards against a cyclic
// chain (a `cause` that points back at itself or an ancestor) looping forever.
const MAX_CAUSE_DEPTH = 5;

// Cause strings are shown inline in a one-line Error message; keep them short.
const MAX_CAUSE_LENGTH = 200;

/**
 * Digs the real, actionable cause out of a failed `fetch()` call.
 *
 * Node's `fetch` throws a `TypeError("fetch failed")` at the transport level
 * whose `err.cause` (sometimes nested a level or two deeper) carries the
 * actual reason — `err.cause.code` such as `ECONNREFUSED`, `ENOTFOUND`, or
 * `SELF_SIGNED_CERT_IN_CHAIN`. Throwing away that cause and showing only
 * "Cannot connect to LLM server" is what sent `LLM.ERROR.CAUSE.1`'s
 * investigation to the wrong place: see that ticket for the incident.
 *
 * `err` is `unknown` on purpose — this only ever runs inside a `catch`, where
 * nothing about the thrown value is guaranteed. Never throws.
 *
 * Returns `null` when nothing usable was found — including when the only
 * candidate is the surface `"fetch failed"` message itself, which carries no
 * information beyond restating that the fetch failed.
 */
export function extractFetchErrorCause(err: unknown): string | null {
  // `err` itself is the surface `fetch failed` TypeError (or whatever else
  // was thrown) — the actionable information lives in its `cause` chain, not
  // in `err` itself. If `err` is not object-shaped there is no chain to walk.
  if (!err || typeof err !== "object") return null;

  const seen = new Set<unknown>();
  let fallbackMessage: string | null = null;

  let current: unknown = (err as Record<string, unknown>).cause;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (current === null || current === undefined) break;

    // A cause that is itself a plain string carries real information (it is
    // not the empty "fetch failed" surface message), so it is a usable
    // fallback — but strings never carry a `code`, so keep walking in case a
    // later object-shaped cause has one. The literal "fetch failed" is
    // rejected here exactly as it is for an object's `message`: it is the
    // same uninformative surface value regardless of which shape it arrives
    // in, and accepting it here would reproduce the defect this function
    // exists to fix.
    if (typeof current === "string") {
      if (fallbackMessage === null && current.trim() && current !== "fetch failed") {
        fallbackMessage = current;
      }
      break;
    }

    if (typeof current !== "object") break;

    // Cycle guard: a `cause` that points back at an already-visited object
    // must stop here, not loop until MAX_CAUSE_DEPTH via repeated visits.
    if (seen.has(current)) break;
    seen.add(current);

    const node = current as Record<string, unknown>;

    const code = node.code;
    if (typeof code === "string" && code.trim()) {
      return truncateCause(code);
    }

    if (fallbackMessage === null) {
      const message = node.message;
      if (typeof message === "string" && message.trim() && message !== "fetch failed") {
        fallbackMessage = message;
      }
    }

    current = node.cause;
  }

  return fallbackMessage ? truncateCause(fallbackMessage) : null;
}

function truncateCause(value: string): string {
  return value.length > MAX_CAUSE_LENGTH ? `${value.slice(0, MAX_CAUSE_LENGTH)}…` : value;
}
