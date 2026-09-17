// INVOKE.PUSH.1-FIX1 — the browser-facing Invoke URL, split from the
// server-facing one.
//
// MikAI reaches Invoke twice, over two different network paths:
//   - the MikAI *server process* calls Invoke's HTTP API (upload, boards,
//     workflows). On a single machine that is `http://127.0.0.1:9090`, and it
//     stays correct however the author's browser reaches MikAI.
//   - the author's *browser* opens Invoke's own UI in a new tab after a push.
//     A loopback address is meaningless there as soon as the browser is not
//     on the machine running Invoke — a Cloudflare tunnel, Tailscale, a LAN
//     address.
//
// Same split, same reason, as `getOpenReelSidecarUrl` (browser-reachable)
// versus the server-side URLs around it, and as MIKAI.ORIGIN.1's
// `getMikAIPublicBaseUrl`. One setting could not serve both: pointing
// `invoke_base_url` at a tunnel would route every server-side API call back
// out through the public internet, and leaving it on loopback gives the
// remote browser a tab it cannot open.

/**
 * Pure. Resolves the URL handed to the *browser* to open Invoke.
 *
 * `stored` is the configured public URL, which is normally empty: the common
 * case is one machine, where the browser-facing and server-facing URLs are
 * the same value and configuring it twice would be a trap. Empty therefore
 * means "same as the server-facing URL", never "no URL".
 */
export function resolveInvokePublicBaseUrl(stored: string | null | undefined, serverBaseUrl: string): string {
  const cleaned = stored?.trim().replace(/\/+$/, "");
  if (cleaned) return cleaned;
  return serverBaseUrl;
}
