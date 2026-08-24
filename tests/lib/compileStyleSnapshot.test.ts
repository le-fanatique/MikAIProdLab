import { describe, it, expect } from "vitest";
import { compileStyleSnapshot, isStyleSnapshotEmpty } from "@/lib/projectStyle/compileStyleSnapshot";
import { EMPTY_STYLE_SNAPSHOT, type StyleRuleSnapshot, type StyleSnapshot } from "@/lib/projectStyle/styleSnapshot";

/** A rule with every field defaulted, overridable per-test — keeps each test
 * about only the field(s) it names. */
function makeRule(overrides: Partial<StyleRuleSnapshot>): StyleRuleSnapshot {
  return {
    instruction: "some instruction",
    pillar: null,
    section: null,
    category: null,
    strength: null,
    applicability: null,
    provenanceNotes: null,
    status: "approved",
    ...overrides,
  };
}

function snapshot(overrides: Partial<StyleSnapshot>): StyleSnapshot {
  return {
    ...EMPTY_STYLE_SNAPSHOT,
    world: { ...EMPTY_STYLE_SNAPSHOT.world },
    visual: { ...EMPTY_STYLE_SNAPSHOT.visual },
    rules: [...EMPTY_STYLE_SNAPSHOT.rules],
    ...overrides,
  };
}

describe("compileStyleSnapshot — emptiness and structure", () => {
  it("a completely empty style compiles to the empty string", () => {
    expect(compileStyleSnapshot(EMPTY_STYLE_SNAPSHOT)).toBe("");
    expect(isStyleSnapshotEmpty(EMPTY_STYLE_SNAPSHOT)).toBe(true);
  });

  it("brief alone compiles to just the Direction Brief block, trimmed", () => {
    const result = compileStyleSnapshot(snapshot({ directionBrief: "  A moody, painterly world.  " }));
    expect(result).toBe("Direction Brief:\nA moody, painterly world.");
  });

  it("a pillar alone (general direction only) compiles to just that pillar's block", () => {
    const result = compileStyleSnapshot(
      snapshot({
        world: { generalDirection: "  Rain-slick neon streets.  ", negativeConstraints: null, sections: [] },
      })
    );
    expect(result).toBe("World & Design Language:\nRain-slick neon streets.");
  });

  it("rules alone (no brief, no pillar content) compile to just the Style Rules block", () => {
    const result = compileStyleSnapshot(
      snapshot({ rules: [makeRule({ instruction: "textured brushwork" })] })
    );
    expect(result).toBe("Style Rules:\n- textured brushwork");
  });

  it("fixed section order: Direction Brief, World, Visual, Style Rules — regardless of which are populated", () => {
    const result = compileStyleSnapshot(
      snapshot({
        directionBrief: "Brief text",
        world: { generalDirection: "World text", negativeConstraints: null, sections: [] },
        visual: { generalDirection: "Visual text", negativeConstraints: null, sections: [] },
        rules: [makeRule({ instruction: "a rule" })],
      })
    );
    expect(result).toBe(
      [
        "Direction Brief:\nBrief text",
        "World & Design Language:\nWorld text",
        "Visual Treatment:\nVisual text",
        "Style Rules:\n- a rule",
      ].join("\n\n")
    );
  });

  it("empty blocks are omitted entirely — no stray heading, no stray blank line", () => {
    const result = compileStyleSnapshot(
      snapshot({
        directionBrief: "Only the brief.",
        world: { generalDirection: null, negativeConstraints: null, sections: [] },
        visual: { generalDirection: "   ", negativeConstraints: null, sections: [] },
      })
    );
    expect(result).toBe("Direction Brief:\nOnly the brief.");
    expect(result).not.toContain("World");
    expect(result).not.toContain("Visual");
  });

  it("values are trimmed before being tested for emptiness or placed in the output", () => {
    const result = compileStyleSnapshot(snapshot({ directionBrief: "   " }));
    expect(result).toBe("");
  });
});

describe("compileStyleSnapshot — pillar negative constraints render as their own Avoid: block", () => {
  it("a pillar's negativeConstraints render inside its own block, under an Avoid: sub-heading, after the general direction", () => {
    const result = compileStyleSnapshot(
      snapshot({
        world: {
          generalDirection: "Rain-slick neon streets.",
          negativeConstraints: "blue skies, daytime shots",
          sections: [],
        },
      })
    );
    expect(result).toBe(
      "World & Design Language:\nRain-slick neon streets.\n\nAvoid:\nblue skies, daytime shots"
    );
  });

  it("a pillar's negativeConstraints alone (no general direction) still render under Avoid: inside the pillar block", () => {
    const result = compileStyleSnapshot(
      snapshot({
        visual: { generalDirection: null, negativeConstraints: "visible film grain", sections: [] },
      })
    );
    expect(result).toBe("Visual Treatment:\nAvoid:\nvisible film grain");
  });
});

