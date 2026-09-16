import { describe, expect, it } from "vitest";
import {
  describeOllamaConnectFailure,
  describeOllamaModelListFailure,
  describeOllamaUnloadFailure,
} from "../../src/lib/llm/ollama";

// ---------------------------------------------------------------------------
// `LLM.ERROR.CAUSE.2` — the net, written before the three `catch` blocks in
// `ollama.ts` change.
//
// `callOllama` and `callOllamaChat` share one connect-failure message form;
// `fetchOllamaModelNames` uses a different one (no baseUrl in the text); and
// `unloadOllamaModel` never throws, so its `error` field is enriched instead.
// Each test pins today's exact wording for the no-cause case first.
// ---------------------------------------------------------------------------

const CERT_CAUSE = Object.assign(
  new Error("self signed certificate in certificate chain"),
  { code: "SELF_SIGNED_CERT_IN_CHAIN" }
);

describe("describeOllamaConnectFailure — callOllama / callOllamaChat", () => {
  it("returns exactly today's message when no cause is found", () => {
    const err = new TypeError("fetch failed");

    expect(describeOllamaConnectFailure(err, "http://localhost:11434")).toBe(
      "Cannot connect to Ollama at http://localhost:11434. Make sure Ollama is running."
    );
  });

  it("intercalates the cause when one is found", () => {
    const err = new TypeError("fetch failed", { cause: CERT_CAUSE });

    expect(describeOllamaConnectFailure(err, "http://localhost:11434")).toBe(
      "Cannot connect to Ollama at http://localhost:11434: SELF_SIGNED_CERT_IN_CHAIN. Make sure Ollama is running."
    );
  });
});

describe("describeOllamaModelListFailure — fetchOllamaModelNames", () => {
  it("returns exactly today's message when no cause is found", () => {
    const err = new TypeError("fetch failed");

    expect(describeOllamaModelListFailure(err)).toBe(
      "Could not reach Ollama. Make sure Ollama is running."
    );
  });

  it("intercalates the cause when one is found", () => {
    const err = new TypeError("fetch failed", { cause: CERT_CAUSE });

    expect(describeOllamaModelListFailure(err)).toBe(
      "Could not reach Ollama: SELF_SIGNED_CERT_IN_CHAIN. Make sure Ollama is running."
    );
  });
});

describe("describeOllamaUnloadFailure — unloadOllamaModel", () => {
  it("returns exactly today's fallback (err.message) when no cause is found on an Error", () => {
    const err = new TypeError("fetch failed");

    expect(describeOllamaUnloadFailure(err)).toBe("fetch failed");
  });

  it("returns exactly today's fallback for a non-Error thrown value", () => {
    expect(describeOllamaUnloadFailure("not an error")).toBe(
      "Network error unloading Ollama model."
    );
  });

  it("appends the cause when one is found, keeping the existing base message", () => {
    const err = new TypeError("fetch failed", { cause: CERT_CAUSE });

    expect(describeOllamaUnloadFailure(err)).toBe(
      "fetch failed: SELF_SIGNED_CERT_IN_CHAIN."
    );
  });
});
