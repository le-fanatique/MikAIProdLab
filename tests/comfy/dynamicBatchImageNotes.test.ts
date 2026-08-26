import { describe, expect, it } from "vitest";
import {
  buildBatchNoteParamKey,
  parseBatchImageNotesParam,
  serializeBatchImageNotesParam,
  pruneBatchImageNotes,
  resolveNoteOverride,
  MAX_BATCH_IMAGE_NOTE_LENGTH,
} from "@/lib/comfy/dynamicBatchImageNotes";

describe("buildBatchNoteParamKey", () => {
  it("builds the sibling param key from the batch node id", () => {
    expect(buildBatchNoteParamKey("42")).toBe("batchImageNotes_42");
  });
});

// SHOTPROMPT.REFS.2 — "the encoding trap is real": `batchImageRoles_<nodeId>`'s
// own `id:role,id:role` format does not survive a note containing a comma, a
// colon, or a non-ASCII character. This is the round trip proving the sibling
// param's own encoding does, written before the encoding functions themselves.
describe("serializeBatchImageNotesParam / parseBatchImageNotesParam — round trip", () => {
  it("survives a comma, a colon and an accented character in the same note", () => {
    const notes = { "shot-4": "reference for the first image of the shot: café, château" };
    const serialized = serializeBatchImageNotesParam(notes);
    expect(parseBatchImageNotesParam(serialized)).toEqual(notes);
  });

  it("round-trips several ids, each with its own note", () => {
    const notes = {
      "shot-1": "background plate",
      "asset-2-9": "keep the scar visible, no smiling",
    };
    const serialized = serializeBatchImageNotesParam(notes);
    expect(parseBatchImageNotesParam(serialized)).toEqual(notes);
  });

  it("serializes {} to an empty string, and parses '' back to {}", () => {
    expect(serializeBatchImageNotesParam({})).toBe("");
    expect(parseBatchImageNotesParam("")).toEqual({});
  });

  it("returns {} for null/undefined input — absent param behaves as before this ticket", () => {
    expect(parseBatchImageNotesParam(null)).toEqual({});
    expect(parseBatchImageNotesParam(undefined)).toEqual({});
  });

  it("drops entries with a blank note or a blank id rather than guessing", () => {
    const raw = `${encodeURIComponent("")}:x,shot-1:${encodeURIComponent("   ")},shot-2:${encodeURIComponent("kept")}`;
    expect(parseBatchImageNotesParam(raw)).toEqual({ "shot-2": "kept" });
  });

  it("truncates a note longer than MAX_BATCH_IMAGE_NOTE_LENGTH before serializing", () => {
    const longNote = "x".repeat(MAX_BATCH_IMAGE_NOTE_LENGTH + 50);
    const serialized = serializeBatchImageNotesParam({ "shot-1": longNote });
    const parsed = parseBatchImageNotesParam(serialized);
    expect(parsed["shot-1"].length).toBe(MAX_BATCH_IMAGE_NOTE_LENGTH);
  });
});

describe("pruneBatchImageNotes — mirrors pruneBatchRoleOverrides", () => {
  it("drops a note for an id no longer in the selection", () => {
    const notes = { "shot-1": "a", "shot-2": "b" };
    expect(pruneBatchImageNotes(notes, ["shot-1"])).toEqual({ "shot-1": "a" });
  });

  it("keeps every note whose id is still selected", () => {
    const notes = { "shot-1": "a" };
    expect(pruneBatchImageNotes(notes, ["shot-1", "shot-2"])).toEqual({ "shot-1": "a" });
  });

  it("returns {} when every noted id was removed", () => {
    expect(pruneBatchImageNotes({ "shot-1": "a" }, [])).toEqual({});
  });
});

describe("resolveNoteOverride", () => {
  it("returns the note for the given id", () => {
    expect(resolveNoteOverride("shot-1", { "shot-1": "reference for the first frame" })).toBe(
      "reference for the first frame"
    );
  });

  it("returns null when no note exists for that id", () => {
    expect(resolveNoteOverride("shot-1", { "shot-2": "x" })).toBeNull();
  });

  it("returns null when overrides is undefined — absent param behaves as before this ticket", () => {
    expect(resolveNoteOverride("shot-1", undefined)).toBeNull();
  });
});
