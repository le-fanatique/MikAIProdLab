import { describe, expect, it } from "vitest";
import { CAMERA_VOCABULARY, getCameraVocabularyAxis,
  writtenCameraVocabularyValue,
} from "@/lib/cameraVocabulary";
import {
  renderCameraFieldSchemaLine,
  renderCameraInstructionRulesBlock,
  type CameraInstructionFieldId,
} from "@/lib/llmWorkspace/cameraInstruction";
import { shotsFromSequenceDescriptor } from "@/lib/llmWorkspace/descriptors/shotsFromSequence";
import { shotInsertDirectedDescriptor } from "@/lib/llmWorkspace/descriptors/shotInsertDirected";

// ---------------------------------------------------------------------------
// B19d — cameraInstruction.ts is the only place that renders
// cameraVocabulary.ts into prompt text. Every assertion below is checked
// against the vocabulary itself (never a copied-out literal list), so a
// value added to/removed from cameraVocabulary.ts moves these tests without
// editing them, and a mutation that drops a value from the render path
// breaks a test here.
// ---------------------------------------------------------------------------

const FIELD_IDS: CameraInstructionFieldId[] = [
  "shot_size",
  "camera_position",
  "camera_movement",
  "movement_speed",
  "camera_subject",
];

describe("renderCameraFieldSchemaLine", () => {
  it("emits a line for every field, keyed by its own JSON key", () => {
    for (const fieldId of FIELD_IDS) {
      expect(renderCameraFieldSchemaLine(fieldId)).toMatch(new RegExp(`^"${fieldId}":`));
    }
  });

  it("shot_size lists every shotSize code and names the start-to-end interval", () => {
    const line = renderCameraFieldSchemaLine("shot_size");
    const axis = getCameraVocabularyAxis("shotSize");
    for (const value of axis.values) {
      expect(line).toContain(writtenCameraVocabularyValue(axis, value));
    }
    expect(line).toContain("MS to WS");
  });

  it("camera_position lists every cameraPosition code, including eye_level twice (two independent groups)", () => {
    const line = renderCameraFieldSchemaLine("camera_position");
    const axis = getCameraVocabularyAxis("cameraPosition");
    for (const value of axis.values) {
      expect(line).toContain(writtenCameraVocabularyValue(axis, value));
    }
    const eyeLevelOccurrences = axis.values.filter((v) => v.code === "eye_level").length;
    expect(eyeLevelOccurrences).toBe(2);
    expect(line.split("Eye Level").length - 1).toBe(2);
  });

  it("camera_movement lists every cameraMovement code and states one value only", () => {
    const line = renderCameraFieldSchemaLine("camera_movement");
    const axis = getCameraVocabularyAxis("cameraMovement");
    for (const value of axis.values) {
      expect(line).toContain(writtenCameraVocabularyValue(axis, value));
    }
    expect(line).toMatch(/one value only/i);
  });

  it("movement_speed lists every movementSpeed code", () => {
    const line = renderCameraFieldSchemaLine("movement_speed");
    const axis = getCameraVocabularyAxis("movementSpeed");
    for (const value of axis.values) {
      expect(line).toContain(writtenCameraVocabularyValue(axis, value));
    }
  });

  it("camera_subject carries no palette list — it is prose, matching the vocabulary's own empty values array", () => {
    expect(getCameraVocabularyAxis("cameraSubject").values).toEqual([]);
    const line = renderCameraFieldSchemaLine("camera_subject");
    expect(line).toMatch(/prose/i);
    expect(line).toMatch(/movement \+ subject/i);
  });

  it("only shot_size mentions an interval — the other three palette fields do not", () => {
    expect(renderCameraFieldSchemaLine("camera_position")).not.toContain("interval");
    expect(renderCameraFieldSchemaLine("camera_movement")).not.toContain("interval");
    expect(renderCameraFieldSchemaLine("movement_speed")).not.toContain("interval");
  });
});

describe("renderCameraInstructionRulesBlock", () => {
  const block = renderCameraInstructionRulesBlock();

  it("mentions every value of every palette axis at least once", () => {
    for (const axis of CAMERA_VOCABULARY) {
      if (axis.id === "cameraSubject") continue; // no palette
      for (const value of axis.values) {
        expect(block).toContain(writtenCameraVocabularyValue(axis, value));
      }
    }
  });

  it("allows shot_size's start-to-end interval, sourced to the Seedance 2.5 guide's starting/ending shot size", () => {
    expect(block).toContain('"MS to WS"');
  });

  it("forbids a combination on camera_movement, one movement only", () => {
    expect(block).toMatch(/one movement only/i);
    expect(block).toMatch(/never two combined/i);
  });

  it("states camera_subject's formula and its 'no bare term' rule", () => {
    expect(block).toMatch(/movement \+ subject \+ start \+ direction \+ arrival/);
    expect(block).toMatch(/do not use only a term detached from its subject/i);
  });

  it("tolerates an out-of-palette value without inviting invention", () => {
    expect(block).toMatch(/accepted as written/i);
    expect(block).toMatch(/never invent/i);
  });

  it("is identical on every call — deterministic, no hidden state", () => {
    expect(renderCameraInstructionRulesBlock()).toBe(block);
  });

  // CAM.POSITION.COMPOSITE.1 — see the schema-line describe below for the
  // defect this pins. The rules block used to say camera_position was
  // "exactly one value from this set" while the schema line showed it three
  // labelled groups; the model followed the shape and the prose lost.
  it("asks camera_position for one value per group, never one value overall", () => {
    expect(block).toMatch(/one value from each group/i);
    expect(block).not.toMatch(/camera_position is exactly one value/i);
  });

  it("exempts camera_position from the no-combination rule, as it does shot_size's interval", () => {
    const noProseLine = block
      .split("\n")
      .find((line) => /^- None of the four fields above/i.test(line));
    expect(noProseLine).toBeDefined();
    expect(noProseLine).toMatch(/camera_position/);
  });
});

