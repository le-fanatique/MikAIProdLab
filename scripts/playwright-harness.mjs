#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Shared Playwright harness for browser verification passes (REPO.PLAYWRIGHT.1).
//
// Every ticket whose verification passes through a real browser used to
// rewrite the same three lines by hand: resolve a Playwright build from the
// npx global cache (four copies of it, on 2026-08-28 one pointed at a
// Chromium revision that was not installed), launch Chromium, and remember
// to close it. This module removes that amortized cost — it does not add a
// new capability, it removes a repeated one.
//
// It deliberately does NOT start or stop the dev server: a server left
// running by a script is worse than the two lines a caller would otherwise
// copy. This module only checks that the server answers, and fails clearly
// if it does not. The ticket that uses this module starts and stops its own
// dev server.
//
// devDependency: playwright-core@1.62.1 (exact pin — see package.json and
// the ticket's own table), not `playwright`: `playwright` carries a
// post-install step that downloads browsers; `playwright-core` has none and
// launches whichever browsers are already present under the
// `ms-playwright` cache. On this machine chromium-1234,
// chromium_headless_shell-1234 and ffmpeg-1011 are already there and match
// what 1.62.1 expects.
// ---------------------------------------------------------------------------

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

// The one place captures are written — already the repository's convention,
// already gitignored (.gitignore:110). Do not invent another location.
export const OUTPUT_DIR = path.join(repoRoot, ".agents", "playwright-output");

const FALLBACK_CAPTURE_NAME = "capture";

// Bounds the whole filename (stem + extension), not just the stem — a very
// long free-form name must not produce an unbounded filename. Same bound as
// src/lib/film/filmResultDownloadFilename.ts, for the same reason.
const MAX_CAPTURE_NAME_LENGTH = 80;

// ---------------------------------------------------------------------------
// Capture path — pure, no I/O. Same risk as
// src/lib/film/filmResultDownloadFilename.ts's buildFilmResultDownloadFilename:
// a free-form name that ends up as part of a filesystem path, so the same
// sanitization approach is applied here on purpose (NFD-normalize accents
// before the ASCII filter, collapse ".." runs, strip path separators and the
// Windows-reserved characters, bound the length, fall back to a non-empty
// stem).
//
// This is a duplication of that logic, not a scoping choice a future ticket
// could resolve by importing one from the other: no `.mjs` script under
// scripts/ imports anything from src/, and this repository has no
// TypeScript loader for them — every script here runs under plain Node,
// while src/ is TypeScript resolved through Next's own toolchain (path
// aliases included). No runtime here can load both without adding a
// loader/bundler this ticket does not authorize. That makes it a hard
// boundary, not a convenience one: if either sanitizer's rule set changes
// (a new reserved character, a new bypass of the ".." collapse, a longer
// bound), the other one does not inherit the fix and must be updated by
// hand — the repeated defect this repository keeps re-discovering
// (`docs/WHERE_THE_RULES_LIVE.md` records more than one rule written twice
// for exactly this kind of reason). Whoever fixes one must check the other.
// ---------------------------------------------------------------------------

/**
 * Sanitizes a free-form capture name into a string safe to use as a
 * filename stem: no path separator, no "..", no Windows-reserved character,
 * never empty, bounded length. Never throws.
 */
