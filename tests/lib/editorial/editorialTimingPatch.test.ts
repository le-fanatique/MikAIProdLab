import { describe, expect, it } from "vitest";
import {
  validateEditorialTimingPatchShape,
  planEditorialTimingPatch,
  EDITORIAL_TIMING_PATCH_SCHEMA_VERSION,
  TIMING_EPSILON_SECONDS,
  type MikAIEditorialTimingPatchV1,
  type ExistingEditorialItemForPlan,
} from "@/lib/editorial/editorialTimingPatch";
import { EDITORIAL_SNAPSHOT_SCHEMA_VERSION } from "@/lib/editorial/editorialSnapshot";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. Characterization tests for editorialTimingPatch.ts's two
// pure functions. They describe the behavior AS IT IS, not as its name
// suggests. Any surprise found while writing them is noted here and in the
// executor report, never corrected.
// ---------------------------------------------------------------------------

const SOURCE_SCHEMA_VERSION = "mikai-editorial-export-v1";

function validPatchInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: EDITORIAL_TIMING_PATCH_SCHEMA_VERSION,
    sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
    projectId: 1,
    sequenceId: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    items: [{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }],
    ...overrides,
  };
}

function validSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: EDITORIAL_SNAPSHOT_SCHEMA_VERSION,
    fingerprint: "abc123",
    itemCount: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateEditorialTimingPatchShape", () => {
  describe("top-level shape rejections", () => {
    it("rejects null with a dedicated message", () => {
      const result = validateEditorialTimingPatchShape(null);
      expect(result).toEqual({ ok: false, errors: [{ message: "Patch must be a JSON object." }] });
    });

    it("rejects undefined the same way as null", () => {
      const result = validateEditorialTimingPatchShape(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual([{ message: "Patch must be a JSON object." }]);
    });

    it("rejects a string, a number, and an array — typeof object but not a plain patch", () => {
      expect(validateEditorialTimingPatchShape("nope")).toEqual({
        ok: false,
        errors: [{ message: "Patch must be a JSON object." }],
      });
      expect(validateEditorialTimingPatchShape(42)).toEqual({
        ok: false,
        errors: [{ message: "Patch must be a JSON object." }],
      });
      // An array IS typeof "object" — it passes the outer guard and is then
      // validated field-by-field like any other object (all fields end up
      // undefined). Characterization: this is not rejected as "not an
      // object", it accumulates the normal field-level errors instead.
      const arrayResult = validateEditorialTimingPatchShape([]);
      expect(arrayResult.ok).toBe(false);
      if (!arrayResult.ok) {
        expect(arrayResult.errors.length).toBeGreaterThan(1);
        expect(arrayResult.errors[0].message).toContain("Unexpected schemaVersion");
      }
    });

    it("rejects an unknown schemaVersion with the exact expected value quoted in the message", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ schemaVersion: "bogus-v9" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({
          message: `Unexpected schemaVersion "bogus-v9" — expected "${EDITORIAL_TIMING_PATCH_SCHEMA_VERSION}".`,
        });
      }
    });

    it("rejects a missing schemaVersion, stringifying undefined as the literal text \"undefined\"", () => {
      const input = validPatchInput();
      delete (input as Record<string, unknown>).schemaVersion;
      const result = validateEditorialTimingPatchShape(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({
          message: `Unexpected schemaVersion "undefined" — expected "${EDITORIAL_TIMING_PATCH_SCHEMA_VERSION}".`,
        });
      }
    });

    it("rejects an unknown sourceSchemaVersion with the exact expected value quoted", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ sourceSchemaVersion: "old-v0" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({
          message: `Unexpected sourceSchemaVersion "old-v0" — expected "${SOURCE_SCHEMA_VERSION}".`,
        });
      }
    });

    it("rejects a non-number projectId and a non-number sequenceId independently", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ projectId: "1", sequenceId: null }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({ message: "projectId must be a number." });
        expect(result.errors).toContainEqual({ message: "sequenceId must be a number." });
      }
    });

    it("rejects a non-finite projectId (NaN, Infinity)", () => {
      const nanResult = validateEditorialTimingPatchShape(validPatchInput({ projectId: NaN }));
      expect(nanResult.ok).toBe(false);
      if (!nanResult.ok) expect(nanResult.errors).toContainEqual({ message: "projectId must be a number." });

      const infResult = validateEditorialTimingPatchShape(validPatchInput({ projectId: Infinity }));
      expect(infResult.ok).toBe(false);
      if (!infResult.ok) expect(infResult.errors).toContainEqual({ message: "projectId must be a number." });
    });

    it("rejects items that is not an array (object, string, missing)", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ items: {} }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContainEqual({ message: "items must be an array." });
    });

    it("accumulates every top-level error at once rather than stopping at the first", () => {
      const result = validateEditorialTimingPatchShape({
        schemaVersion: "bad",
        sourceSchemaVersion: "bad",
        projectId: "x",
        sequenceId: "x",
        items: "not-an-array",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toHaveLength(5);
    });
  });

  describe("sourceEditorialSnapshot", () => {
    it("is optional — omitted entirely is valid", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.patch.sourceEditorialSnapshot).toBeUndefined();
    });

    it("accepts a well-formed snapshot and carries it through unchanged", () => {
      const snap = validSnapshot();
      const result = validateEditorialTimingPatchShape(validPatchInput({ sourceEditorialSnapshot: snap }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.patch.sourceEditorialSnapshot).toEqual(snap);
    });

    it("rejects null explicitly passed for sourceEditorialSnapshot (present but not a valid object)", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ sourceEditorialSnapshot: null }));
      // Characterization: `snap !== undefined` is checked via
      // `obj.sourceEditorialSnapshot !== undefined`, and `null !== undefined`
      // is true, so null is NOT treated as "absent" — it goes through the
      // shape check and fails it.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({
          message: `sourceEditorialSnapshot, if present, must be a valid "${EDITORIAL_SNAPSHOT_SCHEMA_VERSION}" object.`,
        });
      }
    });

    it("rejects a snapshot with the wrong schemaVersion", () => {
      const result = validateEditorialTimingPatchShape(
        validPatchInput({ sourceEditorialSnapshot: validSnapshot({ schemaVersion: "wrong" }) })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual({
          message: `sourceEditorialSnapshot, if present, must be a valid "${EDITORIAL_SNAPSHOT_SCHEMA_VERSION}" object.`,
        });
      }
    });

    it("rejects a snapshot missing fingerprint, itemCount, or generatedAt", () => {
      for (const field of ["fingerprint", "itemCount", "generatedAt"] as const) {
        const snap = validSnapshot();
        delete (snap as Record<string, unknown>)[field];
        const result = validateEditorialTimingPatchShape(validPatchInput({ sourceEditorialSnapshot: snap }));
        expect(result.ok).toBe(false);
      }
    });
  });

  describe("items validation", () => {
    it("rejects a non-object item entry, indexed in the message", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ items: [null] }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual([{ message: "items[0] must be an object." }]);
    });

    it("rejects an item with a non-number id, with no itemId echoed since id itself is invalid", () => {
      const result = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: "ten", shotId: 100, startSeconds: 0, durationSeconds: 5 }] })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([{ itemId: undefined, message: "items[0].id must be a number." }]);
      }
    });

    it("rejects a non-number shotId, itemId now populated from the valid id", () => {
      const result = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: "x", startSeconds: 0, durationSeconds: 5 }] })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual([{ itemId: 10, message: "shotId must be a number." }]);
    });

    it("rejects a negative startSeconds, a non-finite startSeconds, and a non-number startSeconds", () => {
      const negative = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: -1, durationSeconds: 5 }] })
      );
      expect(negative.ok).toBe(false);
      if (!negative.ok) {
        expect(negative.errors).toEqual([
          { itemId: 10, message: "startSeconds must be a finite number >= 0." },
        ]);
      }

      const nonFinite = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: Infinity, durationSeconds: 5 }] })
      );
      expect(nonFinite.ok).toBe(false);

      const wrongType = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: "0", durationSeconds: 5 }] })
      );
      expect(wrongType.ok).toBe(false);
    });

    it("accepts startSeconds of exactly 0 (boundary, not below the >= 0 line)", () => {
      const result = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }] })
      );
      expect(result.ok).toBe(true);
    });

    it("rejects durationSeconds of exactly 0 and negative durationSeconds — must be strictly > 0", () => {
      const zero = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 0 }] })
      );
      expect(zero.ok).toBe(false);
      if (!zero.ok) {
        expect(zero.errors).toEqual([{ itemId: 10, message: "durationSeconds must be a finite number > 0." }]);
      }

      const negative = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: -5 }] })
      );
      expect(negative.ok).toBe(false);
    });

    it("stops checking a single item's remaining fields once one fails (id -> shotId -> startSeconds -> durationSeconds order)", () => {
      // Both shotId AND startSeconds are invalid; only the shotId error surfaces for this item.
      const result = validateEditorialTimingPatchShape(
        validPatchInput({ items: [{ id: 10, shotId: "bad", startSeconds: -1, durationSeconds: -1 }] })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toEqual([{ itemId: 10, message: "shotId must be a number." }]);
    });

    it("accumulates independent errors across multiple items, each indexed/itemId'd correctly", () => {
      const result = validateEditorialTimingPatchShape(
        validPatchInput({
          items: [
            { id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 },
            { id: 11, shotId: "bad", startSeconds: 0, durationSeconds: 5 },
            { id: "bad-id", shotId: 100, startSeconds: 0, durationSeconds: 5 },
          ],
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          { itemId: 11, message: "shotId must be a number." },
          { itemId: undefined, message: "items[2].id must be a number." },
        ]);
      }
    });

    it("top-level errors short-circuit item validation entirely — an invalid item never surfaces alongside a top-level error", () => {
      const result = validateEditorialTimingPatchShape({
        schemaVersion: "wrong",
        sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
        projectId: 1,
        sequenceId: 2,
        items: [{ id: "not-a-number" }],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain("Unexpected schemaVersion");
      }
    });
  });

  describe("nominal acceptance", () => {
    it("accepts a fully valid patch and returns the reconstructed patch object", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.patch).toEqual({
          schemaVersion: EDITORIAL_TIMING_PATCH_SCHEMA_VERSION,
          sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
          projectId: 1,
          sequenceId: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          sourceEditorialSnapshot: undefined,
          items: [{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }],
        });
      }
    });

    it("falls back createdAt to the current time when missing or not a string — characterization, not asserted exactly", () => {
      const input = validPatchInput();
      delete (input as Record<string, unknown>).createdAt;
      const before = Date.now();
      const result = validateEditorialTimingPatchShape(input);
      const after = Date.now();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const parsed = Date.parse(result.patch.createdAt);
        expect(parsed).toBeGreaterThanOrEqual(before);
        expect(parsed).toBeLessThanOrEqual(after);
      }
    });

    it("accepts an empty items array", () => {
      const result = validateEditorialTimingPatchShape(validPatchInput({ items: [] }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.patch.items).toEqual([]);
    });
  });
});

