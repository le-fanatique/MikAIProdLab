import { describe, it, expect } from "vitest";
import { selectStoryboardShotRange } from "@/lib/prompts/selectStoryboardShotRange";

type FakeShot = { id: number; label: string };

const SHOTS: FakeShot[] = [
  { id: 10, label: "S1" },
  { id: 20, label: "S2" },
  { id: 30, label: "S3" },
  { id: 40, label: "S4" },
];

describe("selectStoryboardShotRange", () => {
  it("both bounds null -> the input list, unchanged, isFullSequence true, no warnings (the default, byte-for-byte)", () => {
    const result = selectStoryboardShotRange(SHOTS, null, null);
    expect(result.shots).toEqual(SHOTS);
    expect(result.shots).toBe(SHOTS);
    expect(result.isFullSequence).toBe(true);
    expect(result.fromShotId).toBeNull();
    expect(result.toShotId).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("only fromShotId given -> toShotId resolves to the sequence end, no warning", () => {
    const result = selectStoryboardShotRange(SHOTS, 20, null);
    expect(result.shots.map((s) => s.id)).toEqual([20, 30, 40]);
    expect(result.fromShotId).toBe(20);
    expect(result.toShotId).toBe(40);
    expect(result.isFullSequence).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("only toShotId given -> fromShotId resolves to the sequence start, no warning", () => {
    const result = selectStoryboardShotRange(SHOTS, null, 30);
    expect(result.shots.map((s) => s.id)).toEqual([10, 20, 30]);
    expect(result.fromShotId).toBe(10);
    expect(result.toShotId).toBe(30);
    expect(result.isFullSequence).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("an unknown fromShotId is ignored (treated as the sequence start) and warns, naming the id", () => {
    const result = selectStoryboardShotRange(SHOTS, 999, 30);
    expect(result.shots.map((s) => s.id)).toEqual([10, 20, 30]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("999");
  });

  it("an unknown toShotId is ignored (treated as the sequence end) and warns, naming the id", () => {
    const result = selectStoryboardShotRange(SHOTS, 20, 999);
    expect(result.shots.map((s) => s.id)).toEqual([20, 30, 40]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("999");
  });

  it("from after to in sequence order falls back to the full sequence, with a warning, never swapping the bounds", () => {
    const result = selectStoryboardShotRange(SHOTS, 30, 20);
    expect(result.shots).toEqual(SHOTS);
    expect(result.isFullSequence).toBe(true);
    expect(result.fromShotId).toBeNull();
    expect(result.toShotId).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("equal bounds select exactly one shot", () => {
    const result = selectStoryboardShotRange(SHOTS, 20, 20);
    expect(result.shots.map((s) => s.id)).toEqual([20]);
    expect(result.isFullSequence).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("bounds are inclusive on both ends", () => {
    const result = selectStoryboardShotRange(SHOTS, 20, 30);
    expect(result.shots.map((s) => s.id)).toEqual([20, 30]);
  });

  it("bounds spanning the whole sequence explicitly still report isFullSequence true, with null ids", () => {
    const result = selectStoryboardShotRange(SHOTS, 10, 40);
    expect(result.shots).toEqual(SHOTS);
    expect(result.isFullSequence).toBe(true);
    expect(result.fromShotId).toBeNull();
    expect(result.toShotId).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("an empty input list returns an empty output, isFullSequence true, and no warnings even with bounds provided", () => {
    const result = selectStoryboardShotRange([], 1, 2);
    expect(result.shots).toEqual([]);
    expect(result.isFullSequence).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
