import { describe, it, expect, afterAll, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "../actions/helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "../actions/helpers/fixtures";
import { compileStyleSnapshot } from "@/lib/projectStyle/compileStyleSnapshot";
import { EMPTY_STYLE_SNAPSHOT, type StyleSnapshot } from "@/lib/projectStyle/styleSnapshot";

// SHOTPROMPT.SHOT.1 §3 — the Sequence Generation Package panel used to
// render `formatSequenceGenerationPackageText(pkg)` (the legacy, Shot
// Prompt-only body) while the Storyboard generate page already rendered the
// guide composition for the same package: two previews of the same data
// disagreeing about what it contains. This proves the panel now renders the
// guide composition too — `Style:` once, and a body that is more than the
// bare Shot Prompt.

let ctx: TempDb;
let SequenceGenerationPackagePanel: typeof import("@/components/prompts/SequenceGenerationPackagePanel").default;

beforeAll(async () => {
  ctx = await setupTempDb();
  SequenceGenerationPackagePanel = (await import("@/components/prompts/SequenceGenerationPackagePanel")).default;
});

afterAll(() => {
  ctx.cleanup();
});

/** Recursively collects every string leaf under a React element tree — enough to find the rendered "Final text"/CopyTextButton props without a DOM renderer. */
function collectStrings(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
    return;
  }
  if (node && typeof node === "object") {
    const el = node as ReactElement<Record<string, unknown>>;
    if ("props" in el && el.props && typeof el.props === "object") {
      const props = el.props as Record<string, unknown>;
      if (typeof props.text === "string") out.push(props.text);
      if ("children" in props) collectStrings(props.children, out);
    }
  }
}

describe("SequenceGenerationPackagePanel — renders the guide composition (SHOTPROMPT.SHOT.1)", () => {
  it("renders `Style:` exactly once and a body beyond the bare Shot Prompt", async () => {
    const projectId = await insertProject(ctx, "Neon Harvest");
    const sequenceId = await insertSequence(ctx, projectId, {
      title: "The Standoff",
      locationHint: "Rooftop",
      mood: "tense",
      lighting: "Harsh rooftop sun.",
    });
    await insertShot(ctx, sequenceId, {
      title: "Close on Mara",
      shotCode: "010",
      shotPrompt: "Mara stands on the rooftop.",
      actionPitch: "She raises her weapon.",
      shotSize: "medium shot",
      // Supervision fix — the Camera line must read `shotSize` (not the
      // legacy, wrongly-keyed `framing`) and `cameraSubject`'s prose, not
      // only whichever axis (`cameraMovement`) happened to survive.
      cameraSubject: "Arc around Mara, beginning behind her at shoulder height.",
      orderIndex: 0,
    });
    // A second Shot — required to distinguish "Style rendered once for the
    // whole package" from "Style rendered per Shot" (SHOTPROMPT.SHOT.1 §7,
    // mutation 3): a single-Shot fixture cannot tell the two apart.
    await insertShot(ctx, sequenceId, {
      title: "Wide of the vessel",
      shotCode: "020",
      shotPrompt: "The vessel drifts in silence.",
      actionPitch: "It holds position.",
      shotSize: "wide shot",
      orderIndex: 1,
    });

    // Minimal published + active Project Style version — `parseAndVerify`
    // (resolveSequenceStyle.ts) requires `compiledText` to be the exact
    // `compileStyleSnapshot` output for the stored snapshot.
    const snapshot: StyleSnapshot = {
      ...EMPTY_STYLE_SNAPSHOT,
      world: { ...EMPTY_STYLE_SNAPSHOT.world, generalDirection: "Gritty cyberpunk realism." },
    };
    const compiledText = compileStyleSnapshot(snapshot);
    const [version] = await ctx.db
      .insert(ctx.schema.projectStyleVersions)
      .values({
        projectId,
        versionNumber: 1,
        contentSnapshot: JSON.stringify(snapshot),
        compiledText,
        publishedAt: new Date().toISOString(),
      })
      .returning({ id: ctx.schema.projectStyleVersions.id });
    await ctx.db.insert(ctx.schema.projectStyleActivePointers).values({
      projectId,
      activeVersionId: version.id,
    });

    const shotList = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));

    const element = await SequenceGenerationPackagePanel({
      projectId,
      sequenceId,
      project: { name: "Neon Harvest", pitch: null, story: null },
      sequence: {
        title: "The Standoff",
        sequenceCode: null,
        summary: null,
        mood: "tense",
        locationHint: "Rooftop",
        narrativePurpose: null,
      },
      shots: shotList as unknown as Parameters<typeof SequenceGenerationPackagePanel>[0]["shots"],
      searchParams: {},
    });

    const strings: string[] = [];
    collectStrings(element, strings);
    const combined = strings.join("\n---\n");

    // `Style:` appears exactly once, carrying the resolved Project Style text.
    const styleOccurrences = (combined.match(/Style:\nWorld & Design Language:\nGritty cyberpunk realism\./g) ?? [])
      .length;
    expect(styleOccurrences).toBe(1);

    // The body is no longer the Shot Prompt alone — the six-part composition
    // (composeStoryboardShot) is present, e.g. its Action/Environment/Lighting parts.
    expect(combined).toContain("Action: She raises her weapon.");
    expect(combined).toContain("Environment: Rooftop — tense");
    expect(combined).toContain("Lighting: Harsh rooftop sun.");

    // Supervision fix — the Camera line must carry the Shot's own size AND
    // `cameraSubject`'s prose, not just whichever single axis
    // (`cameraMovement`) happened to survive the panel's old `continuity`
    // mapping (`framing: s.shotSize` into a type that expects `shotSize`,
    // `cameraPosition`/`movementSpeed`/`cameraLens` absent from `ShotRow`,
    // `cameraSubject` never forwarded into `continuity` at all).
    expect(combined).toContain(
      "Camera: medium shot — Arc around Mara, beginning behind her at shoulder height."
    );
  });
});
