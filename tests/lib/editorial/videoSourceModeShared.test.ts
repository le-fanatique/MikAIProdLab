import { describe, expect, it } from "vitest";
import {
  parseVideoSourceMode,
  parseVideoSourceModeStrict,
  videoSourceModeLabel,
  isPlausibleUploadsRelativePath,
  checkOwnerConfinement,
  resolveApprovedOnlySources,
  pickLatestGenerationSources,
  DEFAULT_VIDEO_SOURCE_MODE,
  type ResolvedShotSource,
  type ShotVideoCandidateForConfinement,
  type ShotForVideoSourceResolution,
  type ShotVideoRowForResolution,
} from "@/lib/editorial/videoSourceModeShared";

// ---------------------------------------------------------------------------
// IND.EDITORIAL.1. The ticket's own file list claimed videoSourceModeShared.ts
// imports server-only/db, and to skip it. It doesn't — its own header
// explicitly says it has ZERO dependency on @/db so a Client Component can
// import it directly. It is real, pure, and security-adjacent (owner
// confinement of video paths across Shots), so it is covered here. Behavior
// as-is, surprises noted, never corrected.
// ---------------------------------------------------------------------------

describe("parseVideoSourceMode (lenient)", () => {
  it("accepts the two valid modes", () => {
    expect(parseVideoSourceMode("approved-only")).toBe("approved-only");
    expect(parseVideoSourceMode("latest-generation")).toBe("latest-generation");
  });

  it("falls back to the default for undefined, an array, or garbage — never throws", () => {
    expect(parseVideoSourceMode(undefined)).toBe(DEFAULT_VIDEO_SOURCE_MODE);
    expect(parseVideoSourceMode(["approved-only"])).toBe(DEFAULT_VIDEO_SOURCE_MODE);
    expect(parseVideoSourceMode("bogus")).toBe(DEFAULT_VIDEO_SOURCE_MODE);
    expect(parseVideoSourceMode(null)).toBe(DEFAULT_VIDEO_SOURCE_MODE);
  });
});

describe("parseVideoSourceModeStrict", () => {
  it("undefined resolves ok with the default mode", () => {
    expect(parseVideoSourceModeStrict(undefined)).toEqual({ ok: true, mode: DEFAULT_VIDEO_SOURCE_MODE });
  });

  it("a valid mode string resolves ok with that exact mode", () => {
    expect(parseVideoSourceModeStrict("latest-generation")).toEqual({ ok: true, mode: "latest-generation" });
  });

  it("refuses a present-but-invalid value rather than silently downgrading", () => {
    expect(parseVideoSourceModeStrict("bogus")).toEqual({ ok: false });
    expect(parseVideoSourceModeStrict(null)).toEqual({ ok: false });
    expect(parseVideoSourceModeStrict(42)).toEqual({ ok: false });
    expect(parseVideoSourceModeStrict("")).toEqual({ ok: false });
  });
});

describe("videoSourceModeLabel", () => {
  it("labels each mode", () => {
    expect(videoSourceModeLabel("approved-only")).toBe("Approved only");
    expect(videoSourceModeLabel("latest-generation")).toBe("Latest generation");
  });
});

describe("isPlausibleUploadsRelativePath", () => {
  it("accepts a well-formed uploads-relative path", () => {
    expect(isPlausibleUploadsRelativePath("uploads/shot-videos/shot-1/x.mp4")).toBe(true);
  });

  it("rejects a path not starting with uploads/", () => {
    expect(isPlausibleUploadsRelativePath("other/shot-videos/x.mp4")).toBe(false);
  });

  it("rejects traversal, backslashes, and null bytes", () => {
    expect(isPlausibleUploadsRelativePath("uploads/../etc/passwd")).toBe(false);
    expect(isPlausibleUploadsRelativePath("uploads\\shot-videos\\x.mp4")).toBe(false);
    expect(isPlausibleUploadsRelativePath("uploads/x\0.mp4")).toBe(false);
  });

  it("rejects an empty string and a string over 1024 chars", () => {
    expect(isPlausibleUploadsRelativePath("")).toBe(false);
    expect(isPlausibleUploadsRelativePath("uploads/" + "a".repeat(1020))).toBe(false);
  });

  it("accepts a path at exactly the 1024-char boundary", () => {
    const path = "uploads/" + "a".repeat(1024 - "uploads/".length);
    expect(path.length).toBe(1024);
    expect(isPlausibleUploadsRelativePath(path)).toBe(true);
  });
});