describe("renderCameraFieldSchemaLine — the block calls itself valid JSON", () => {
  // The instruction introduces this block with "Always respond with a valid
  // JSON object matching exactly this schema". A line that is not itself valid
  // JSON shows the model a malformed example of the very format it is being
  // asked to produce.
  //
  // shot_size did exactly that: its interval example was written "MS to WS"
  // with double quotes, inside a double-quoted string, so the value ended
  // early. Nothing caught it — the rules block was fine, and only the rendered
  // prompt showed it.
  const FIELDS = [
    "shot_size",
    "camera_position",
    "camera_movement",
    "movement_speed",
    "camera_subject",
    "camera_lens",
  ] as const;

  for (const field of FIELDS) {
    it(`${field}'s schema line parses as JSON`, () => {
      const line = renderCameraFieldSchemaLine(field);
      expect(() => JSON.parse(`{${line}}`)).not.toThrow();
    });
  }

  it("every schema line is a single key whose value is a string", () => {
    for (const field of FIELDS) {
      const parsed = JSON.parse(`{${renderCameraFieldSchemaLine(field)}}`) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual([field]);
      expect(typeof parsed[field]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// CAM.POSITION.COMPOSITE.1 — camera_position holds three answers, and the
// column must be able to hold all three.
//
// Found on Sq_5000, generated by the author on 2026-08-24: all six shots
// stored a `tilt: … , height: … , role: …` composite, and three of them were
// cut mid-word by `truncateTo: 50` — `role: Over-`, `role: Rear Vie`,
// `role: Establish`, the remains of "Over-the-Shoulder (OTS)", "Rear View"
// and "Establishing Shot". No error, no warning, a silently worse prompt.
//
// The 50 was B19d's guard against a model writing prose into a palette
// field, and it is right for the four axes that carry ONE value. It is wrong
// for camera_position, which the vocabulary itself declares as three
// independent questions (tilt / height / placement) that must never be
// elided — so a correct answer names all three and cannot fit.
//
// The worst case is derived from the vocabulary rather than typed as a
// literal: adding a longer label anywhere in cameraPosition moves this test
// on its own, instead of letting the bound silently become too small again.
// ---------------------------------------------------------------------------

describe("camera_position's stored bound fits the composite the instruction asks for", () => {
  const COMPOSITE_GROUPS = ["inclination", "height", "placement"] as const;

  /** The longest `tilt: X, height: Y, role: Z` the catalogue can produce. */
  function longestComposite(): string {
    const axis = getCameraVocabularyAxis("cameraPosition");
    const labels: Record<string, string> = { inclination: "tilt", height: "height", placement: "role" };
    return COMPOSITE_GROUPS.map((group) => {
      const longest = axis.values
        .filter((v) => v.group === group)
        .map((v) => writtenCameraVocabularyValue(axis, v))
        .sort((a, b) => b.length - a.length)[0];
      return `${labels[group]}: ${longest}`;
    }).join(", ");
  }

  function cameraPositionBound(fields: readonly unknown[]): number | undefined {
    const field = fields.find(
      (f): f is { type: "string"; jsonKey: string; truncateTo?: number } =>
        typeof f === "object" && f !== null && (f as { jsonKey?: string }).jsonKey === "camera_position"
    );
    return field?.truncateTo;
  }

  it("the catalogue really can produce a composite longer than 50 characters", () => {
    expect(longestComposite().length).toBeGreaterThan(50);
  });

  it("shots.fromSequence stores camera_position without cutting the longest composite", () => {
    const output = shotsFromSequenceDescriptor.output;
    expect(output.kind).toBe("list");
    const bound = cameraPositionBound(
      (output as { item: { fields: readonly unknown[] } }).item.fields
    );
    expect(bound).toBeDefined();
    expect(bound!).toBeGreaterThanOrEqual(longestComposite().length);
  });

  it("shot.insertDirected stores camera_position without cutting the longest composite", () => {
    const output = shotInsertDirectedDescriptor.output;
    const bound = cameraPositionBound((output as { fields: readonly unknown[] }).fields);
    expect(bound).toBeDefined();
    expect(bound!).toBeGreaterThanOrEqual(longestComposite().length);
  });
});
