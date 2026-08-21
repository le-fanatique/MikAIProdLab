import { describe, expect, it } from "vitest";
import {
  CAMERA_VOCABULARY,
  getCameraVocabularyAxis,
  getCameraVocabularyValueDefinition,
  isKnownCameraVocabularyValue,
  normalizeCameraVocabularyValue,
  recognizeCameraVocabularyValue,
} from "@/lib/cameraVocabulary";

// ---------------------------------------------------------------------------
// B19a — the camera vocabulary, declared once. This module wires nothing:
// the net below only proves the declaration and its alias/palette contract.
// ---------------------------------------------------------------------------

describe("axis declaration", () => {
  it("declares exactly the six axes, each with a label and a definition", () => {
    const ids = CAMERA_VOCABULARY.map((a) => a.id).sort();
    expect(ids).toEqual(
      ["cameraMovement", "cameraPosition", "cameraSubject", "cameraLens", "movementSpeed", "shotSize"].sort()
    );
    for (const axis of CAMERA_VOCABULARY) {
      expect(axis.label.length).toBeGreaterThan(0);
      expect(axis.definition.length).toBeGreaterThan(0);
    }
  });

  it("cameraSubject carries no values — prose only, per the ticket", () => {
    expect(getCameraVocabularyAxis("cameraSubject").values).toEqual([]);
  });

  it("every declared value carries a code, a label and a non-empty definition", () => {
    for (const axis of CAMERA_VOCABULARY) {
      for (const value of axis.values) {
        expect(value.code.length).toBeGreaterThan(0);
        expect(value.label.length).toBeGreaterThan(0);
        expect(value.definition.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("casing and spacing do not change the canonical value", () => {
  it("static / Static / STATIC all resolve to the same code", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "static")).toBe("static");
    expect(normalizeCameraVocabularyValue("cameraMovement", "Static")).toBe("static");
    expect(normalizeCameraVocabularyValue("cameraMovement", "STATIC")).toBe("static");
    expect(normalizeCameraVocabularyValue("cameraMovement", "  static  ")).toBe("static");
  });

  it("a spaced code and its underscore code resolve the same way", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly in")).toBe("dolly_in");
    expect(normalizeCameraVocabularyValue("cameraMovement", "Dolly In")).toBe("dolly_in");
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly_in")).toBe("dolly_in");
  });
});

describe("real-data alias decisions", () => {
  it("tracking and track are the same value — both already exist in this app's own two disagreeing copies for the same undirected follow movement", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "tracking")).toBe("tracking");
    expect(normalizeCameraVocabularyValue("cameraMovement", "track")).toBe("tracking");
    expect(normalizeCameraVocabularyValue("cameraMovement", "Track")).toBe("tracking");
  });

  it("tracking is never silently aliased to a directed truck value", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "tracking")).not.toBe("truck_left");
    expect(normalizeCameraVocabularyValue("cameraMovement", "tracking")).not.toBe("truck_right");
  });

  it("dolly (bare) and dolly in / dolly out are kept as three distinct values, never merged", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly")).toBe("dolly");
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly in")).toBe("dolly_in");
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly out")).toBe("dolly_out");
    // Bare "dolly" is never coerced into a direction it never stated.
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly")).not.toBe("dolly_in");
    expect(normalizeCameraVocabularyValue("cameraMovement", "dolly")).not.toBe("dolly_out");
  });

  it("locked-off is an alias of static, as the palette names them together", () => {
    expect(normalizeCameraVocabularyValue("cameraMovement", "locked-off")).toBe("static");
    expect(normalizeCameraVocabularyValue("cameraMovement", "locked off")).toBe("static");
  });
});

describe("out-of-palette values are signaled and returned as-is, never substituted", () => {
  it.each(["HS", "ELS", "floor-level"])("%s is unknown, not rejected", (raw) => {
    const result = recognizeCameraVocabularyValue("shotSize", raw);
    expect(result).toEqual({ kind: "unknown", raw });
  });

  it("an out-of-palette value is never coerced to a known code", () => {
    expect(normalizeCameraVocabularyValue("shotSize", "HS")).toBeNull();
    expect(isKnownCameraVocabularyValue("shotSize", "HS")).toBe(false);
  });

  it("MLS is out of the shotSize palette this ticket froze, even though one existing copy used it", () => {
    // Insert Shot's own copy lists MLS; the ticket's decided palette does
    // not. It is flagged, not silently added or rejected.
    expect(normalizeCameraVocabularyValue("shotSize", "MLS")).toBeNull();
  });
});

