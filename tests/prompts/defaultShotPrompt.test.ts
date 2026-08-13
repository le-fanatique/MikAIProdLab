import { describe, it, expect } from "vitest";
import {
  buildDefaultShotPromptProposal,
  resolveShotPromptWithDefault,
} from "@/lib/prompts/defaultShotPrompt";

describe("buildDefaultShotPromptProposal", () => {
  it("joins all provided fields", () => {
    const result = buildDefaultShotPromptProposal({
      description: "Mara stands on the rooftop.",
      actionPitch: "She raises her weapon.",
      cameraPitch: "Low angle, wide lens.",
    });
    expect(result).toMatchSnapshot();
  });

  it("returns an empty string when all fields are absent/null/empty", () => {
    const result = buildDefaultShotPromptProposal({
      description: null,
      actionPitch: undefined,
      cameraPitch: "   ",
    });
    expect(result).toMatchSnapshot();
  });
});

describe("resolveShotPromptWithDefault", () => {
  it("returns the existing shot prompt when present, ignoring the other fields", () => {
    const result = resolveShotPromptWithDefault({
      shotPrompt: "Existing prompt.",
      description: "Should be ignored.",
      actionPitch: "Should be ignored.",
      cameraPitch: "Should be ignored.",
    });
    expect(result).toMatchSnapshot();
  });

  it("falls back to the built proposal when shotPrompt is absent/empty", () => {
    const result = resolveShotPromptWithDefault({
      shotPrompt: "",
      description: "Mara stands on the rooftop.",
      actionPitch: null,
      cameraPitch: null,
    });
    expect(result).toMatchSnapshot();
  });

  it("returns null when the shot prompt and every optional field are absent", () => {
    const result = resolveShotPromptWithDefault({
      shotPrompt: null,
      description: null,
      actionPitch: null,
      cameraPitch: null,
    });
    expect(result).toMatchSnapshot();
  });
});