export function sanitizeCaptureName(rawName) {
  const sanitized = String(rawName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.{2,}/g, "-")
    .replace(/[/\\]/g, "-")
    .replace(/["<>:|?*]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const bounded = sanitized.slice(0, MAX_CAPTURE_NAME_LENGTH).replace(/-+$/, "");
  return bounded.length > 0 ? bounded : FALLBACK_CAPTURE_NAME;
}

/**
 * Builds an absolute path under OUTPUT_DIR for a capture, from a free-form
 * name and an extension (e.g. ".png"). Pure — does not touch the filesystem.
 */
export function buildCapturePath(rawName, extension = ".png") {
  const stem = sanitizeCaptureName(rawName);
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return path.join(OUTPUT_DIR, `${stem}${safeExtension}`);
}

// ---------------------------------------------------------------------------
// Dev server reachability — the decision is pure given an HTTP outcome;
// `fetchImpl` is injectable so the decision is testable without a real
// server, same injectable-runner shape as scripts/test-repeat.mjs's
// `defaultRun`.
// ---------------------------------------------------------------------------

/**
 * Throws a clear error unless `url` answers with an ok (2xx) HTTP status,
 * including when the connection itself is refused (ECONNREFUSED and
 * similar network failures reject `fetchImpl`, they do not return a
 * response).
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function assertDevServerReachable(url, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(
      `[playwright-harness] dev server not reachable at ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!response.ok) {
    throw new Error(`[playwright-harness] dev server responded with status ${response.status} at ${url}`);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Browser lifecycle — not unit-testable (a real Chromium launch), proven by
// the ticket's §3 instead. Always closes the page and the browser, even if
// `fn` throws.
// ---------------------------------------------------------------------------

/**
 * Launches Chromium, opens one page, runs `fn(page, browser)`, and always
 * closes the page then the browser — including when `fn` throws. Returns
 * whatever `fn` returns; rethrows whatever `fn` throws, after cleanup.
 *
 * @param {(page: import("playwright-core").Page, browser: import("playwright-core").Browser) => Promise<any>} fn
 * @param {{ launchOptions?: object }} [opts]
 */
export async function withBrowserPage(fn, { launchOptions = { headless: true } } = {}) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    try {
      return await fn(page, browser);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

/** Ensures OUTPUT_DIR exists before a capture is written into it. */
export function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Capture — the one gesture that produces the evidence a verification report
// actually cites, so it belongs here rather than being reimplemented per
// ticket with a bare `page.screenshot()` (which, called with no `fullPage`,
// silently captures only the viewport's top — not proof of anything below
// the fold, exactly the gap this function closes).
//
// The `target`-resolution branch (string selector -> page.locator(), a
// Locator passed through as-is, no target -> full page) is pure routing
// logic and is unit-tested with mock page/locator objects below; the actual
// screenshot I/O against a real browser is proven by the ticket's §3, same
// as withBrowserPage.
// ---------------------------------------------------------------------------

/**
 * Writes a screenshot to OUTPUT_DIR and returns the path it wrote, so the
 * caller can cite it without reconstructing it.
 *
 * With no `target`, captures the full page (not just the viewport) — a
 * ticket proving a UI state generally needs to show it, wherever it sits on
 * the page. With `target` (a CSS selector string, or a Playwright Locator
 * already scoped by the caller), scrolls that element into view first and
 * frames the capture on it alone.
 *
 * @param {import("playwright-core").Page} page
 * @param {string} rawName
 * @param {{ target?: string | import("playwright-core").Locator }} [opts]
 * @returns {Promise<string>} the absolute path written
 */
export async function captureScreenshot(page, rawName, { target } = {}) {
  ensureOutputDir();
  const capturePath = buildCapturePath(rawName, ".png");
  const locator = typeof target === "string" ? page.locator(target) : target;

  if (locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.screenshot({ path: capturePath });
  } else {
    await page.screenshot({ path: capturePath, fullPage: true });
  }

  return capturePath;
}

// ---------------------------------------------------------------------------
// CLI — proves the harness works in five seconds: server reachable, browser
// launched, a page opened, a capture written, everything closed.
// ---------------------------------------------------------------------------

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

async function runVerify() {
  const url = process.env.DEV_SERVER_URL || "http://localhost:3000";
  console.log(`[playwright-harness] checking dev server at ${url} ...`);
  await assertDevServerReachable(url);
  console.log("[playwright-harness] dev server reachable.");

  let capturePath;
  await withBrowserPage(async (page) => {
    console.log("[playwright-harness] browser launched, opening a page ...");
    await page.goto(url, { waitUntil: "load" });
    capturePath = await captureScreenshot(page, `harness-verify-${new Date().toISOString()}`);
  });

  console.log(`[playwright-harness] capture written: ${capturePath}`);
  console.log("[playwright-harness] browser closed. OK.");
}

if (isMainModule()) {
  runVerify().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
