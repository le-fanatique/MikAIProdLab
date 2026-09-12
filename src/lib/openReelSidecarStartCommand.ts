// ---------------------------------------------------------------------------
// DEVOPS.LINUX.PORT.1 P0.3 — the "Show OpenReel start command" text shown to
// the author (Collapsible on both the sequence page and the editorial page)
// used to be written twice, identically, and hardcoded a Windows-only
// absolute path: `cd F:/AI/mikai-openreel-sidecar`. That path is wrong on
// Linux and was a copy the moment it existed twice.
//
// The default sidecar directory here is the one this repository's own
// tooling already agrees on: `resolveSidecarDir` (scripts/mikai-deploy.mjs)
// falls back to the sibling directory `../mikai-openreel-sidecar` (relative
// to the MikAI checkout) when `MIKAI_OPENREEL_DIR` is unset, and
// `.env.local.example` documents the same default. A relative sibling path
// makes no assumption about the drive letter or root a Windows or Linux
// checkout happens to sit under.
// ---------------------------------------------------------------------------

/** The sidecar directory `resolveSidecarDir` and `.env.local.example` fall back to when `MIKAI_OPENREEL_DIR` is unset. */
export const DEFAULT_OPENREEL_SIDECAR_DIR = "../mikai-openreel-sidecar";

const PNPM_DEV_COMMAND = "npx -y pnpm@11.7.0 dev";

/**
 * Builds the two-line shell command shown to the author for starting the
 * OpenReel sidecar dev server: `cd <sidecarDir>` then the pinned pnpm dev
 * invocation. Pure — takes the sidecar directory as a parameter instead of
 * reading the environment itself, so both call sites render identically and
 * a future caller that does know the configured `MIKAI_OPENREEL_DIR` can
 * pass it in without this module changing.
 */
export function openReelSidecarStartCommand(
  sidecarDir: string = DEFAULT_OPENREEL_SIDECAR_DIR
): string {
  return `cd ${sidecarDir}\n${PNPM_DEV_COMMAND}`;
}
