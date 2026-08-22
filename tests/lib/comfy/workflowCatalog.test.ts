import { describe, it, expect } from "vitest";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_CATEGORY_IDS,
  WORKFLOW_CONTEXTS,
  WORKFLOW_CONTEXT_IDS,
  isWorkflowCategoryId,
  isWorkflowOfferedIn,
  parseTagsInput,
  parseWorkflowContexts,
  parseWorkflowTags,
  validateWorkflowContexts,
  validateWorkflowTags,
  type WorkflowOfferInput,
} from "@/lib/comfy/workflowCatalog";

// ---------------------------------------------------------------------------
// Registry consistency
// ---------------------------------------------------------------------------

describe("WORKFLOW_CONTEXTS", () => {
  it("has exactly the six contexts the ticket names, and no other", () => {
    expect(WORKFLOW_CONTEXT_IDS).toEqual([
      "shot-keyframe",
      "shot-video",
      "asset",
      "storyboard",
      "storyboard-video",
      "look-development",
    ]);
    expect(Object.keys(WORKFLOW_CONTEXTS).sort()).toEqual([...WORKFLOW_CONTEXT_IDS].sort());
  });

  it("every registry entry has a label and a non-empty kinds list", () => {
    for (const id of WORKFLOW_CONTEXT_IDS) {
      const def = WORKFLOW_CONTEXTS[id];
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.kinds.length).toBeGreaterThan(0);
    }
  });
});

describe("WORKFLOW_CATEGORIES", () => {
  it("has exactly the eight categories validated by the user against the real workflow library on 2026-08-22, in order", () => {
    expect(WORKFLOW_CATEGORY_IDS).toEqual([
      "text-to-image",
      "image-edit",
      "character-props",
      "multi-view",
      "storyboard",
      "video",
      "gaussian-camera",
      "utility",
    ]);
    expect(Object.keys(WORKFLOW_CATEGORIES).sort()).toEqual([...WORKFLOW_CATEGORY_IDS].sort());
  });

  it("every category has a label", () => {
    for (const id of WORKFLOW_CATEGORY_IDS) {
      expect(typeof WORKFLOW_CATEGORIES[id].label).toBe("string");
      expect(WORKFLOW_CATEGORIES[id].label.length).toBeGreaterThan(0);
    }
  });
});

