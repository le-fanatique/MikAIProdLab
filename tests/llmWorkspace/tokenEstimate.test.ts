import { describe, expect, it } from "vitest";
import { estimateTokens } from "@/lib/llmWorkspace/tokenEstimate";

describe("estimateTokens — LLMW.BENCH.READ.1 (B6b) §6", () => {
  it("empty string estimates zero tokens", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("rounds up at every 4-character boundary", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(8))).toBe(2);
    expect(estimateTokens("a".repeat(9))).toBe(3);
  });

  it("scales for a long string", () => {
    expect(estimateTokens("a".repeat(1000))).toBe(250);
    expect(estimateTokens("a".repeat(1001))).toBe(251);
  });
});
