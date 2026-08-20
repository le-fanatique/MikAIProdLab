import { describe, expect, it } from "vitest";
import type { PromptSegment } from "@/db/schema";
import { compilePromptSegments, formatPromptSeconds } from "@/lib/prompts/compilePromptSegments";

// ---------------------------------------------------------------------------
// compilePromptSegments — the text a Shot's segments become.
//
// Pure, and until now untested, while its output goes straight into what the
// engine is asked to generate. Its two silent failure modes are the ordering
// (a segment landing in the wrong place reorders the action itself) and the
// timing line format, which the engine reads as instructions.
//
// Characterization: these record what the code does today.
// ---------------------------------------------------------------------------

let nextId = 1;
const seg = (over: Partial<PromptSegment> = {}): PromptSegment =>
  ({
    id: nextId++,
    shotId: 1,
    orderIndex: 0,
    label: "L",
    promptText: "text",
    startSeconds: null,
    durationSeconds: null,
    segmentType: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as PromptSegment;

describe("formatPromptSeconds", () => {
  it("drops trailing zeros so a whole second is not written 3.00", () => {
    expect(formatPromptSeconds(3)).toBe("3");
    expect(formatPromptSeconds(2.5)).toBe("2.5");
    expect(formatPromptSeconds(2.5)).not.toBe("2.50");
  });

  it("rounds to two decimals", () => {
    expect(formatPromptSeconds(1.239)).toBe("1.24");
    expect(formatPromptSeconds(0.005)).toBe("0.01");
  });
});

describe("compilePromptSegments — ordering", () => {
  it("puts timed segments before untimed ones, whatever their orderIndex", () => {
    const out = compilePromptSegments([
      seg({ promptText: "untimed", orderIndex: 0 }),
      seg({ promptText: "timed", orderIndex: 9, startSeconds: 5 }),
    ]);

    // A start time is a stronger statement about position than a manual order.
    expect(out.lines.map((l) => l.promptText)).toEqual(["timed", "untimed"]);
  });

  it("orders timed segments by start time", () => {
    const out = compilePromptSegments([
      seg({ promptText: "late", startSeconds: 8 }),
      seg({ promptText: "early", startSeconds: 2 }),
    ]);

    expect(out.lines.map((l) => l.promptText)).toEqual(["early", "late"]);
  });

  it("breaks a tie on orderIndex, then on id — never on input order", () => {
    const out = compilePromptSegments([
      seg({ id: 100, promptText: "b", startSeconds: 1, orderIndex: 2 }),
      seg({ id: 50, promptText: "c", startSeconds: 1, orderIndex: 3 }),
      seg({ id: 200, promptText: "a", startSeconds: 1, orderIndex: 1 }),
    ]);

    expect(out.lines.map((l) => l.promptText)).toEqual(["a", "b", "c"]);
  });

  it("falls back to orderIndex then id when nothing is timed", () => {
    const out = compilePromptSegments([
      seg({ id: 9, promptText: "second", orderIndex: 1 }),
      seg({ id: 3, promptText: "first", orderIndex: 0 }),
    ]);

    expect(out.lines.map((l) => l.promptText)).toEqual(["first", "second"]);
  });

  it("does not mutate the array it is given", () => {
    const input = [seg({ promptText: "b", startSeconds: 5 }), seg({ promptText: "a", startSeconds: 1 })];
    compilePromptSegments(input);

    expect(input.map((s) => s.promptText)).toEqual(["b", "a"]);
  });
});

describe("compilePromptSegments — the four timing forms", () => {
  it("start and duration become a range, with the end computed", () => {
    const out = compilePromptSegments([seg({ promptText: "walks in", startSeconds: 1.5, durationSeconds: 2 })]);

    expect(out.lines[0].timingKind).toBe("full");
    expect(out.lines[0].endSeconds).toBe(3.5);
    expect(out.lines[0].line).toBe("1.5-3.5s: walks in");
  });

  it("start alone becomes `from Ns:` and leaves the end unknown", () => {
    const out = compilePromptSegments([seg({ promptText: "walks in", startSeconds: 4 })]);

    expect(out.lines[0].timingKind).toBe("start-only");
    expect(out.lines[0].endSeconds).toBeNull();
    expect(out.lines[0].line).toBe("from 4s: walks in");
  });

  it("duration alone becomes an approximation, not a range", () => {
    const out = compilePromptSegments([seg({ promptText: "walks in", durationSeconds: 3 })]);

    expect(out.lines[0].timingKind).toBe("duration-only");
    expect(out.lines[0].line).toBe("~3s: walks in");
  });

  it("no timing at all falls back to a numbered segment", () => {
    const out = compilePromptSegments([seg({ promptText: "walks in" })]);

    expect(out.lines[0].timingKind).toBe("none");
    expect(out.lines[0].line).toBe("Segment 1: walks in");
  });

  it("CHARACTERIZATION: the number in `Segment N` is the position after sorting, not orderIndex", () => {
    const out = compilePromptSegments([
      seg({ promptText: "second", orderIndex: 7 }),
      seg({ promptText: "first", orderIndex: 3 }),
    ]);

    expect(out.lines.map((l) => l.line)).toEqual(["Segment 1: first", "Segment 2: second"]);
  });

  it("trims the prompt text before it reaches the line", () => {
    const out = compilePromptSegments([seg({ promptText: "  walks in  \n" })]);

    expect(out.lines[0].promptText).toBe("walks in");
    expect(out.lines[0].line).toBe("Segment 1: walks in");
  });
});

describe("compilePromptSegments — the assembled result", () => {
  it("joins the lines with newlines, in the compiled order", () => {
    const out = compilePromptSegments([
      seg({ promptText: "b", startSeconds: 2 }),
      seg({ promptText: "a", startSeconds: 1 }),
    ]);

    expect(out.text).toBe("from 1s: a\nfrom 2s: b");
  });

  it("hasTiming is true as soon as one segment carries any timing", () => {
    expect(compilePromptSegments([seg({}), seg({ durationSeconds: 1 })]).hasTiming).toBe(true);
    expect(compilePromptSegments([seg({}), seg({})]).hasTiming).toBe(false);
  });

  it("CHARACTERIZATION: hasMissingTiming means `not every segment is fully timed` — partial counts as missing", () => {
    // Both flags are true together for a partially timed shot, which is the
    // case the UI has to distinguish.
    const partial = compilePromptSegments([seg({ startSeconds: 1 })]);
    expect(partial.hasTiming).toBe(true);
    expect(partial.hasMissingTiming).toBe(true);

    const full = compilePromptSegments([seg({ startSeconds: 1, durationSeconds: 2 })]);
    expect(full.hasMissingTiming).toBe(false);
  });

  it("an empty shot compiles to empty text and claims neither timing nor missing timing", () => {
    const out = compilePromptSegments([]);

    expect(out.lines).toEqual([]);
    expect(out.text).toBe("");
    expect(out.hasTiming).toBe(false);
    // `.some()` on an empty list is false, so an empty shot is not reported
    // as missing timing — it is reported as having nothing at all.
    expect(out.hasMissingTiming).toBe(false);
  });
});
