import { describe, expect, it, vi } from "vitest";
import type { ProjectStyleData } from "@/lib/llmWorkspace/variables/registry";

// ---------------------------------------------------------------------------
// SHOTPROMPT.RENDER.1 — the exact defect the ticket names: `styleText`/
// `avoidText` used to carry `compileAssetStyleSegments`'s headed
// `rulesPositiveSegment`/`rulesAvoidSegment` ("Style Rules:\n- ...",
// "Avoid:\n- ..."), which duplicated the label the Shot composer already
// adds (`Style: `, `Constraints:`) — shot 999230's real payload showed
// "Style: Style Rules:" and "Constraints: Avoid:". These tests mock
// `resolveProjectStyle` (the one DB-touching dependency) and exercise the
// pure join logic in isolation.
// ---------------------------------------------------------------------------

const mockData: Extract<ProjectStyleData, { mode: "active" }> = {
  mode: "active",
  worldSegment: "",
  visualSegment: "",
  rulesSegment: "Style Rules:\n- textured brushwork\n\nAvoid:\n- no bright colors",
  rulesPositiveSegment: "Style Rules:\n- textured brushwork",
  rulesAvoidSegment: "Avoid:\n- no bright colors",
  rulesPositiveBulletsOnly: "- textured brushwork",
  rulesAvoidBulletsOnly: "- no bright colors",
};

vi.mock("@/lib/llmWorkspace/variables/registry", () => ({
  resolveProjectStyle: vi.fn(async () => mockData),
}));

describe("resolveProjectStyleTextForComposition — no duplicated block heading", () => {
  it("styleText carries no leading 'Style Rules:' heading — the Shot composer's own 'Style: ' label already names the block", async () => {
    const { resolveProjectStyleTextForComposition } = await import(
      "@/lib/projectStyle/resolveProjectStyleTextForComposition"
    );
    const result = await resolveProjectStyleTextForComposition(1);
    expect(result.styleText).toBe("- textured brushwork");
    expect(result.styleText).not.toContain("Style Rules:");
  });

  it("avoidText carries no leading 'Avoid:' heading — the Shot composer folds it under its own 'Constraints:' label", async () => {
    const { resolveProjectStyleTextForComposition } = await import(
      "@/lib/projectStyle/resolveProjectStyleTextForComposition"
    );
    const result = await resolveProjectStyleTextForComposition(1);
    expect(result.avoidText).toBe("- no bright colors");
    expect(result.avoidText).not.toContain("Avoid:");
  });

  it("joinProjectStyleTextForComposition (the Sequence Storyboard package's legacy caller) still reconstructs the byte-identical headed join", async () => {
    const { resolveProjectStyleTextForComposition, joinProjectStyleTextForComposition } = await import(
      "@/lib/projectStyle/resolveProjectStyleTextForComposition"
    );
    const resolved = await resolveProjectStyleTextForComposition(1);
    expect(joinProjectStyleTextForComposition(resolved)).toBe(
      "Style Rules:\n- textured brushwork\n\nAvoid:\n- no bright colors"
    );
  });
});
