import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFORMATION_PROFILE_ID,
  getConformationProfile,
  type ConformationInspectionRequest,
  type ConformationReference,
} from "@/lib/llmWorkspace/conformation";

// ---------------------------------------------------------------------------
// LLMW.CONFORMATION.2 (B13b) — the output discipline §5.6 calls "missing":
// word budget, one-primary-camera, the two tag caps, and lighting, expressed
// as findings the stage reports and never enforces.
//
// Proven directly on the pure module, same reasoning as
// `conformationReferences.test.ts`: no database, no model, deterministic by
// construction.
// ---------------------------------------------------------------------------

const profile = getConformationProfile(DEFAULT_CONFORMATION_PROFILE_ID);

function refs(count: number): ConformationReference[] {
  return Array.from({ length: count }, (_, i) => ({ role: "character", label: `Image ${i + 1}` }));
}

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
}

/** A request that satisfies every rule: nothing should be reported for it. */
function compliantRequest(): ConformationInspectionRequest {
  return {
    references: refs(3),
    camera: { phrases: ["slow push in"], movements: ["slow push in"] },
    body: words(80),
    lighting: "Golden hour, warm rim light",
    fileTagCount: 3,
  };
}

describe("guide.default — output discipline (inspect)", () => {
  it("reports nothing for a request compliant on every point", () => {
    expect(profile.inspect(compliantRequest())).toEqual([]);
  });

  it("wordBudget: under 60 words", () => {
    const findings = profile.inspect({ ...compliantRequest(), body: words(10) });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("wordBudget");
    expect(findings[0].severity).toBe("warn");
    expect(findings[0].message).toMatch(/under/i);
  });

  it("wordBudget: between 100 and 150 words — over budget, under the hard cap", () => {
    const findings = profile.inspect({ ...compliantRequest(), body: words(120) });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("wordBudget");
    expect(findings[0].message).toMatch(/over/i);
  });

  it("wordBudget: above 150 words — the hard cap", () => {
    const findings = profile.inspect({ ...compliantRequest(), body: words(200) });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("wordBudget");
    expect(findings[0].message).toMatch(/hard cap/i);
  });

  it("wordBudget: the three thresholds produce three distinct messages", () => {
    const under = profile.inspect({ ...compliantRequest(), body: words(10) })[0].message;
    const over = profile.inspect({ ...compliantRequest(), body: words(120) })[0].message;
    const capped = profile.inspect({ ...compliantRequest(), body: words(200) })[0].message;
    expect(new Set([under, over, capped]).size).toBe(3);
  });

  it("wordBudget: exactly one finding, never two, even far past the cap", () => {
    const findings = profile.inspect({ ...compliantRequest(), body: words(500) });
    expect(findings.filter((f) => f.code === "wordBudget")).toHaveLength(1);
  });

  it("wordBudget: within 60-100 words reports nothing", () => {
    expect(profile.inspect({ ...compliantRequest(), body: words(60) })).toEqual([]);
    expect(profile.inspect({ ...compliantRequest(), body: words(100) })).toEqual([]);
  });

  it("primaryCamera: zero camera phrases triggers it", () => {
    const findings = profile.inspect({ ...compliantRequest(), camera: { phrases: [], movements: [] } });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("primaryCamera");
    expect(findings[0].severity).toBe("warn");
  });

  it("primaryCamera: three camera phrases triggers it too", () => {
    const findings = profile.inspect({
      ...compliantRequest(),
      camera: { phrases: ["slow push in", "handheld", "crane down"], movements: ["slow push in", "handheld", "crane down"] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("primaryCamera");
  });

  it("primaryCamera: exactly one non-blank phrase reports nothing", () => {
    expect(profile.inspect({ ...compliantRequest(), camera: { phrases: ["slow push in"], movements: ["slow push in"] } })).toEqual([]);
  });

  it("primaryCamera: a blank camera phrase does not count", () => {
    const withBlankOnly = profile.inspect({ ...compliantRequest(), camera: { phrases: ["   "], movements: ["   "] } });
    expect(withBlankOnly).toHaveLength(1);
    expect(withBlankOnly[0].code).toBe("primaryCamera");

    // one real phrase plus a blank one still counts as exactly one primary instruction
    expect(
      profile.inspect({ ...compliantRequest(), camera: { phrases: ["slow push in", "   "], movements: ["slow push in", "   "] } }),
    ).toEqual([]);
  });

  it("imageTagCap: more than 9 referenced images triggers it", () => {
    const findings = profile.inspect({ ...compliantRequest(), references: refs(10) });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("imageTagCap");
    expect(findings[0].severity).toBe("warn");
  });

  it("imageTagCap: exactly 9 referenced images reports nothing", () => {
    expect(profile.inspect({ ...compliantRequest(), references: refs(9) })).toEqual([]);
  });

  it("fileTagCap: more than 12 files in total triggers it", () => {
    const findings = profile.inspect({ ...compliantRequest(), fileTagCount: 13 });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("fileTagCap");
    expect(findings[0].severity).toBe("warn");
  });

  it("fileTagCap: exactly 12 files reports nothing", () => {
    expect(profile.inspect({ ...compliantRequest(), fileTagCount: 12 })).toEqual([]);
  });

  it("lightingMissing: null lighting triggers an info finding, not a warning", () => {
    const findings = profile.inspect({ ...compliantRequest(), lighting: null });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("lightingMissing");
    expect(findings[0].severity).toBe("info");
  });

  it("lightingMissing: a blank string triggers it the same as null", () => {
    const findings = profile.inspect({ ...compliantRequest(), lighting: "   " });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("lightingMissing");
  });

  it("lightingMissing: a real value reports nothing", () => {
    expect(profile.inspect({ ...compliantRequest(), lighting: "Warm rim light" })).toEqual([]);
  });

  it("reports findings in a fixed, deterministic order", () => {
    const findings = profile.inspect({
      references: refs(10),
      camera: { phrases: [], movements: [] },
      body: words(10),
      lighting: null,
      fileTagCount: 13,
    });

    expect(findings.map((f) => f.code)).toEqual([
      "wordBudget",
      "primaryCamera",
      "imageTagCap",
      "fileTagCap",
      "lightingMissing",
    ]);
  });

  it("never throws and never returns a refusal, whatever the input", () => {
    const inputs: ConformationInspectionRequest[] = [
      { references: [], camera: { phrases: [], movements: [] }, body: "", lighting: null, fileTagCount: 0 },
      { references: [], camera: { phrases: [], movements: [] }, body: "   ", lighting: "", fileTagCount: -5 },
      {
        references: refs(1000),
        camera: { phrases: Array(1000).fill(""), movements: Array(1000).fill("") },
        body: words(10000),
        lighting: null,
        fileTagCount: Number.MAX_SAFE_INTEGER,
      },
      { references: [], camera: { phrases: [], movements: [] }, body: words(80), lighting: "set", fileTagCount: NaN },
    ];

    for (const input of inputs) {
      expect(() => profile.inspect(input)).not.toThrow();
      const result = profile.inspect(input);
      expect(Array.isArray(result)).toBe(true);
      for (const finding of result) {
        expect(["info", "warn"]).toContain(finding.severity);
        expect(typeof finding.message).toBe("string");
      }
    }
  });

  it("is deterministic — the same request twice yields an identical result", () => {
    const request = compliantRequest();
    expect(profile.inspect(request)).toEqual(profile.inspect(request));
  });
});