describe("isWorkflowCategoryId", () => {
  it("accepts every id in the closed registry", () => {
    for (const id of WORKFLOW_CATEGORY_IDS) {
      expect(isWorkflowCategoryId(id)).toBe(true);
    }
  });

  it("refuses an unknown id", () => {
    expect(isWorkflowCategoryId("not-a-real-category")).toBe(false);
  });

  it("refuses \"look\", the id retired from the first (inferred) version of this registry", () => {
    expect(isWorkflowCategoryId("look")).toBe(false);
  });

  it("refuses \"keyframe\", the other id retired from the first (inferred) version of this registry", () => {
    expect(isWorkflowCategoryId("keyframe")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWorkflowOfferedIn — the three rules, separately
// ---------------------------------------------------------------------------

function offer(overrides: Partial<WorkflowOfferInput> = {}): WorkflowOfferInput {
  return {
    kind: "image",
    contexts: null,
    status: "active",
    ...overrides,
  };
}

describe("isWorkflowOfferedIn", () => {
  it("rule 1: an archived workflow is never offered, even when kind and contexts otherwise match", () => {
    const workflow = offer({ status: "archived", kind: "image", contexts: ["shot-keyframe"] });
    expect(isWorkflowOfferedIn(workflow, "shot-keyframe")).toBe(false);
  });

  it("rule 2: a kind incompatible with the context is refused even when the context is explicitly listed", () => {
    // shot-keyframe only accepts "image" — a "video" workflow explicitly
    // listing "shot-keyframe" is still refused.
    const workflow = offer({ kind: "video", contexts: ["shot-keyframe"] });
    expect(isWorkflowOfferedIn(workflow, "shot-keyframe")).toBe(false);
  });

  it("rule 3: contexts === null is offered everywhere the kind allows (pre-migration behaviour)", () => {
    const workflow = offer({ kind: "image", contexts: null, status: "active" });
    expect(isWorkflowOfferedIn(workflow, "shot-keyframe")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "asset")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "storyboard")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "look-development")).toBe(true);
    // but still bound by rule 2 — kind must be accepted by the context
    expect(isWorkflowOfferedIn(workflow, "shot-video")).toBe(false);
    expect(isWorkflowOfferedIn(workflow, "storyboard-video")).toBe(false);
  });

  it("rule 3: a non-null contexts list restricts to the listed contexts only", () => {
    const workflow = offer({ kind: "image", contexts: ["asset"] });
    expect(isWorkflowOfferedIn(workflow, "asset")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "shot-keyframe")).toBe(false);
  });

  it("look-development accepts both image and video", () => {
    expect(isWorkflowOfferedIn(offer({ kind: "image" }), "look-development")).toBe(true);
    expect(isWorkflowOfferedIn(offer({ kind: "video" }), "look-development")).toBe(true);
  });

  it("end to end: a workflow whose stored contexts column is all unknown ids (e.g. a removed/renamed context) stays offered where its kind allows, not dropped silently", () => {
    // The exact chain a gallery page runs: DB column -> parseWorkflowContexts
    // -> isWorkflowOfferedIn. If parseWorkflowContexts ever regressed to
    // returning [] here instead of null, this workflow would vanish from
    // every gallery with no error.
    const contexts = parseWorkflowContexts('["camera-lab"]');
    const workflow = offer({ kind: "image", contexts });
    expect(isWorkflowOfferedIn(workflow, "shot-keyframe")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "asset")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "storyboard")).toBe(true);
    expect(isWorkflowOfferedIn(workflow, "look-development")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Read side — parseWorkflowTags / parseWorkflowContexts — tolerant, never throw
// ---------------------------------------------------------------------------

describe("parseWorkflowTags — tolerant read", () => {
  it("null degrades to []", () => {
    expect(parseWorkflowTags(null)).toEqual([]);
  });

  it("empty string degrades to []", () => {
    expect(parseWorkflowTags("")).toEqual([]);
  });

  it("broken JSON degrades to [] without throwing", () => {
    expect(() => parseWorkflowTags("{not json")).not.toThrow();
    expect(parseWorkflowTags("{not json")).toEqual([]);
  });

  it("a non-array JSON value degrades to []", () => {
    expect(parseWorkflowTags('{"a":1}')).toEqual([]);
  });

  it("drops non-string and blank entries, keeps valid ones", () => {
    expect(parseWorkflowTags('["cinematic", 42, "", "  ", "noir"]')).toEqual(["cinematic", "noir"]);
  });

  it("a well-formed array parses through", () => {
    expect(parseWorkflowTags('["cinematic","noir"]')).toEqual(["cinematic", "noir"]);
  });
});

describe("parseWorkflowContexts — tolerant read", () => {
  it("null degrades to null (offered everywhere the kind allows)", () => {
    expect(parseWorkflowContexts(null)).toBeNull();
  });

  it("empty string degrades to null", () => {
    expect(parseWorkflowContexts("")).toBeNull();
  });

  it("broken JSON degrades to null without throwing", () => {
    expect(() => parseWorkflowContexts("[not json")).not.toThrow();
    expect(parseWorkflowContexts("[not json")).toBeNull();
  });

  it("a non-array JSON value degrades to null", () => {
    expect(parseWorkflowContexts('{"a":1}')).toBeNull();
  });

  it("an array containing an unknown id drops that entry, keeps the known ones", () => {
    expect(parseWorkflowContexts('["asset", "not-a-real-context", "storyboard"]')).toEqual([
      "asset",
      "storyboard",
    ]);
  });

  it("an array whose entries are ALL unknown ids degrades to null, not []", () => {
    // A context can be renamed or removed from the registry; a row still
    // storing the old id must fall back to "unspecified" (offered
    // everywhere the kind allows), not to "explicitly offered nowhere".
    expect(parseWorkflowContexts('["camera-lab"]')).toBeNull();
  });

  it("an explicit empty array degrades to null, not []", () => {
    // validateWorkflowContexts refuses an empty array at write time, so a
    // stored [] can only be corruption — it degrades the same way any other
    // unreadable value does.
    expect(parseWorkflowContexts("[]")).toBeNull();
  });

  it("a well-formed array parses through", () => {
    expect(parseWorkflowContexts('["asset","storyboard"]')).toEqual(["asset", "storyboard"]);
  });
});

// ---------------------------------------------------------------------------
// parseTagsInput — WF.CATALOG.2 §2.1, the comma-separated form field parser
// ---------------------------------------------------------------------------

describe("parseTagsInput", () => {
  it("an empty string produces no tags", () => {
    expect(parseTagsInput("")).toEqual([]);
  });

  it("multiple commas, including empty segments, are dropped", () => {
    expect(parseTagsInput("storyboard,,gemini,,,rapide")).toEqual([
      "storyboard",
      "gemini",
      "rapide",
    ]);
  });

  it("surrounding and inner whitespace is trimmed", () => {
    expect(parseTagsInput("  storyboard ,  gemini  ,   rapide  ")).toEqual([
      "storyboard",
      "gemini",
      "rapide",
    ]);
  });

  it("case-insensitive duplicates collapse, keeping the first spelling seen", () => {
    expect(parseTagsInput("Gemini, gemini, GEMINI")).toEqual(["Gemini"]);
  });

  it("a single tag with no comma parses through", () => {
    expect(parseTagsInput("storyboard")).toEqual(["storyboard"]);
  });
});

// ---------------------------------------------------------------------------
// parseTagsInput -> JSON.stringify -> validateWorkflowTags — the real path
// the action runs. Whatever a user types must either pass the strict
// validator or be refused for a named reason.
// ---------------------------------------------------------------------------

describe("parseTagsInput through validateWorkflowTags", () => {
  function submit(raw: string) {
    const parsed = parseTagsInput(raw);
    if (parsed.length === 0) return { ok: true as const, value: null };
    return validateWorkflowTags(JSON.stringify(parsed));
  }

  it("an empty field is valid, no tags stored", () => {
    expect(submit("")).toEqual({ ok: true, value: null });
  });

  it("a normal comma-separated list passes through untouched", () => {
    expect(submit("storyboard, gemini, rapide")).toEqual({
      ok: true,
      value: ["storyboard", "gemini", "rapide"],
    });
  });

  it("case-insensitive duplicates typed by the user never reach validateWorkflowTags as duplicates", () => {
    // parseTagsInput already dedupes case-insensitively, so the strict
    // validator (which only catches exact-string duplicates) never sees two
    // entries that differ only by case.
    expect(submit("Gemini, gemini")).toEqual({ ok: true, value: ["Gemini"] });
  });

  it("whitespace-only input is treated as empty, not as a blank tag", () => {
    expect(submit("   ,  ,  ")).toEqual({ ok: true, value: null });
  });
});

// ---------------------------------------------------------------------------
// Write side — validateWorkflowTags / validateWorkflowContexts — strict,
// named refusal. Same corrupt inputs as the read-side tests, refused
// explicitly instead of degrading.
// ---------------------------------------------------------------------------

describe("validateWorkflowTags — strict write", () => {
  it("null is valid (no tags)", () => {
    expect(validateWorkflowTags(null)).toEqual({ ok: true, value: null });
  });

  it("broken JSON is refused with a named error", () => {
    const result = validateWorkflowTags("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-json");
  });

  it("a non-array JSON value is refused", () => {
    const result = validateWorkflowTags('{"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-shape");
  });

  it("an empty array is refused explicitly", () => {
    const result = validateWorkflowTags("[]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty");
  });

  it("a duplicate tag is refused", () => {
    const result = validateWorkflowTags('["noir","noir"]');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("duplicate");
  });

  it("a well-formed array is accepted, trimmed", () => {
    expect(validateWorkflowTags('[" cinematic ","noir"]')).toEqual({
      ok: true,
      value: ["cinematic", "noir"],
    });
  });
});

describe("validateWorkflowContexts — strict write", () => {
  it("null is valid (offered everywhere the kind allows)", () => {
    expect(validateWorkflowContexts(null)).toEqual({ ok: true, value: null });
  });

  it("broken JSON is refused with a named error", () => {
    const result = validateWorkflowContexts("[not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-json");
  });

  it("a non-array JSON value is refused", () => {
    const result = validateWorkflowContexts('{"a":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-shape");
  });

  it("an empty array is refused explicitly", () => {
    const result = validateWorkflowContexts("[]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty");
  });

  it("an unknown context id is refused, even mixed with known ones", () => {
    const result = validateWorkflowContexts('["asset","not-a-real-context"]');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown-context");
      expect(result.error).toMatchObject({ value: "not-a-real-context" });
    }
  });

  it("a duplicate context id is refused", () => {
    const result = validateWorkflowContexts('["asset","asset"]');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("duplicate");
  });

  it("a well-formed array is accepted", () => {
    expect(validateWorkflowContexts('["asset","storyboard"]')).toEqual({
      ok: true,
      value: ["asset", "storyboard"],
    });
  });
});
