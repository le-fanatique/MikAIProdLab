import { describe, it, expect, vi } from "vitest";
import { resolvePendingSync, retrySync } from "@/lib/projectStyle/referenceAnalysis/syncPhase";

describe("resolvePendingSync", () => {
  it("analysisLaunched: analysis failed", () => {
    expect(resolvePendingSync("analysisLaunched", { analysis: false })).toEqual({
      syncNeed: "analysis",
      message: "Analysis completed but the result could not be loaded.",
    });
  });

  it("analysisLaunched: analysis succeeded returns null", () => {
    expect(resolvePendingSync("analysisLaunched", { analysis: true })).toBeNull();
  });

  it("analysisConfirmed: analysis failed", () => {
    expect(resolvePendingSync("analysisConfirmed", { analysis: false })).toEqual({
      syncNeed: "analysis",
      message: "Analysis completed but the result could not be loaded.",
    });
  });

  it("analysisConfirmed: analysis succeeded returns null", () => {
    expect(resolvePendingSync("analysisConfirmed", { analysis: true })).toBeNull();
  });

  it("observationMutated: analysis failed", () => {
    expect(resolvePendingSync("observationMutated", { analysis: false })).toEqual({
      syncNeed: "analysis",
      message: "Observation saved but analysis state could not be refreshed.",
    });
  });

  it("observationMutated: analysis succeeded returns null", () => {
    expect(resolvePendingSync("observationMutated", { analysis: true })).toBeNull();
  });

  it("candidateRuleMutated: analysis failed", () => {
    expect(resolvePendingSync("candidateRuleMutated", { analysis: false })).toEqual({
      syncNeed: "analysis",
      message: "Candidate rule saved but analysis state could not be refreshed.",
    });
  });

  it("candidateRuleMutated: analysis succeeded returns null", () => {
    expect(resolvePendingSync("candidateRuleMutated", { analysis: true })).toBeNull();
  });

  it("ruleApproved: both failed", () => {
    expect(resolvePendingSync("ruleApproved", { analysis: false, draft: false })).toEqual({
      syncNeed: "both",
      message: "Rule approved but analysis state and Working Draft could not be refreshed.",
    });
  });

  it("ruleApproved: analysis failed, draft ok", () => {
    expect(resolvePendingSync("ruleApproved", { analysis: false, draft: true })).toEqual({
      syncNeed: "analysis",
      message: "Rule approved but analysis state could not be refreshed.",
    });
  });

  it("ruleApproved: analysis ok, draft failed", () => {
    expect(resolvePendingSync("ruleApproved", { analysis: true, draft: false })).toEqual({
      syncNeed: "draft",
      message: "Rule approved but Working Draft could not be refreshed.",
    });
  });

  it("ruleApproved: both ok returns null", () => {
    expect(resolvePendingSync("ruleApproved", { analysis: true, draft: true })).toBeNull();
  });

  it("retry: partial failure (analysis) returns the fixed retry message", () => {
    expect(resolvePendingSync("retry", { analysis: false, draft: true })).toEqual({
      syncNeed: "analysis",
      message: "Sync still incomplete. Retry when ready.",
    });
  });

  it("retry: partial failure (draft) returns the fixed retry message", () => {
    expect(resolvePendingSync("retry", { analysis: true, draft: false })).toEqual({
      syncNeed: "draft",
      message: "Sync still incomplete. Retry when ready.",
    });
  });

  it("retry: both failed", () => {
    expect(resolvePendingSync("retry", { analysis: false, draft: false })).toEqual({
      syncNeed: "both",
      message: "Sync still incomplete. Retry when ready.",
    });
  });

  it("retry: entirely successful returns null", () => {
    expect(resolvePendingSync("retry", { analysis: true, draft: true })).toBeNull();
  });
});

describe("retrySync", () => {
  it("need 'analysis': only readAnalysis is called", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: true });
    const readDraft = vi.fn().mockResolvedValue({ ok: true });
    const result = await retrySync("analysis", { readAnalysis, readDraft });
    expect(readAnalysis).toHaveBeenCalledTimes(1);
    expect(readDraft).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("need 'draft': only readDraft is called", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: true });
    const readDraft = vi.fn().mockResolvedValue({ ok: true });
    const result = await retrySync("draft", { readAnalysis, readDraft });
    expect(readDraft).toHaveBeenCalledTimes(1);
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("need 'both': both readers are called exactly once each", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: true });
    const readDraft = vi.fn().mockResolvedValue({ ok: true });
    const result = await retrySync("both", { readAnalysis, readDraft });
    expect(readAnalysis).toHaveBeenCalledTimes(1);
    expect(readDraft).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it("need 'both', analysis fails, draft succeeds: syncNeed narrows to 'analysis'", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: false });
    const readDraft = vi.fn().mockResolvedValue({ ok: true });
    const result = await retrySync("both", { readAnalysis, readDraft });
    expect(result).toEqual({ syncNeed: "analysis", message: "Sync still incomplete. Retry when ready." });
  });

  it("need 'both', draft fails, analysis succeeds: syncNeed narrows to 'draft'", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: true });
    const readDraft = vi.fn().mockResolvedValue({ ok: false });
    const result = await retrySync("both", { readAnalysis, readDraft });
    expect(result).toEqual({ syncNeed: "draft", message: "Sync still incomplete. Retry when ready." });
  });

  it("need 'none': no reader is called, returns null", async () => {
    const readAnalysis = vi.fn().mockResolvedValue({ ok: true });
    const readDraft = vi.fn().mockResolvedValue({ ok: true });
    const result = await retrySync("none", { readAnalysis, readDraft });
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(readDraft).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
