import { describe, expect, it } from "vitest";
import { buildFilmResultDownloadFilename } from "@/lib/film/filmResultDownloadFilename";

// ---------------------------------------------------------------------------
// FILM.EXPORT.DOWNLOAD.1. Characterization tests for
// buildFilmResultDownloadFilename — the one place an adversarial project
// name must be neutralized before it lands in a Content-Disposition header.
// ---------------------------------------------------------------------------

describe("buildFilmResultDownloadFilename", () => {
  it("builds a readable name with the id and .mp4 extension for an ordinary project name", () => {
    expect(buildFilmResultDownloadFilename("Orion Belt", 42)).toBe("Orion-Belt-42.mp4");
  });

  it("strips path separators — no / or \\ survives", () => {
    const name = buildFilmResultDownloadFilename("a/b\\c", 1);
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });

  it("neutralizes .. so no traversal sequence survives", () => {
    const name = buildFilmResultDownloadFilename("../../etc/passwd", 1);
    expect(name).not.toContain("..");
  });

  it("neutralizes quotes and newlines so the header can't be broken", () => {
    const name = buildFilmResultDownloadFilename('evil"\nSet-Cookie: x=1', 1);
    expect(name).not.toContain('"');
    expect(name).not.toContain("\n");
    expect(name).not.toContain("\r");
  });

  it("neutralizes the Windows-reserved characters", () => {
    const name = buildFilmResultDownloadFilename('a<b>c:d"e|f?g*h', 1);
    for (const forbidden of ["<", ">", ":", '"', "|", "?", "*"]) {
      expect(name).not.toContain(forbidden);
    }
  });

  it("falls back to a non-empty stem for an empty name", () => {
    const name = buildFilmResultDownloadFilename("", 1);
    expect(name).toBe("film-result-1.mp4");
  });

  it("falls back to a non-empty stem for a name made only of neutralized characters", () => {
    const name = buildFilmResultDownloadFilename('/\\..<>:"|?*', 1);
    expect(name).toBe("film-result-1.mp4");
  });

  it("bounds a very long project name to a fixed maximum filename length", () => {
    const longName = "a".repeat(500);
    const name = buildFilmResultDownloadFilename(longName, 1);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.endsWith("-1.mp4")).toBe(true);
  });

  it("produces distinct names for two Film Results of the same project", () => {
    const first = buildFilmResultDownloadFilename("Orion Belt", 1);
    const second = buildFilmResultDownloadFilename("Orion Belt", 2);
    expect(first).not.toBe(second);
  });

  it("transliterates French accents instead of dropping them", () => {
    expect(buildFilmResultDownloadFilename("Le Château d'Orion", 14)).toBe("Le-Chateau-d'Orion-14.mp4");
    expect(buildFilmResultDownloadFilename("Rêve d'Été — épisode 2", 14)).toBe("Reve-d'Ete-episode-2-14.mp4");
  });
});