describe("compileStyleSnapshot — atomic rules", () => {
  it("a disabled rule is omitted", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "kept rule" }),
          makeRule({ instruction: "dropped rule", status: "disabled" }),
        ],
      })
    );
    expect(result).toBe("Style Rules:\n- kept rule");
  });

  it("an empty or whitespace-only instruction is omitted", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "kept rule" }),
          makeRule({ instruction: "   " }),
          makeRule({ instruction: "" }),
        ],
      })
    );
    expect(result).toBe("Style Rules:\n- kept rule");
  });

  it("no rules survive filtering: the Style Rules block is omitted, not left empty", () => {
    const result = compileStyleSnapshot(
      snapshot({
        directionBrief: "Only the brief.",
        rules: [makeRule({ instruction: "" }), makeRule({ instruction: "  ", status: "disabled" })],
      })
    );
    expect(result).toBe("Direction Brief:\nOnly the brief.");
  });
});

describe("compileStyleSnapshot — rule polarity (STYLE.COMPILE.POLARITY.1)", () => {
  it("an Avoid rule does not land in Style Rules: it forms its own Avoid: block", () => {
    const result = compileStyleSnapshot(
      snapshot({ rules: [makeRule({ instruction: "blue skies", strength: "Avoid" })] })
    );
    expect(result).toBe("Avoid:\n- blue skies");
    expect(result).not.toContain("Style Rules:");
  });

  it("Required and Preferred rules stay in Style Rules, Required first, each group keeping its relative orderIndex", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "preferred one", strength: "Preferred" }),
          makeRule({ instruction: "required one", strength: "Required" }),
          makeRule({ instruction: "preferred two", strength: "Preferred" }),
          makeRule({ instruction: "required two", strength: "Required" }),
        ],
      })
    );
    expect(result).toBe(
      "Style Rules:\n- required one\n- required two\n- preferred one\n- preferred two"
    );
  });

  it("a rule with no strength (optional field) stays in Style Rules — undeclared polarity is taken for what it says", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "no strength here", strength: null }),
          makeRule({ instruction: "required one", strength: "Required" }),
        ],
      })
    );
    expect(result).toBe("Style Rules:\n- required one\n- no strength here");
  });

  it("Avoid rules render alongside Style Rules when both groups are non-empty, in fixed block order (Style Rules before Avoid)", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "required one", strength: "Required" }),
          makeRule({ instruction: "blue skies", strength: "Avoid" }),
          makeRule({ instruction: "visible film grain", strength: "Avoid" }),
        ],
      })
    );
    expect(result).toBe(
      "Style Rules:\n- required one\n\nAvoid:\n- blue skies\n- visible film grain"
    );
  });

  it("does not write an inline [Required]/[Avoid] label into a rule line — polarity is expressed only by the block", () => {
    const result = compileStyleSnapshot(
      snapshot({
        rules: [
          makeRule({ instruction: "required one", strength: "Required" }),
          makeRule({ instruction: "blue skies", strength: "Avoid" }),
        ],
      })
    );
    expect(result).not.toMatch(/\[Required\]|\[Avoid\]|\[Preferred\]/);
  });

  it("a full style with all three forces: Direction Brief, pillars, Style Rules (Required then Preferred), then Avoid", () => {
    const result = compileStyleSnapshot(
      snapshot({
        directionBrief: "A moody, painterly world.",
        rules: [
          makeRule({ instruction: "Preferred: warm rim light", strength: "Preferred" }),
          makeRule({ instruction: "Required: textured brushwork", strength: "Required" }),
          makeRule({ instruction: "blue skies", strength: "Avoid" }),
          makeRule({ instruction: "visible film grain", strength: "Avoid" }),
        ],
      })
    );
    expect(result).toBe(
      [
        "Direction Brief:\nA moody, painterly world.",
        "Style Rules:\n- Required: textured brushwork\n- Preferred: warm rim light",
        "Avoid:\n- blue skies\n- visible film grain",
      ].join("\n\n")
    );
  });
});
