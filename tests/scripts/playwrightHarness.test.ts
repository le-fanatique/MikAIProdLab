import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  OUTPUT_DIR,
  sanitizeCaptureName,
  buildCapturePath,
  assertDevServerReachable,
  captureScreenshot,
} from "../../scripts/playwright-harness.mjs";

// ---------------------------------------------------------------------------
// REPO.PLAYWRIGHT.1. Characterization tests for the two pieces of pure logic
// the shared Playwright harness is built on: the capture path (same risk as
// buildFilmResultDownloadFilename — a free-form name landing in a filesystem
// path) and the dev-server-reachable decision (an HTTP outcome, connection
// refusal included). The browser launch itself is proven by the ticket's §3,
// not here.
// ---------------------------------------------------------------------------

describe("sanitizeCaptureName / buildCapturePath", () => {
  it("keeps an ordinary name readable", () => {
    expect(sanitizeCaptureName("constat-1-space-corsair")).toBe("constat-1-space-corsair");
  });

  it("strips path separators — no / or \\ survives", () => {
    const name = sanitizeCaptureName("a/b\\c");
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });

  it("neutralizes .. so no traversal sequence survives", () => {
    const name = sanitizeCaptureName("../../etc/passwd");
    expect(name).not.toContain("..");
  });

  it("neutralizes the Windows-reserved characters", () => {
    const name = sanitizeCaptureName('a<b>c:d"e|f?g*h');
    for (const forbidden of ["<", ">", ":", '"', "|", "?", "*"]) {
      expect(name).not.toContain(forbidden);
    }
  });

  it("falls back to a non-empty stem for an empty name", () => {
    expect(sanitizeCaptureName("")).toBe("capture");
  });

  it("falls back to a non-empty stem for a name made only of neutralized characters", () => {
    expect(sanitizeCaptureName('/\\..<>:"|?*')).toBe("capture");
  });

  it("bounds a very long name to a fixed maximum length", () => {
    const longName = "a".repeat(500);
    expect(sanitizeCaptureName(longName).length).toBeLessThanOrEqual(80);
  });

  it("transliterates French accents instead of dropping them", () => {
    expect(sanitizeCaptureName("Rêve d'Été")).toBe("Reve-d'Ete");
  });

  it("builds an absolute path under OUTPUT_DIR with the given extension", () => {
    const result = buildCapturePath("look-dev-opened", ".png");
    expect(result).toBe(path.join(OUTPUT_DIR, "look-dev-opened.png"));
  });

  it("normalizes an extension given without its leading dot", () => {
    const result = buildCapturePath("state", "yml");
    expect(result.endsWith(".yml")).toBe(true);
    expect(result).toBe(path.join(OUTPUT_DIR, "state.yml"));
  });
});

describe("assertDevServerReachable", () => {
  it("resolves without throwing when the server answers ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(assertDevServerReachable("http://localhost:3000", { fetchImpl })).resolves.toBeDefined();
  });

  it("throws a clear error when the connection is refused", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(assertDevServerReachable("http://localhost:3000", { fetchImpl })).rejects.toThrow(
      /not reachable.*ECONNREFUSED/
    );
  });

  it("throws a clear error when the server answers with a non-ok status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(assertDevServerReachable("http://localhost:3000", { fetchImpl })).rejects.toThrow(
      /status 500/
    );
  });
});

describe("captureScreenshot", () => {
  // Mock page/locator objects: the routing logic (no target -> full page;
  // string target -> page.locator() then framed on it; a Locator passed
  // through as-is -> framed on it directly, page.locator() never called) is
  // pure given these two collaborators, so it is testable without a real
  // browser. The actual screenshot I/O against a real page is proven by the
  // ticket's §3.
  // Real Page/Locator objects have ~100+ methods this harness never calls;
  // the mocks below are deliberately narrow (duck-typed), so they are cast
  // through `unknown` at each call site rather than widened to satisfy
  // playwright-core's full public types.
  type MockLocator = ReturnType<typeof makeMockLocator>;
  type MockPage = ReturnType<typeof makeMockPage>;

  function makeMockLocator() {
    return {
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(undefined),
    };
  }

  function makeMockPage(locator: MockLocator) {
    return {
      locator: vi.fn().mockReturnValue(locator),
      screenshot: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("with no target, captures the full page and returns the path written", async () => {
    const locator = makeMockLocator();
    const page = makeMockPage(locator);

    const result = await captureScreenshot(page as unknown as never, "look-dev-opened");

    expect(result).toBe(path.join(OUTPUT_DIR, "look-dev-opened.png"));
    expect(page.screenshot).toHaveBeenCalledWith({ path: result, fullPage: true });
    expect(page.locator).not.toHaveBeenCalled();
    expect(locator.screenshot).not.toHaveBeenCalled();
  });

  it("with a string target, resolves it via page.locator, scrolls it into view, and frames on it", async () => {
    const locator = makeMockLocator();
    const page = makeMockPage(locator);

    const result = await captureScreenshot(page as unknown as never, "constat-1", {
      target: "#film-result-selection-form",
    });

    expect(page.locator).toHaveBeenCalledWith("#film-result-selection-form");
    expect(locator.scrollIntoViewIfNeeded).toHaveBeenCalled();
    expect(locator.screenshot).toHaveBeenCalledWith({ path: result });
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("with a Locator target, frames on it directly without calling page.locator", async () => {
    const locator = makeMockLocator();
    const page: MockPage = makeMockPage(locator);
    const alreadyScopedLocator = makeMockLocator();

    await captureScreenshot(page as unknown as never, "constat-1", {
      target: alreadyScopedLocator as unknown as never,
    });

    expect(page.locator).not.toHaveBeenCalled();
    expect(alreadyScopedLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
    expect(alreadyScopedLocator.screenshot).toHaveBeenCalled();
    expect(locator.screenshot).not.toHaveBeenCalled();
    expect(page.screenshot).not.toHaveBeenCalled();
  });
});
