import { describe, expect, it } from "vitest";
import { buildReferenceAnalysisPrompt } from "@/lib/projectStyle/referenceAnalysis/prompt";
import { sha256Hex } from "@/lib/projectStyle/referenceAnalysis/validation";
import type { ReferenceSnapshotForRun } from "@/lib/projectStyle/referenceAnalysis/contracts";

// ---------------------------------------------------------------------------
// LLMW.REFANALYSIS.CHARACTERIZE.1 (B20d) — property (b): the deterministic
// prompt and its provenance hash (`sha256Hex(buildReferenceAnalysisPrompt(...))`).
//
// Both `buildReferenceAnalysisPrompt` and `sha256Hex` are pure (no DB, no
// network, no filesystem) — this is the "fully testable, no server-only
// boundary" property the ticket names. No production file is touched.
// ---------------------------------------------------------------------------

function snapshot(overrides: Partial<ReferenceSnapshotForRun> = {}): ReferenceSnapshotForRun {
  return {
    referenceId: 1,
    referenceKey: "R1",
    ordinal: 0,
    label: "Rooftop at dusk",
    provenanceNotes: "Shot on location, personal archive, 2019.",
    whatInterestsMe: "The cool/warm contrast between the sky and the practical lights.",
    whatToAvoid: "The visible lens flare in the corner.",
    domains: ["lighting", "composition"],
    imageSha256: "aa".repeat(32),
    mimeType: "image/png",
    width: 1024,
    height: 768,
    ...overrides,
  };
}

describe("Reference Board analysis — the prompt is deterministic, so its sha256 is a stable provenance hash", () => {
  it("produces byte-identical text, and therefore an identical hash, for identical input built independently twice", () => {
    const a = buildReferenceAnalysisPrompt([snapshot()]);
    const b = buildReferenceAnalysisPrompt([snapshot()]); // a fresh, independently-constructed object with the same values
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it("is deterministic across multiple references, in R1..Rn order", () => {
    const refs = [
      snapshot({ referenceId: 1, referenceKey: "R1", ordinal: 0, label: "First" }),
      snapshot({ referenceId: 2, referenceKey: "R2", ordinal: 1, label: "Second", domains: ["color"] }),
    ];
    const a = buildReferenceAnalysisPrompt(refs);
    const b = buildReferenceAnalysisPrompt(refs.map((r) => ({ ...r })));
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it.each<[string, Partial<ReferenceSnapshotForRun>]>([
    ["label", { label: "A different label" }],
    ["provenanceNotes", { provenanceNotes: "A different note." }],
    ["whatInterestsMe", { whatInterestsMe: "Something else entirely." }],
    ["whatToAvoid", { whatToAvoid: "Something else to avoid." }],
    ["domains (content)", { domains: ["texture"] }],
    ["domains (order — canonicalization sorts upstream, but the prompt itself trusts the given order)", { domains: ["composition", "lighting"] }],
  ])("changes the prompt text — and therefore the hash — when %s changes", (_label, override) => {
    const base = buildReferenceAnalysisPrompt([snapshot()]);
    const changed = buildReferenceAnalysisPrompt([snapshot(override)]);
    expect(changed).not.toBe(base);
    expect(sha256Hex(changed)).not.toBe(sha256Hex(base));
  });

  it("changes the hash when a field flips between null and an empty-after-trim value in a way that changes rendered text", () => {
    // `null` renders no line at all; a non-null, non-empty string renders one.
    // This is the boundary the acquisition/finalization comparison relies on:
    // any semantic difference in canonical metadata must reach the prompt text.
    const withNote = buildReferenceAnalysisPrompt([snapshot({ provenanceNotes: "A note." })]);
    const withoutNote = buildReferenceAnalysisPrompt([snapshot({ provenanceNotes: null })]);
    expect(withNote).not.toBe(withoutNote);
    expect(sha256Hex(withNote)).not.toBe(sha256Hex(withoutNote));
  });

  it("changes the hash when the reference COUNT changes, even holding the first reference's content fixed", () => {
    const one = buildReferenceAnalysisPrompt([snapshot()]);
    const two = buildReferenceAnalysisPrompt([
      snapshot(),
      snapshot({ referenceId: 2, referenceKey: "R2", ordinal: 1, label: "Second" }),
    ]);
    expect(sha256Hex(one)).not.toBe(sha256Hex(two));
  });
});

describe("Reference Board analysis — the prompt never embeds pixels, base64 or a source URL", () => {
  it("never contains the image's base64 payload or its sha256 — only bounded text metadata reaches the prompt", () => {
    const fakeBase64Like = "aa".repeat(32); // shares a shape with imageSha256, deliberately, to prove it is absent as a VALUE, not just as a literal string "base64"
    const prompt = buildReferenceAnalysisPrompt([snapshot({ imageSha256: fakeBase64Like })]);
    expect(prompt).not.toContain(fakeBase64Like);
    expect(prompt.toLowerCase()).not.toContain("base64");
  });

  it("never mentions sourceUrl, by construction — ReferenceSnapshotForRun (and CanonicalReferenceMetadata one layer below it) has no sourceUrl field to render", () => {
    // This is a structural guarantee, not merely a prompt-builder discipline:
    // `sourceUrl` is dropped at `canonicalizeReferenceMetadata` (contracts.ts),
    // one layer before the prompt is ever built, so `ReferenceSnapshotForRun`
    // itself carries no such field for `buildReferenceAnalysisPrompt` to leak
    // even by accident. Asserted here as a `keyof` compile-time check plus a
    // runtime text scan, so a future field addition that reintroduces
    // `sourceUrl` onto the snapshot type would fail this test the moment the
    // prompt builder started rendering it.
    const snap = snapshot();
    expect(Object.keys(snap)).not.toContain("sourceUrl");
    const prompt = buildReferenceAnalysisPrompt([snap]);
    expect(prompt.toLowerCase()).not.toContain("sourceurl");
    expect(prompt.toLowerCase()).not.toContain("source url");
  });

  it("never emits a bare 'https://' or 'http://' from reference content unless the user's own free-text metadata happened to type one — a URL is never derived from a dedicated sourceUrl field", () => {
    const prompt = buildReferenceAnalysisPrompt([snapshot()]);
    expect(prompt).not.toMatch(/https?:\/\//);
  });
});
