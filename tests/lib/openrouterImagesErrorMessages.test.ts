import { describe, expect, it } from "vitest";
import { describeImageModelDiscoveryFailure } from "../../src/lib/llm/openrouterImages";

// ---------------------------------------------------------------------------
// `LLM.ERROR.CAUSE.2` — the net, written before the `catch` at
// `fetchOpenRouterImageModels`'s fetch failure changes.
// ---------------------------------------------------------------------------

describe("describeImageModelDiscoveryFailure — fetchOpenRouterImageModels", () => {
  it("returns exactly today's message when no cause is found", () => {
    const err = new TypeError("fetch failed");

    expect(describeImageModelDiscoveryFailure(err)).toBe(
      "Could not reach OpenRouter for image model discovery."
    );
  });

  it("intercalates the cause when one is found", () => {
    const causeErr = Object.assign(
      new Error("self signed certificate in certificate chain"),
      { code: "SELF_SIGNED_CERT_IN_CHAIN" }
    );
    const err = new TypeError("fetch failed", { cause: causeErr });

    expect(describeImageModelDiscoveryFailure(err)).toBe(
      "Could not reach OpenRouter for image model discovery: SELF_SIGNED_CERT_IN_CHAIN."
    );
  });
});
