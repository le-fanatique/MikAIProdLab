import { describe, expect, it } from "vitest";
import { parseSelectedSequenceIds } from "@/lib/film/filmResultSelectionForm";

// ---------------------------------------------------------------------------
// FILM.EXPORT.SELECT.UI.1 — parseSelectedSequenceIds is the only real logic
// this ticket introduces: FormData -> an ordered, deduplicated list of
// selected sequence ids. It does NOT validate project membership — that's
// buildFilmResultManifest's job (src/lib/film/filmResultManifest.ts), which
// already throws FilmResultManifestError on a foreign id. This function
// never throws: a submitted form is an untrusted, possibly-malformed input.
//
// Form contract read by this function:
//   - "sequenceIds"      — one entry per CHECKED sequence, value = its id;
//   - "projectOrder"     — one hidden entry per PROJECT sequence (checked or
//                          not), in project order — the fallback/tie-break
//                          reference, never the arrival order of the fields;
//   - "position-<id>"    — optional numeric position field per sequence.
// ---------------------------------------------------------------------------

function buildFormData(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

describe("parseSelectedSequenceIds", () => {
  it("1. nothing checked -> empty list", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      ["projectOrder", "3"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([]);
  });

  it("2. three checked out of five -> only those three, in project order when positions agree with it", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      ["projectOrder", "3"],
      ["projectOrder", "4"],
      ["projectOrder", "5"],
      ["sequenceIds", "4"],
      ["sequenceIds", "1"],
      ["sequenceIds", "3"],
      ["position-1", "0"],
      ["position-3", "1"],
      ["position-4", "2"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([1, 3, 4]);
  });

  it("3. positions 3, 1, 2 -> order follows the positions, not the order of the fields", () => {
    const fd = buildFormData([
      ["projectOrder", "10"],
      ["projectOrder", "20"],
      ["projectOrder", "30"],
      // Fields submitted in an arbitrary arrival order.
      ["sequenceIds", "10"],
      ["position-10", "3"],
      ["sequenceIds", "20"],
      ["position-20", "1"],
      ["sequenceIds", "30"],
      ["position-30", "2"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([20, 30, 10]);
  });

  it("4. two equal positions -> deterministic tie-break by project order, proven with fields submitted in reverse", () => {
    const fd = buildFormData([
      ["projectOrder", "100"],
      ["projectOrder", "200"],
      // Fields submitted in the REVERSE of project order.
      ["sequenceIds", "200"],
      ["position-200", "5"],
      ["sequenceIds", "100"],
      ["position-100", "5"],
    ]);
    // 100 precedes 200 in project order, so it wins the tie despite arriving
    // second in the form fields.
    expect(parseSelectedSequenceIds(fd)).toEqual([100, 200]);
  });

  it("5. missing / empty / non-numeric / negative position -> falls back to project order, never throws", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      ["projectOrder", "3"],
      ["projectOrder", "4"],
      ["sequenceIds", "4"], // no position-4 field at all
      ["sequenceIds", "3"],
      ["position-3", ""], // empty
      ["sequenceIds", "2"],
      ["position-2", "abc"], // non-numeric
      ["sequenceIds", "1"],
      ["position-1", "-5"], // negative
    ]);
    expect(() => parseSelectedSequenceIds(fd)).not.toThrow();
    // All four fall back to project order (1, 2, 3, 4).
    expect(parseSelectedSequenceIds(fd)).toEqual([1, 2, 3, 4]);
  });

  it("6. a non-integer or negative id among the checked ones is rejected", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      ["sequenceIds", "1"],
      ["sequenceIds", "-2"],
      ["sequenceIds", "abc"],
      ["sequenceIds", "1.5"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([1]);
  });

  it("7. a duplicate id yields a single occurrence in the output", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      ["sequenceIds", "1"],
      ["sequenceIds", "1"],
      ["sequenceIds", "2"],
      ["position-1", "0"],
      ["position-2", "1"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([1, 2]);
  });

  it("8. two ids unknown to the project (untrusted input) submitted in decreasing order still come out ascending", () => {
    const fd = buildFormData([
      ["projectOrder", "1"],
      ["projectOrder", "2"],
      // 5 and 4 are not part of "projectOrder" at all — untrusted input the
      // real form never produces, but this function must still order it
      // deterministically rather than falling back to arrival order. These
      // two specific values are chosen because `Number.MAX_SAFE_INTEGER +
      // 4 === Number.MAX_SAFE_INTEGER + 5` (float64 precision collapses
      // beyond MAX_SAFE_INTEGER) — a fallback built on that arithmetic
      // would treat them as equal and fall through to arrival order.
      ["sequenceIds", "5"],
      ["sequenceIds", "4"],
    ]);
    expect(parseSelectedSequenceIds(fd)).toEqual([4, 5]);
  });
});
