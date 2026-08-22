import { describe, it, expect } from "vitest";
import { resolveExtractionShotRange } from "@/lib/storyboardExtraction/resolveExtractionShotRange";

type FakeShot = { id: number };

const SHOTS: FakeShot[] = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }];

describe("resolveExtractionShotRange", () => {
  // -------------------------------------------------------------------------
  // The uploaded-image path — SEQGEN.STORYBOARD.EXTRACT.SHOTRANGE.1's
  // explicit, prime constraint: no job, no inherited range, no explicit
  // choice must stay the single most silent case of all.
  // -------------------------------------------------------------------------
  it("no inherited range and no explicit choice -> the full Sequence, source full-sequence, zero warnings (the uploaded-image path)", () => {
    const result = resolveExtractionShotRange(SHOTS, null, null);
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
    expect(result.droppedShotIds).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("a Sequence with no Shots -> empty output, no warnings, even with an inherited range and an explicit choice both present", () => {
    const result = resolveExtractionShotRange([], [10, 20], { fromShotId: 10, toShotId: 20 });
    expect(result.shotIdsInOrder).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Inherited range alone
  // -------------------------------------------------------------------------
  it("an inherited range whose every id still exists -> retained, in Sequence order, source inherited, no warning", () => {
    const result = resolveExtractionShotRange(SHOTS, [30, 20], null);
    // Sequence order (10,20,30,40), not the inherited array's own order.
    expect(result.shotIdsInOrder).toEqual([20, 30]);
    expect(result.source).toBe("inherited");
    expect(result.droppedShotIds).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("an inherited range with some ids gone -> survivors retained, disappeared ids listed in droppedShotIds, and a warning", () => {
    const result = resolveExtractionShotRange(SHOTS, [20, 999, 30], null);
    expect(result.shotIdsInOrder).toEqual([20, 30]);
    expect(result.source).toBe("inherited");
    expect(result.droppedShotIds).toEqual([999]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toContain("999");
  });

  it("an inherited range with every id gone -> falls back to the full Sequence, source full-sequence, with a warning (the dead heritage never guesses)", () => {
    const result = resolveExtractionShotRange(SHOTS, [901, 902], null);
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
    expect(result.droppedShotIds).toEqual([901, 902]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("an empty inherited array behaves like no inheritance at all -> full Sequence, no warning", () => {
    const result = resolveExtractionShotRange(SHOTS, [], null);
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
    expect(result.warnings).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Explicit choice alone
  // -------------------------------------------------------------------------
  it("an explicit choice narrowing the Sequence -> retained, source explicit, no warning", () => {
    const result = resolveExtractionShotRange(SHOTS, null, { fromShotId: 20, toShotId: 30 });
    expect(result.shotIdsInOrder).toEqual([20, 30]);
    expect(result.source).toBe("explicit");
    expect(result.droppedShotIds).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("an explicit choice spanning the whole Sequence -> source full-sequence, not explicit", () => {
    const result = resolveExtractionShotRange(SHOTS, null, { fromShotId: 10, toShotId: 40 });
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
  });

  it("an explicit choice with an unknown bound falls back to the Sequence's own border and warns, same semantics as selectStoryboardShotRange", () => {
    const result = resolveExtractionShotRange(SHOTS, null, { fromShotId: 999, toShotId: 30 });
    expect(result.shotIdsInOrder).toEqual([10, 20, 30]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("999");
  });

  it("an explicit choice with an inverted range falls back to the full Sequence and warns, never swapping the bounds", () => {
    const result = resolveExtractionShotRange(SHOTS, null, { fromShotId: 30, toShotId: 20 });
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("an explicit choice object with both bounds null behaves like no explicit choice at all -> falls through to inherited/full-sequence", () => {
    const result = resolveExtractionShotRange(SHOTS, null, { fromShotId: null, toShotId: null });
    expect(result.shotIdsInOrder).toEqual([10, 20, 30, 40]);
    expect(result.source).toBe("full-sequence");
    expect(result.warnings).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // The override rule: explicit always wins over inherited.
  // -------------------------------------------------------------------------
  it("an explicit choice always overrides an inherited range, even when they disagree", () => {
    const result = resolveExtractionShotRange(SHOTS, [10, 20], { fromShotId: 30, toShotId: 40 });
    expect(result.shotIdsInOrder).toEqual([30, 40]);
    expect(result.source).toBe("explicit");
  });

  it("an explicit choice with only one bound null still overrides a fully-set inherited range", () => {
    const result = resolveExtractionShotRange(SHOTS, [10, 20], { fromShotId: 30, toShotId: null });
    expect(result.shotIdsInOrder).toEqual([30, 40]);
    expect(result.source).toBe("explicit");
  });
});