describe("checkOwnerConfinement", () => {
  const candidatesById = new Map<number, ShotVideoCandidateForConfinement>([
    [1, { id: 1, shotId: 42, clipPath: "uploads/shot-video-candidates/shot-42/clip.mp4" }],
  ]);

  function baseCandidate(overrides: Partial<ResolvedShotSource> = {}): ResolvedShotSource {
    return { shotId: 42, videoPath: null, provenance: null, durationSeconds: null, ...overrides };
  }

  it("videoPath null is always ok (nothing to confine)", () => {
    expect(checkOwnerConfinement(baseCandidate({ videoPath: null }), candidatesById)).toEqual({ ok: true });
  });

  it("rejects a malformed path before checking ownership", () => {
    const result = checkOwnerConfinement(
      baseCandidate({ videoPath: "not-uploads/x.mp4", provenance: { kind: "approved" } }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Stored video path is malformed." });
  });

  it("approved provenance: accepts a path under this Shot's own shot-videos or shot-video-candidates root", () => {
    expect(
      checkOwnerConfinement(
        baseCandidate({ videoPath: "uploads/shot-videos/shot-42/a.mp4", provenance: { kind: "approved" } }),
        candidatesById
      )
    ).toEqual({ ok: true });
    expect(
      checkOwnerConfinement(
        baseCandidate({ videoPath: "uploads/shot-video-candidates/shot-42/a.mp4", provenance: { kind: "approved" } }),
        candidatesById
      )
    ).toEqual({ ok: true });
  });

  it("approved provenance: rejects a path that belongs to a different Shot's folder", () => {
    const result = checkOwnerConfinement(
      baseCandidate({ videoPath: "uploads/shot-videos/shot-99/a.mp4", provenance: { kind: "approved" } }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Approved video path does not belong to this Shot." });
  });

  it("generation provenance: accepts a path under this Shot's own folder, with sourceCandidateId null", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-videos/shot-42/a.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "generation",
          createdAt: "2026-01-01",
          generationJobId: 1,
          sourceCandidateId: null,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: true });
  });

  it("generation provenance: rejects an inconsistent sourceCandidateId (must be null)", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-videos/shot-42/a.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "generation",
          createdAt: "2026-01-01",
          generationJobId: 1,
          sourceCandidateId: 7,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Generation-sourced video has an inconsistent candidate reference." });
  });

  it("generation provenance: rejects a path outside this Shot's own folder", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-videos/shot-99/a.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "generation",
          createdAt: "2026-01-01",
          generationJobId: 1,
          sourceCandidateId: null,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Generated video path does not belong to this Shot." });
  });

  it("sequence_split provenance: accepts when generationJobId is null and the candidate row matches shot + exact path", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: null,
          sourceCandidateId: 1,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: true });
  });

  it("sequence_split provenance: rejects a non-null generationJobId", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: 3,
          sourceCandidateId: 1,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Split-sourced video has an inconsistent generation reference." });
  });

  it("sequence_split provenance: rejects a null sourceCandidateId", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: null,
          sourceCandidateId: null,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Split-sourced video is missing its candidate reference." });
  });

  it("sequence_split provenance: rejects a sourceCandidateId that resolves to no known row", () => {
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: null,
          sourceCandidateId: 999,
        },
      }),
      candidatesById
    );
    expect(result).toEqual({ ok: false, reason: "Split-sourced video's candidate record could not be found." });
  });

  it("sequence_split provenance: rejects a candidate row that resolves but belongs to a different Shot", () => {
    const otherCandidates = new Map<number, ShotVideoCandidateForConfinement>([
      [1, { id: 1, shotId: 999, clipPath: "uploads/shot-video-candidates/shot-42/clip.mp4" }],
    ]);
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: null,
          sourceCandidateId: 1,
        },
      }),
      otherCandidates
    );
    expect(result).toEqual({ ok: false, reason: "Split-sourced video does not match its own candidate record." });
  });

  it("sequence_split provenance: rejects when the candidate's clipPath differs from the resolved videoPath, even for the correct shot", () => {
    const otherCandidates = new Map<number, ShotVideoCandidateForConfinement>([
      [1, { id: 1, shotId: 42, clipPath: "uploads/shot-video-candidates/shot-42/OTHER.mp4" }],
    ]);
    const result = checkOwnerConfinement(
      baseCandidate({
        videoPath: "uploads/shot-video-candidates/shot-42/clip.mp4",
        provenance: {
          kind: "shot-video",
          shotVideoId: 5,
          source: "sequence_split",
          createdAt: "2026-01-01",
          generationJobId: null,
          sourceCandidateId: 1,
        },
      }),
      otherCandidates
    );
    expect(result).toEqual({ ok: false, reason: "Split-sourced video does not match its own candidate record." });
  });
});

