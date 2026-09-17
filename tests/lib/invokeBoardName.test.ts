import { describe, expect, it } from "vitest";
import { buildInvokeBoardName } from "@/lib/invoke/invokeBoardName";

describe("buildInvokeBoardName", () => {
  it("builds a shot board name using the shot code", () => {
    expect(
      buildInvokeBoardName({ ownerType: "shot", id: 12, shotCode: "Sh_1120", title: "Arrival at the gate" })
    ).toBe("MikAI · Shot Sh_1120 · Arrival at the gate");
  });

  it("falls back to the numeric id when the shot has no code", () => {
    expect(buildInvokeBoardName({ ownerType: "shot", id: 12, shotCode: null, title: "Untitled" })).toBe(
      "MikAI · Shot #12 · Untitled"
    );
  });

  it("falls back to the numeric id when the shot code is only whitespace", () => {
    expect(buildInvokeBoardName({ ownerType: "shot", id: 12, shotCode: "   ", title: "Untitled" })).toBe(
      "MikAI · Shot #12 · Untitled"
    );
  });

  it("builds an asset board name using the asset id", () => {
    expect(buildInvokeBoardName({ ownerType: "asset", id: 42, name: "Old Warrior" })).toBe(
      "MikAI · Asset 42 · Old Warrior"
    );
  });

  it("gives two shots with the same title different names", () => {
    const a = buildInvokeBoardName({ ownerType: "shot", id: 1, shotCode: "Sh_1100", title: "Reveal" });
    const b = buildInvokeBoardName({ ownerType: "shot", id: 2, shotCode: "Sh_1200", title: "Reveal" });
    expect(a).not.toBe(b);
  });

  it("gives two assets with the same name different names", () => {
    const a = buildInvokeBoardName({ ownerType: "asset", id: 1, name: "Guard" });
    const b = buildInvokeBoardName({ ownerType: "asset", id: 2, name: "Guard" });
    expect(a).not.toBe(b);
  });

  it("truncates a name so long the board name would exceed InvokeAI's 300-char limit", () => {
    const name = "x".repeat(400);
    const result = buildInvokeBoardName({ ownerType: "asset", id: 7, name });
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.startsWith("MikAI · Asset 7 · ")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims surrounding whitespace from the title/name", () => {
    expect(buildInvokeBoardName({ ownerType: "asset", id: 1, name: "  Guard  " })).toBe("MikAI · Asset 1 · Guard");
  });
});
