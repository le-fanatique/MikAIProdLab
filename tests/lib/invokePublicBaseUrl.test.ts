import { describe, it, expect } from "vitest";
import { resolveInvokePublicBaseUrl } from "@/lib/invoke/invokePublicBaseUrl";

// INVOKE.PUSH.1-FIX1 — the browser-facing Invoke URL. The behaviour that
// matters: an unset public URL must fall back to the server-facing one (the
// single-machine case, which must keep working untouched), and a set one must
// win (the remote/tunnel case, the whole reason this function exists).
describe("resolveInvokePublicBaseUrl", () => {
  const server = "http://127.0.0.1:9090";

  it("falls back to the server-facing URL when nothing is configured", () => {
    expect(resolveInvokePublicBaseUrl(null, server)).toBe(server);
    expect(resolveInvokePublicBaseUrl(undefined, server)).toBe(server);
    expect(resolveInvokePublicBaseUrl("", server)).toBe(server);
    expect(resolveInvokePublicBaseUrl("   ", server)).toBe(server);
  });

  it("returns the configured public URL when there is one", () => {
    expect(resolveInvokePublicBaseUrl("https://invoke.example.com", server)).toBe("https://invoke.example.com");
  });

  it("trims and drops trailing slashes, so the caller can always concatenate", () => {
    expect(resolveInvokePublicBaseUrl("  https://invoke.example.com///  ", server)).toBe(
      "https://invoke.example.com"
    );
  });
});
