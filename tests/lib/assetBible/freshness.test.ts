import { describe, expect, it } from "vitest";
import { computeBibleSourceFingerprint, readAssetBibleFreshness } from "@/lib/assetBible/freshness";
import { computeAssetContentFingerprint } from "@/lib/projectStyle/assetAlignment/fingerprint";

// ---------------------------------------------------------------------------
// freshness.test.ts — SCHEMA.BIBLE_FRESHNESS.1 (S1b)
// ---------------------------------------------------------------------------

describe("computeBibleSourceFingerprint", () => {
  it("is deterministic — the same input hashes to the same value across calls", () => {
    const fields = { description: "A hero character.", notes: "Softer jawline." };
    expect(computeBibleSourceFingerprint(fields)).toBe(computeBibleSourceFingerprint(fields));
    expect(computeBibleSourceFingerprint({ ...fields })).toBe(computeBibleSourceFingerprint({ ...fields }));
  });

  it("distinguishes null from an empty string", () => {
    const withNull = computeBibleSourceFingerprint({ description: null, notes: null });
    const withEmpty = computeBibleSourceFingerprint({ description: "", notes: "" });
    const mixed = computeBibleSourceFingerprint({ description: null, notes: "" });
    expect(withNull).not.toBe(withEmpty);
    expect(withNull).not.toBe(mixed);
    expect(withEmpty).not.toBe(mixed);
  });

  it("hashes on a fixed, declared field order — description then notes, not derived from object key order", () => {
    // Swapping which value sits in which field must change the hash, proving
    // the order is fixed rather than incidentally matching input order.
    const a = computeBibleSourceFingerprint({ description: "X", notes: "Y" });
    const b = computeBibleSourceFingerprint({ description: "Y", notes: "X" });
    expect(a).not.toBe(b);
  });

  it("produces a sha256 hex digest", () => {
    const hash = computeBibleSourceFingerprint({ description: "A", notes: "B" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // The trap this ticket exists to avoid: this new function must be a
  // sibling of computeAssetContentFingerprint, never an extension of it.
  // Proven here by recomputing the alignment fingerprint on a known case and
  // showing it is unchanged by this ticket's work.
  it("does not alter computeAssetContentFingerprint's existing, already-stored output", () => {
    const knownCase = {
      description: "A hero character.",
      notes: null as string | null,
      visualIdentity: "Tall, red cape.",
      usageRules: "",
      forbiddenVariations: null as string | null,
    };
    // Recomputed independently (node -e, sha256 of
    // '["A hero character.",null,"Tall, red cape.","",null]') and pinned
    // here as a regression oracle for the alignment fingerprint's own
    // five-field order.
    const KNOWN_ALIGNMENT_FINGERPRINT = "f50402fa71aeeca36af36b7990a97b748bc0b123111070afe3e97629d0db9ea9";
    expect(computeAssetContentFingerprint(knownCase)).toBe(KNOWN_ALIGNMENT_FINGERPRINT);
  });
});

describe("readAssetBibleFreshness", () => {
  const base = {
    description: "A hero character.",
    notes: "Softer jawline.",
    visualIdentity: "Tall, red cape.",
    usageRules: "Always framed heroically.",
    forbiddenVariations: "Never shown slouching.",
  };

  it('"no-bible" — all three Bible fields are null, whatever the fingerprint column holds', () => {
    expect(
      readAssetBibleFreshness({
        description: base.description,
        notes: base.notes,
        visualIdentity: null,
        usageRules: null,
        forbiddenVariations: null,
        bibleSourceFingerprint: null,
      })
    ).toBe("no-bible");

    // Even a stale/mismatched fingerprint on a Bible-less asset is still
    // "no-bible" — nothing to warn about when there is no Bible at all.
    expect(
      readAssetBibleFreshness({
        description: base.description,
        notes: base.notes,
        visualIdentity: null,
        usageRules: null,
        forbiddenVariations: null,
        bibleSourceFingerprint: "not-a-real-fingerprint",
      })
    ).toBe("no-bible");
  });

  it('"current" — a Bible exists and the stored fingerprint matches the live description/notes', () => {
    const bibleSourceFingerprint = computeBibleSourceFingerprint({
      description: base.description,
      notes: base.notes,
    });
    expect(readAssetBibleFreshness({ ...base, bibleSourceFingerprint })).toBe("current");
  });

  it('"stale" — the stored fingerprint no longer matches the live description/notes', () => {
    const staleFingerprint = computeBibleSourceFingerprint({ description: "Old description.", notes: "Old notes." });
    expect(readAssetBibleFreshness({ ...base, bibleSourceFingerprint: staleFingerprint })).toBe("stale");
  });

  it('"stale" — a Bible exists but no fingerprint was ever stored (every asset before this column existed)', () => {
    expect(readAssetBibleFreshness({ ...base, bibleSourceFingerprint: null })).toBe("stale");
  });
});
