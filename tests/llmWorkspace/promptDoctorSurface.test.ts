import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// PROMPT.DOCTOR.1 — the surface filet.
//
// "The surface trap, hit three times this week: an operation delivered
// reachable from nowhere." Static, wiring-level checks (the same style as
// `composeShotGenerationPrompt.test.ts`'s own "SHOTPROMPT.SHOT.1 filet") that
// both places §5's checks are supposed to reach actually import them, merge
// them with `guideDefault`'s own findings, and render the one shared
// "Findings — informational, never blocking" block. Real-browser
// verification is separate (see `.agents/executor_report.md`).
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("PROMPT.DOCTOR.1 — the Sequence Storyboard generate page merges the two sources", () => {
  const source = read(
    "src",
    "app",
    "projects",
    "[projectId]",
    "sequences",
    "[sequenceId]",
    "storyboard",
    "workflows",
    "[workflowId]",
    "generate",
    "page.tsx"
  );

  it("imports checkPromptConsistency, never a second finding renderer", () => {
    expect(source).toContain('import { checkPromptConsistency } from "@/lib/llmWorkspace/composition/promptConsistency"');
  });

  it("merges composeStoryboardShot's own findings with checkPromptConsistency's into one array feeding the one display", () => {
    expect(source).toContain("findings: [...composition.findings, ...consistencyFindings]");
    // The one existing renderer — unchanged, never duplicated.
    expect(source).toContain("Findings — informational, never blocking");
    expect(source.match(/Findings — informational, never blocking/g)?.length).toBe(1);
  });
});

describe("PROMPT.DOCTOR.1 — the Shot generation panel surfaces the findings next to Generate", () => {
  const panelSource = read("src", "components", "ShotGenerationPanel.tsx");
  const generateSectionSource = read("src", "components", "shotGenerationPanel", "GenerateSection.tsx");

  it("ShotGenerationPanel passes composeShotGenerationPrompt's merged findings to GenerateSection", () => {
    expect(panelSource).toContain("findings={composedPrompt.findings}");
  });

  it("GenerateSection renders the findings block inside the Generate section, using the same wording as the storyboard page", () => {
    expect(generateSectionSource).toContain("findings: Array<{ code: string; severity");
    expect(generateSectionSource).toContain("Findings — informational, never blocking");
  });
});
