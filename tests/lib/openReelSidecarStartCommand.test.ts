import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENREEL_SIDECAR_DIR,
  openReelSidecarStartCommand,
} from "@/lib/openReelSidecarStartCommand";

// ---------------------------------------------------------------------------
// DEVOPS.LINUX.PORT.1 P0.3 — the OpenReel sidecar start command shown in the
// "Show OpenReel start command" Collapsible was written twice, identically,
// with a Windows-only absolute path hardcoded (`cd F:/AI/mikai-openreel-sidecar`).
// This net pins the single source of truth before the two pages are wired to
// it (mikai-method §1).
// ---------------------------------------------------------------------------

describe("DEFAULT_OPENREEL_SIDECAR_DIR", () => {
  it("matches the sibling directory resolveSidecarDir and .env.local.example agree on", () => {
    // scripts/mikai-deploy.mjs's resolveSidecarDir() falls back to
    // path.resolve(mikaiRoot, "..", "mikai-openreel-sidecar") when
    // MIKAI_OPENREEL_DIR is unset, and .env.local.example documents the same
    // default in its MIKAI_OPENREEL_DIR comment. Never a Windows drive path.
    expect(DEFAULT_OPENREEL_SIDECAR_DIR).toBe("../mikai-openreel-sidecar");
  });
});

describe("openReelSidecarStartCommand", () => {
  it("uses the default sidecar directory when none is given", () => {
    expect(openReelSidecarStartCommand()).toBe(
      "cd ../mikai-openreel-sidecar\nnpx -y pnpm@11.7.0 dev"
    );
  });

  it("uses an explicit sidecar directory when one is given", () => {
    expect(openReelSidecarStartCommand("/srv/mikai-openreel-sidecar")).toBe(
      "cd /srv/mikai-openreel-sidecar\nnpx -y pnpm@11.7.0 dev"
    );
  });

  it("never hardcodes a Windows drive path", () => {
    expect(openReelSidecarStartCommand()).not.toMatch(/^cd [A-Za-z]:[\\/]/m);
  });
});
