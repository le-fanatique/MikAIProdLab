import { describe, expect, it } from "vitest";
import {
  computeEditorialFingerprint,
  buildEditorialSnapshot,
  compareEditorialSnapshot,
  EDITORIAL_SNAPSHOT_SCHEMA_VERSION,
  type EditorialSnapshot,
} from "@/lib/editorial/editorialSnapshot";
import type { EditorialDocument, EditorialDocumentItem } from "@/lib/editorial/editorialDocument";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for editorialSnapshot.ts's
// fingerprint — the mechanism guarding every future write-back (timing
// patch, publish, insert-shot) against a stale editorial structure.
// ---------------------------------------------------------------------------

function shotItem(overrides: Partial<EditorialDocumentItem> = {}): EditorialDocumentItem {
  return {
    id: 1,
    sourceType: "shot",
    shotId: 10,
    trackIndex: 0,
    orderIndex: 0,
    start: 0,
    duration: 5,
    ...overrides,
  };
}

function doc(tracks: Array<{ id: number; items: EditorialDocumentItem[] }>): EditorialDocument {
  return {
    projectId: 1,
    sequenceId: 2,
    durationSeconds: 0,
    tracks: tracks.map((t) => ({ id: t.id, kind: "video" as const, durationSeconds: 0, items: t.items })),
  };
}

describe("computeEditorialFingerprint", () => {
  it("is deterministic across two calls with the same content", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const a = computeEditorialFingerprint({ sequenceId: 2, document });
    const b = computeEditorialFingerprint({ sequenceId: 2, document });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("is independent of item iteration order — result is sorted by trackIndex then id before hashing", () => {
    const documentA = doc([
      { id: 0, items: [shotItem({ id: 1 }), shotItem({ id: 2 })] },
    ]);
    const documentB = doc([
      { id: 0, items: [shotItem({ id: 2 }), shotItem({ id: 1 })] },
    ]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document: documentA })).toBe(
      computeEditorialFingerprint({ sequenceId: 2, document: documentB })
    );
  });

  it("excludes gap items entirely — a document differing only by a gap fingerprints identically", () => {
    const withoutGap = doc([{ id: 0, items: [shotItem({ id: 1 })] }]);
    const withGap = doc([
      { id: 0, items: [shotItem({ id: 1 }), shotItem({ id: 2, sourceType: "gap", shotId: null })] },
    ]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document: withoutGap })).toBe(
      computeEditorialFingerprint({ sequenceId: 2, document: withGap })
    );
  });

  it("changes when startSeconds/start changes for one item", () => {
    const document = doc([{ id: 0, items: [shotItem({ start: 0 })] }]);
    const moved = doc([{ id: 0, items: [shotItem({ start: 1 })] }]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document })).not.toBe(
      computeEditorialFingerprint({ sequenceId: 2, document: moved })
    );
  });

  it("changes when status changes (e.g. approved -> missing)", () => {
    const document = doc([{ id: 0, items: [shotItem({ status: "approved" })] }]);
    const changed = doc([{ id: 0, items: [shotItem({ status: "missing" })] }]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document })).not.toBe(
      computeEditorialFingerprint({ sequenceId: 2, document: changed })
    );
  });

  it("is unaffected by title/shotCode — a rename never invalidates the fingerprint (deliberately excluded fields)", () => {
    const document = doc([{ id: 0, items: [shotItem({ title: "Old Name", shotCode: "SH01" })] }]);
    const renamed = doc([{ id: 0, items: [shotItem({ title: "New Name", shotCode: "SH99" })] }]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document })).toBe(
      computeEditorialFingerprint({ sequenceId: 2, document: renamed })
    );
  });

  it("changes when sequenceId itself differs, even with an identical document", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    expect(computeEditorialFingerprint({ sequenceId: 2, document })).not.toBe(
      computeEditorialFingerprint({ sequenceId: 999, document })
    );
  });
});

describe("buildEditorialSnapshot", () => {
  it("counts only shot items in itemCount, matching the fingerprint's own filter", () => {
    const document = doc([
      { id: 0, items: [shotItem({ id: 1 }), shotItem({ id: 2, sourceType: "gap", shotId: null })] },
    ]);
    const snapshot = buildEditorialSnapshot({ sequenceId: 2, document });
    expect(snapshot.itemCount).toBe(1);
    expect(snapshot.schemaVersion).toBe(EDITORIAL_SNAPSHOT_SCHEMA_VERSION);
  });

  it("uses the given generatedAt verbatim when provided, else a current timestamp", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const withDate = buildEditorialSnapshot({ sequenceId: 2, document, generatedAt: "2020-01-01T00:00:00.000Z" });
    expect(withDate.generatedAt).toBe("2020-01-01T00:00:00.000Z");

    const before = Date.now();
    const withoutDate = buildEditorialSnapshot({ sequenceId: 2, document });
    const after = Date.now();
    const parsed = Date.parse(withoutDate.generatedAt);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("generatedAt never affects the fingerprint itself", () => {
    const document = doc([{ id: 0, items: [shotItem()] }]);
    const a = buildEditorialSnapshot({ sequenceId: 2, document, generatedAt: "2020-01-01T00:00:00.000Z" });
    const b = buildEditorialSnapshot({ sequenceId: 2, document, generatedAt: "2099-01-01T00:00:00.000Z" });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("compareEditorialSnapshot", () => {
  function snap(overrides: Partial<EditorialSnapshot> = {}): EditorialSnapshot {
    return {
      schemaVersion: EDITORIAL_SNAPSHOT_SCHEMA_VERSION,
      fingerprint: "abc",
      itemCount: 3,
      generatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("ok:true when fingerprints match, regardless of other fields", () => {
    const result = compareEditorialSnapshot({
      sourceSnapshot: snap({ itemCount: 1, generatedAt: "2020-01-01T00:00:00.000Z" }),
      currentSnapshot: snap({ itemCount: 99, generatedAt: "2099-01-01T00:00:00.000Z" }),
    });
    expect(result).toEqual({ ok: true });
  });

  it("ok:false with a mismatch payload and the exact user-facing message when fingerprints differ", () => {
    const result = compareEditorialSnapshot({
      sourceSnapshot: snap({ fingerprint: "old", itemCount: 3 }),
      currentSnapshot: snap({ fingerprint: "new", itemCount: 5 }),
    });
    expect(result).toEqual({
      ok: false,
      mismatch: {
        message: "Sequence has changed since it was opened in OpenReel. Reload the Advanced Editor before applying changes.",
        expectedFingerprint: "old",
        currentFingerprint: "new",
        expectedItemCount: 3,
        currentItemCount: 5,
      },
    });
  });
});
