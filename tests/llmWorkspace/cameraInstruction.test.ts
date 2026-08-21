import { describe, expect, it } from "vitest";
import { CAMERA_VOCABULARY, getCameraVocabularyAxis } from "@/lib/cameraVocabulary";
import {
  renderCameraFieldSchemaLine,
  renderCameraInstructionRulesBlock,
  type CameraInstructionFieldId,
} from "@/lib/llmWorkspace/cameraInstruction";

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
    for (const value of getCameraVocabularyAxis("shotSize").values) {
      expect(line).toContain(value.code);
    }
    expect(line).toContain("MS to WS");
  });

  it("camera_position lists every cameraPosition code, including eye_level twice (two independent groups)", () => {
    const line = renderCameraFieldSchemaLine("camera_position");
    const axis = getCameraVocabularyAxis("cameraPosition");
    for (const value of axis.values) {
      expect(line).toContain(value.code);
    }
    const eyeLevelOccurrences = axis.values.filter((v) => v.code === "eye_level").length;
    expect(eyeLevelOccurrences).toBe(2);
    expect(line.split("eye_level").length - 1).toBe(2);
  });

  it("camera_movement lists every cameraMovement code and states one value only", () => {
    const line = renderCameraFieldSchemaLine("camera_movement");
    for (const value of getCameraVocabularyAxis("cameraMovement").values) {
      expect(line).toContain(value.code);
    }
    expect(line).toMatch(/one value only/i);
  });

  it("movement_speed lists every movementSpeed code", () => {
    const line = renderCameraFieldSchemaLine("movement_speed");
    for (const value of getCameraVocabularyAxis("movementSpeed").values) {
      expect(line).toContain(value.code);
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
        expect(block).toContain(value.code);
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
});