describe("size intervals are recognized as intervals, not as unknown values", () => {
  it('"MS to WS" is an interval', () => {
    expect(recognizeCameraVocabularyValue("shotSize", "MS to WS")).toEqual({
      kind: "interval",
      from: "MS",
      to: "WS",
    });
  });

  it("a hyphen and an arrow both split an interval", () => {
    expect(recognizeCameraVocabularyValue("shotSize", "MS - WS")).toEqual({
      kind: "interval",
      from: "MS",
      to: "WS",
    });
    expect(recognizeCameraVocabularyValue("shotSize", "MS → WS")).toEqual({
      kind: "interval",
      from: "MS",
      to: "WS",
    });
  });

  it("an interval needs BOTH sides in the palette — one out-of-palette side makes the whole value unknown, not a half-guessed interval", () => {
    expect(recognizeCameraVocabularyValue("shotSize", "HS to WS")).toEqual({
      kind: "unknown",
      raw: "HS to WS",
    });
  });

  it("cameraMovement has no interval shape — one movement per shot, decided alongside this palette", () => {
    expect(recognizeCameraVocabularyValue("cameraMovement", "pan to tilt")).toEqual({
      kind: "unknown",
      raw: "pan to tilt",
    });
  });

  it("OTS to MCU and CU to OTS are unknown, not intervals: OTS is a placement, not a shotSize value — the pair needs a human decision, not a silently accepted split", () => {
    expect(recognizeCameraVocabularyValue("shotSize", "OTS to MCU")).toEqual({
      kind: "unknown",
      raw: "OTS to MCU",
    });
    expect(recognizeCameraVocabularyValue("shotSize", "CU to OTS")).toEqual({
      kind: "unknown",
      raw: "CU to OTS",
    });
  });

  it('"MS tightening to CU" is unknown: the left side is not exactly a known shotSize code, and no simple rule recovers it without reopening the false positives below', () => {
    expect(recognizeCameraVocabularyValue("shotSize", "MS tightening to CU")).toEqual({
      kind: "unknown",
      raw: "MS tightening to CU",
    });
  });
});

describe("real-data non-regression: descriptions wrongly read as intervals", () => {
  // Found by running recognizeCameraVocabularyValue over the real shotSize
  // data (2026-08-21 audit) — these are shot descriptions from the
  // production database, not invented examples. Each has a space-padded
  // hyphen and was previously misread as an interval; each must now come
  // back unknown.
  it.each([
    "MS - Medium Shot of Max on phone call",
    "MS - Medium Shot of Max adjusting to the desk",
    "ELS - Eyes on Max, emphasizing his confident demea",
    "ELS - Eyes on Max, emphasizing his confidence and",
    "ELS - Eyes on Max, emphasizing his attention to de",
  ])("%s is unknown, not an interval", (raw) => {
    expect(recognizeCameraVocabularyValue("shotSize", raw)).toEqual({ kind: "unknown", raw });
  });
});

describe("known-value recognition", () => {
  it("a known code round-trips through recognition", () => {
    expect(recognizeCameraVocabularyValue("shotSize", "CU")).toEqual({ kind: "known", code: "CU" });
    expect(recognizeCameraVocabularyValue("cameraMovement", "Handheld")).toEqual({
      kind: "known",
      code: "handheld",
    });
  });

  it("getCameraVocabularyValueDefinition resolves aliases to the same definition", () => {
    const byCode = getCameraVocabularyValueDefinition("cameraMovement", "tracking");
    const byAlias = getCameraVocabularyValueDefinition("cameraMovement", "track");
    expect(byCode).not.toBeNull();
    expect(byAlias).toEqual(byCode);
  });
});

describe("cameraPosition's three groups", () => {
  it("Eye Level is present in both the inclination and the height group, deliberately not deduplicated", () => {
    const eyeLevelEntries = getCameraVocabularyAxis("cameraPosition").values.filter(
      (v) => v.code === "eye_level"
    );
    expect(eyeLevelEntries).toHaveLength(2);
    expect(eyeLevelEntries.map((v) => v.group).sort()).toEqual(["height", "inclination"]);
  });

  it("every cameraPosition value declares which of the three groups it answers", () => {
    for (const value of getCameraVocabularyAxis("cameraPosition").values) {
      expect(["inclination", "height", "placement"]).toContain(value.group);
    }
  });

  it("normalization still resolves Eye Level to one canonical code, regardless of which group asked", () => {
    expect(normalizeCameraVocabularyValue("cameraPosition", "Eye Level")).toBe("eye_level");
  });
});
