import { describe, it, expect } from "vitest";
import { compileAssetStyleSegments } from "@/lib/projectStyle/assetAlignment/styleContext";
import { EMPTY_STYLE_SNAPSHOT, type StyleRuleSnapshot, type StyleSnapshot } from "@/lib/projectStyle/styleSnapshot";

// ---------------------------------------------------------------------------
// SHOTPROMPT.STYLE.1 Part B — `rulesPositiveSegment`/`rulesAvoidSegment` must
// split `rulesSegment` at the snapshot's own `strength` field (never by
// parsing `rulesSegment`'s compiled text — see this ticket's own warning
// against `split("Avoid:")`). These tests exercise `compileAssetStyleSegments`
// directly, the one place that split is performed.
// ---------------------------------------------------------------------------

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

describe("compileAssetStyleSegments — rulesPositiveSegment / rulesAvoidSegment split", () => {
  it("rulesSegment still carries both Style Rules and Avoid together, unchanged for existing consumers", () => {
    const segments = compileAssetStyleSegments(
      snapshot({
        rules: [makeRule({ instruction: "textured brushwork", strength: "Required" }), makeRule({ instruction: "no bright colors", strength: "Avoid" })],
      })
    );
    expect(segments.rulesSegment).toBe("Style Rules:\n- textured brushwork\n\nAvoid:\n- no bright colors");
  });

  it("rulesPositiveSegment excludes Avoid-strength rules; rulesAvoidSegment carries only them", () => {
    const segments = compileAssetStyleSegments(
      snapshot({
        rules: [makeRule({ instruction: "textured brushwork", strength: "Required" }), makeRule({ instruction: "no bright colors", strength: "Avoid" })],
      })
    );
    expect(segments.rulesPositiveSegment).toBe("Style Rules:\n- textured brushwork");
    expect(segments.rulesAvoidSegment).toBe("Avoid:\n- no bright colors");
    expect(segments.rulesPositiveSegment).not.toContain("Avoid:");
    expect(segments.rulesAvoidSegment).not.toContain("Style Rules:");
  });

  it("rulesAvoidSegment is '' when no rule has strength Avoid", () => {
    const segments = compileAssetStyleSegments(snapshot({ rules: [makeRule({ instruction: "textured brushwork", strength: "Required" })] }));
    expect(segments.rulesAvoidSegment).toBe("");
    expect(segments.rulesPositiveSegment).toBe("Style Rules:\n- textured brushwork");
  });

  it("rulesPositiveSegment is '' when every rule has strength Avoid", () => {
    const segments = compileAssetStyleSegments(snapshot({ rules: [makeRule({ instruction: "no bright colors", strength: "Avoid" })] }));
    expect(segments.rulesPositiveSegment).toBe("");
    expect(segments.rulesAvoidSegment).toBe("Avoid:\n- no bright colors");
  });

  it("a disabled or inapplicable rule contributes to neither split segment", () => {
    const segments = compileAssetStyleSegments(
      snapshot({
        rules: [
          makeRule({ instruction: "disabled avoid", strength: "Avoid", status: "disabled" }),
          makeRule({ instruction: "video-only avoid", strength: "Avoid", applicability: "consumer:shot-video" }),
        ],
      })
    );
    expect(segments.rulesAvoidSegment).toBe("");
    expect(segments.rulesPositiveSegment).toBe("");
    expect(segments.rulesSegment).toBe("");
  });
});

// ---------------------------------------------------------------------------
// SHOTPROMPT.RENDER.1 — `rulesPositiveBulletsOnly`/`rulesAvoidBulletsOnly`:
// same asset-applicable, strength-split rules as `rulesPositiveSegment`/
// `rulesAvoidSegment`, but with no leading `Style Rules:`/`Avoid:` heading —
// for `resolveProjectStyleTextForComposition`'s `styleText`/`avoidText`,
// which the Shot composer folds under its own `Style: `/`Constraints:`
// label. `rulesPositiveSegment`/`rulesAvoidSegment` themselves are untouched
// (proven above) — they still feed the Sequence Storyboard package's
// byte-identical legacy join.
// ---------------------------------------------------------------------------
describe("compileAssetStyleSegments — rulesPositiveBulletsOnly / rulesAvoidBulletsOnly (heading-less)", () => {
  it("rulesPositiveBulletsOnly carries the Style Rules group's bullets with no heading; rulesAvoidBulletsOnly carries the Avoid group's, also with no heading", () => {
    const segments = compileAssetStyleSegments(
      snapshot({
        rules: [makeRule({ instruction: "textured brushwork", strength: "Required" }), makeRule({ instruction: "no bright colors", strength: "Avoid" })],
      })
    );
    expect(segments.rulesPositiveBulletsOnly).toBe("- textured brushwork");
    expect(segments.rulesAvoidBulletsOnly).toBe("- no bright colors");
    expect(segments.rulesPositiveBulletsOnly).not.toContain("Style Rules:");
    expect(segments.rulesAvoidBulletsOnly).not.toContain("Avoid:");
  });

  it("is '' when the respective group is empty, same as the headed segments", () => {
    const onlyRequired = compileAssetStyleSegments(
      snapshot({ rules: [makeRule({ instruction: "textured brushwork", strength: "Required" })] })
    );
    expect(onlyRequired.rulesAvoidBulletsOnly).toBe("");
    expect(onlyRequired.rulesPositiveBulletsOnly).toBe("- textured brushwork");

    const onlyAvoid = compileAssetStyleSegments(
      snapshot({ rules: [makeRule({ instruction: "no bright colors", strength: "Avoid" })] })
    );
    expect(onlyAvoid.rulesPositiveBulletsOnly).toBe("");
    expect(onlyAvoid.rulesAvoidBulletsOnly).toBe("- no bright colors");
  });
});