describe("resolveApprovedOnlySources", () => {
  it("maps each Shot's approvedVideoPath verbatim, with 'approved' provenance when set", () => {
    const shots: ShotForVideoSourceResolution[] = [
      { id: 1, approvedVideoPath: "uploads/shot-videos/shot-1/a.mp4" },
      { id: 2, approvedVideoPath: null },
    ];
    const result = resolveApprovedOnlySources(shots);
    expect(result.get(1)).toEqual({
      shotId: 1,
      videoPath: "uploads/shot-videos/shot-1/a.mp4",
      provenance: { kind: "approved" },
      durationSeconds: null,
    });
    expect(result.get(2)).toEqual({ shotId: 2, videoPath: null, provenance: null, durationSeconds: null });
  });

  it("durationSeconds is always null — approved-only never resolves a shot_videos row", () => {
    const result = resolveApprovedOnlySources([{ id: 1, approvedVideoPath: "uploads/x" }]);
    expect(result.get(1)!.durationSeconds).toBeNull();
  });
});

describe("pickLatestGenerationSources", () => {
  function row(overrides: Partial<ShotVideoRowForResolution> = {}): ShotVideoRowForResolution {
    return {
      id: 1,
      shotId: 1,
      source: "generation",
      videoPath: "uploads/shot-videos/shot-1/a.mp4",
      createdAt: "2026-01-01T00:00:00.000Z",
      generationJobId: 1,
      sourceCandidateId: null,
      durationSeconds: 5,
      ...overrides,
    };
  }

  it("every requested shotId is present in the result, even with zero matching rows", () => {
    const result = pickLatestGenerationSources([1, 2], []);
    expect(result.get(1)).toEqual({ shotId: 1, videoPath: null, provenance: null, durationSeconds: null });
    expect(result.get(2)).toEqual({ shotId: 2, videoPath: null, provenance: null, durationSeconds: null });
  });

  it("picks the newest row by createdAt descending", () => {
    const result = pickLatestGenerationSources(
      [1],
      [row({ id: 1, createdAt: "2026-01-01T00:00:00.000Z" }), row({ id: 2, createdAt: "2026-01-02T00:00:00.000Z" })]
    );
    expect(result.get(1)!.provenance).toMatchObject({ shotVideoId: 2 });
  });

  it("ties on createdAt break by id descending", () => {
    const result = pickLatestGenerationSources(
      [1],
      [row({ id: 3, createdAt: "2026-01-01T00:00:00.000Z" }), row({ id: 7, createdAt: "2026-01-01T00:00:00.000Z" })]
    );
    expect(result.get(1)!.provenance).toMatchObject({ shotVideoId: 7 });
  });

  it("ignores a row for a shotId that was not requested", () => {
    const result = pickLatestGenerationSources([1], [row({ id: 1, shotId: 999 })]);
    expect(result.get(1)).toEqual({ shotId: 1, videoPath: null, provenance: null, durationSeconds: null });
    expect(result.has(999)).toBe(false);
  });

  it("never falls back to approvedVideoPath — that field never enters this function", () => {
    const result = pickLatestGenerationSources([1], []);
    expect(result.get(1)!.videoPath).toBeNull();
  });

  it("carries durationSeconds verbatim from the winning row, including null", () => {
    const result = pickLatestGenerationSources([1], [row({ durationSeconds: null })]);
    expect(result.get(1)!.durationSeconds).toBeNull();
  });
});