describe("planEditorialTimingPatch", () => {
  function existingShot(overrides: Partial<ExistingEditorialItemForPlan> = {}): ExistingEditorialItemForPlan {
    return {
      id: 10,
      type: "shot",
      shotId: 100,
      trackIndex: 0,
      startSeconds: 0,
      durationSeconds: 5,
      trimInSeconds: null,
      trimOutSeconds: null,
      ...overrides,
    };
  }

  function patchFor(items: MikAIEditorialTimingPatchV1["items"]): MikAIEditorialTimingPatchV1 {
    return {
      schemaVersion: EDITORIAL_TIMING_PATCH_SCHEMA_VERSION,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      projectId: 1,
      sequenceId: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      items,
    };
  }

  it("plans a straightforward move: nextStartSeconds reflects the patch, willUpdateStartSeconds true beyond epsilon", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot()],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        id: 10,
        shotId: 100,
        currentStartSeconds: 0,
        nextStartSeconds: 3,
        currentDurationSeconds: 5,
        patchDurationSeconds: 5,
        willUpdateStartSeconds: true,
      },
    ]);
  });

  it("rejects the whole patch when projectId or sequenceId don't match the endpoint's own", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot()],
    });
    expect(result.ok).toBe(true);

    const wrongProject = planEditorialTimingPatch({
      projectId: 999,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot()],
    });
    expect(wrongProject.ok).toBe(false);
    expect(wrongProject.items).toEqual([]);
    expect(wrongProject.errors[0].message).toBe(
      "Patch targets project 1/sequence 2, but this endpoint is for project 999/sequence 2."
    );
  });

  it("reports 'Item not found' for a patch item id absent from existingItems", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 999, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot()],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ itemId: 999, message: "Item not found in this sequence." }]);
  });

  it("refuses a patch item that targets a gap-type existing row", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot({ type: "gap", shotId: null })],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ itemId: 10, message: "Item is not a shot-backed item." }]);
  });

  it("refuses a shotId mismatch with a message naming both the current and the patched shotId", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 555, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot({ shotId: 100 })],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { itemId: 10, message: "shotId mismatch — item belongs to shot 100, patch specifies 555." },
    ]);
  });

  it("refuses a duration change beyond the epsilon, but tolerates one within it", () => {
    const beyond = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5.2 }]),
      existingItems: [existingShot({ durationSeconds: 5 })],
    });
    expect(beyond.ok).toBe(false);
    expect(beyond.errors).toEqual([
      { itemId: 10, message: "Duration changes are not supported by this importer yet." },
    ]);

    const within = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 + TIMING_EPSILON_SECONDS / 2 }]),
      existingItems: [existingShot({ durationSeconds: 5 })],
    });
    expect(within.ok).toBe(true);
  });

  it("willUpdateStartSeconds is false exactly at the epsilon boundary, true just beyond it", () => {
    const atEpsilon = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: TIMING_EPSILON_SECONDS, durationSeconds: 5 }]),
      existingItems: [existingShot({ startSeconds: 0 })],
    });
    expect(atEpsilon.ok).toBe(true);
    expect(atEpsilon.items[0].willUpdateStartSeconds).toBe(false);

    const beyondEpsilon = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: TIMING_EPSILON_SECONDS + 0.001, durationSeconds: 5 }]),
      existingItems: [existingShot({ startSeconds: 0 })],
    });
    expect(beyondEpsilon.ok).toBe(true);
    expect(beyondEpsilon.items[0].willUpdateStartSeconds).toBe(true);
  });

  it("treats a null existing startSeconds as 0 for currentStartSeconds", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 10, shotId: 100, startSeconds: 3, durationSeconds: 5 }]),
      existingItems: [existingShot({ startSeconds: null })],
    });
    expect(result.ok).toBe(true);
    expect(result.items[0].currentStartSeconds).toBe(0);
  });

  it("detects an overlap between two patched items on the same track, naming both item ids", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([
        { id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 },
        { id: 11, shotId: 200, startSeconds: 2, durationSeconds: 5 },
      ]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, startSeconds: 10, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { message: "Overlap detected on track 0 between item 10 and item 11." },
    ]);
    expect(result.items).toEqual([]);
  });

  it("treats exactly-touching items (curr.start == prevEnd) as not overlapping", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 11, shotId: 200, startSeconds: 5, durationSeconds: 5 }]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, startSeconds: 20, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("an un-patched existing item still participates as an overlap obstacle at its current position", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 11, shotId: 200, startSeconds: 2, durationSeconds: 5 }]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }), // not in the patch
        existingShot({ id: 11, shotId: 200, startSeconds: 20, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain("Overlap detected on track 0");
  });

  it("an unpositioned existing item (startSeconds null) is never an overlap obstacle", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 11, shotId: 200, startSeconds: 0, durationSeconds: 5 }]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: null, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, startSeconds: 20, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("does not run the overlap check at all once any item-level error exists — even an otherwise-overlapping pair is silent", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([
        { id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 },
        { id: 11, shotId: 200, startSeconds: 2, durationSeconds: 5 }, // would overlap item 10
        { id: 999, shotId: 1, startSeconds: 0, durationSeconds: 1 }, // triggers "not found"
      ]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, startSeconds: 10, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ itemId: 999, message: "Item not found in this sequence." }]);
  });

  it("preserves the plan items' order as the order of patch.items, not any sorted order", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([
        { id: 11, shotId: 200, startSeconds: 30, durationSeconds: 5 },
        { id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 },
      ]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, startSeconds: 20, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual([11, 10]);
  });

  it("does not detect an overlap across two different tracks", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([{ id: 11, shotId: 200, startSeconds: 2, durationSeconds: 5 }]),
      existingItems: [
        existingShot({ id: 10, shotId: 100, trackIndex: 0, startSeconds: 0, durationSeconds: 5 }),
        existingShot({ id: 11, shotId: 200, trackIndex: 1, startSeconds: 20, durationSeconds: 5 }),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("characterization — duplicate patch entries for the same item id both produce a plan item (no de-duplication guard)", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([
        { id: 10, shotId: 100, startSeconds: 1, durationSeconds: 5 },
        { id: 10, shotId: 100, startSeconds: 2, durationSeconds: 5 },
      ]),
      existingItems: [existingShot({ id: 10, shotId: 100, startSeconds: 0, durationSeconds: 5 })],
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.nextStartSeconds)).toEqual([1, 2]);
  });

  it("empty patch items produces an ok, empty plan", () => {
    const result = planEditorialTimingPatch({
      projectId: 1,
      sequenceId: 2,
      patch: patchFor([]),
      existingItems: [existingShot()],
    });
    expect(result.ok).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
