import { describe, expect, it } from "vitest";
// Plain .mjs, no type declarations — see tests/scripts/configTransportLoopback.test.ts
// for the same structural precedent.
import { buildNodeOptions } from "../../scripts/with-system-ca.mjs";

// ---------------------------------------------------------------------------
// DEVOPS.TLS.SYSTEMCA.1. The net for the pure NODE_OPTIONS builder, written
// and proved before it is wired into the spawn/detection code (ticket §6.2,
// §6.3). No value is ever rewritten or guessed: buildNodeOptions takes the
// current NODE_OPTIONS value and a support boolean in, and returns the
// string to set, out — no network request, no process spawned.
// ---------------------------------------------------------------------------

describe("buildNodeOptions", () => {
  it("returns existing unchanged, including undefined, when the flag is unsupported", () => {
    expect(buildNodeOptions(undefined, false)).toBe(undefined);
    expect(buildNodeOptions("", false)).toBe("");
    expect(buildNodeOptions("--inspect", false)).toBe("--inspect");
  });

  it("returns just the flag when supported and existing is empty or absent", () => {
    expect(buildNodeOptions(undefined, true)).toBe("--use-system-ca");
    expect(buildNodeOptions("", true)).toBe("--use-system-ca");
  });

  it("preserves existing content and appends the flag, space-separated, when supported", () => {
    expect(buildNodeOptions("--inspect", true)).toBe("--inspect --use-system-ca");
    expect(buildNodeOptions("--inspect --max-old-space-size=4096", true)).toBe(
      "--inspect --max-old-space-size=4096 --use-system-ca"
    );
  });

  it("does not duplicate the flag when existing already contains it", () => {
    expect(buildNodeOptions("--use-system-ca", true)).toBe("--use-system-ca");
    expect(buildNodeOptions("--inspect --use-system-ca", true)).toBe("--inspect --use-system-ca");
  });
});
