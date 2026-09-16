import { describe, expect, it } from "vitest";
import { extractFetchErrorCause } from "../../src/lib/llm/openaiCompatible";

// ---------------------------------------------------------------------------
// `LLM.ERROR.CAUSE.1` — the net, written before the function.
//
// Context: on 2026-09-16 every outgoing LLM call failed with "Cannot connect
// to LLM server at ... Check your settings." — a message that sent the
// investigation toward network/API-key/settings, when the real cause
// (`SELF_SIGNED_CERT_IN_CHAIN`, an antivirus intercepting TLS) was sitting in
// `err.cause` the whole time. `extractFetchErrorCause` is the pure function
// that digs it out so it can be shown instead of thrown away.
// ---------------------------------------------------------------------------

describe("extractFetchErrorCause — LLM.ERROR.CAUSE.1", () => {
  it("reads cause.code off a Node `fetch failed` TypeError", () => {
    const causeErr = Object.assign(
      new Error("self signed certificate in certificate chain"),
      { code: "SELF_SIGNED_CERT_IN_CHAIN" }
    );
    const err = new TypeError("fetch failed", { cause: causeErr });

    expect(extractFetchErrorCause(err)).toBe("SELF_SIGNED_CERT_IN_CHAIN");
  });

  it("descends a two-level cause chain to find the code", () => {
    const inner = { code: "ECONNREFUSED" };
    const wrapper = { message: "connect wrapper failed", cause: inner };
    const err = new TypeError("fetch failed", { cause: wrapper });

    expect(extractFetchErrorCause(err)).toBe("ECONNREFUSED");
  });

  it("returns null when there is no cause at all", () => {
    const err = new TypeError("fetch failed");

    expect(extractFetchErrorCause(err)).toBeNull();
  });

  it("returns null when cause is null", () => {
    const err = new TypeError("fetch failed", { cause: null });

    expect(extractFetchErrorCause(err)).toBeNull();
  });

  it("does not throw when cause is a non-object string, and does not invent a code", () => {
    const err = new TypeError("fetch failed", { cause: "ECONNRESET" });

    expect(() => extractFetchErrorCause(err)).not.toThrow();
    // Decision: a plain-string cause is returned as-is (truncated), since it
    // is still real information and not the empty "fetch failed" surface
    // message. It is not thrown away just because it isn't an Error object.
    expect(extractFetchErrorCause(err)).toBe("ECONNRESET");
  });

  it("rejects a string cause that is the literal \"fetch failed\", same as the object case", () => {
    const err = new TypeError("fetch failed", { cause: "fetch failed" });

    // Same value, same rejection as `{ message: "fetch failed" }` below — one
    // rule, not two shapes of the same rule.
    expect(extractFetchErrorCause(err)).toBeNull();
  });

  it("terminates on a cyclic cause chain instead of looping forever", () => {
    const cyclic: Record<string, unknown> = { message: "loops forever" };
    cyclic.cause = cyclic;
    const err = new TypeError("fetch failed", { cause: cyclic });

    expect(() => extractFetchErrorCause(err)).not.toThrow();
    // No `code` anywhere in the (cyclic) chain, but the node's own message is
    // real information (not the useless "fetch failed" literal), so it is
    // still a usable fallback — the cycle guard just stops the walk instead
    // of looping forever, it does not have to discard what was already found.
    expect(extractFetchErrorCause(err)).toBe("loops forever");
  });

  it("never returns the surface `fetch failed` message as a cause", () => {
    const err = new TypeError("fetch failed", {
      cause: { message: "fetch failed" },
    });

    expect(extractFetchErrorCause(err)).toBeNull();
  });

  it("falls back to a usable message when no code is present anywhere in the chain", () => {
    const err = new TypeError("fetch failed", {
      cause: { message: "getaddrinfo ENOTFOUND bad.example.invalid" },
    });

    expect(extractFetchErrorCause(err)).toBe(
      "getaddrinfo ENOTFOUND bad.example.invalid"
    );
  });

  it("truncates an unreasonably long cause message", () => {
    const longMessage = "x".repeat(500);
    const err = new TypeError("fetch failed", {
      cause: { message: longMessage },
    });

    const result = extractFetchErrorCause(err);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThan(longMessage.length);
  });

  it("does not throw on an err that is not an Error instance at all", () => {
    expect(() => extractFetchErrorCause("just a string")).not.toThrow();
    expect(extractFetchErrorCause("just a string")).toBeNull();
    expect(() => extractFetchErrorCause(undefined)).not.toThrow();
    expect(extractFetchErrorCause(undefined)).toBeNull();
    expect(() => extractFetchErrorCause(42)).not.toThrow();
  });
});
