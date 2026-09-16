import { describe, expect, it } from "vitest";
import { describeModelListingFailure } from "../../src/lib/llm/openaiCompatible";

// ---------------------------------------------------------------------------
// `LLM.ERROR.CAUSE.2` — the net, written before the `catch` at
// `fetchOpenAICompatibleModelNames`'s fetch failure changes.
//
// Today that `catch` throws the literal "Could not reach LLM server." on any
// network failure, discarding whatever `err.cause` carried. These tests pin
// the exact current wording for the no-cause case, then require the cause to
// be intercalated when one is found — same patron as `describeConnectionFailure`.
// ---------------------------------------------------------------------------

describe("describeModelListingFailure — LLM.ERROR.CAUSE.2", () => {
  it("returns exactly today's message when no cause is found", () => {
    const err = new TypeError("fetch failed");

    expect(describeModelListingFailure(err)).toBe("Could not reach LLM server.");
  });

  it("intercalates the cause when one is found", () => {
    const causeErr = Object.assign(
      new Error("self signed certificate in certificate chain"),
      { code: "SELF_SIGNED_CERT_IN_CHAIN" }
    );
    const err = new TypeError("fetch failed", { cause: causeErr });

    expect(describeModelListingFailure(err)).toBe(
      "Could not reach LLM server: SELF_SIGNED_CERT_IN_CHAIN."
    );
  });
});
