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

  // INVOKE.PUSH.2 — docs/INVOKE_ROUNDTRIP_SPEC.md §7 decision 6: a shot's
  // storyboard draft board and a sequence's storyboard draft board are
  // their own owner types, distinct from "shot"/"asset" above.
  it("builds a shot storyboard board name using the shot code, distinct from the shot's own board", () => {
    const storyboard = buildInvokeBoardName({
      ownerType: "shot_storyboard",
      id: 12,
      shotCode: "Sh_1120",
      title: "Arrival at the gate",
    });
    expect(storyboard).toBe("MikAI · Shot Sh_1120 storyboard · Arrival at the gate");
    expect(storyboard).not.toBe(
      buildInvokeBoardName({ ownerType: "shot", id: 12, shotCode: "Sh_1120", title: "Arrival at the gate" })
    );
  });

  it("falls back to the numeric id for a shot storyboard board when the shot has no code", () => {
    expect(
      buildInvokeBoardName({ ownerType: "shot_storyboard", id: 12, shotCode: null, title: "Untitled" })
    ).toBe("MikAI · Shot #12 storyboard · Untitled");
  });

  it("builds a sequence storyboard board name using the sequence code", () => {
    expect(
      buildInvokeBoardName({
        ownerType: "sequence_storyboard",
        id: 3,
        sequenceCode: "Seq_003",
        title: "Chase",
      })
    ).toBe("MikAI · Sequence Seq_003 storyboard · Chase");
  });

  it("falls back to the numeric id for a sequence storyboard board when the sequence has no code", () => {
    expect(
      buildInvokeBoardName({ ownerType: "sequence_storyboard", id: 3, sequenceCode: null, title: "Chase" })
    ).toBe("MikAI · Sequence #3 storyboard · Chase");
  });

  // INVOKE.STYLE.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §8 lot 3: the project
  // itself is the owner, so the board name carries the project's name only
  // (no id in the string, unlike every other owner type above).
  it("builds a project style board name using the project name, with no id in the string", () => {
    expect(buildInvokeBoardName({ ownerType: "project_style", id: 999201, projectName: "Space Corsair Demo" })).toBe(
      "MikAI · Project style · Space Corsair Demo"
    );
  });

  it("trims surrounding whitespace from the project name", () => {
    expect(buildInvokeBoardName({ ownerType: "project_style", id: 1, projectName: "  Space Corsair Demo  " })).toBe(
      "MikAI · Project style · Space Corsair Demo"
    );
  });

  it("truncates a project name so long the board name would exceed InvokeAI's 300-char limit", () => {
    const projectName = "x".repeat(400);
    const result = buildInvokeBoardName({ ownerType: "project_style", id: 1, projectName });
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.startsWith("MikAI · Project style · ")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
  });
});
