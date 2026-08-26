import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { captureRedirect, setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot, readShot } from "./helpers/fixtures";

// Outside the Next.js request lifecycle, `revalidatePath` throws ("Invariant:
// static generation store missing") — mocked to a no-op, same precedent as
// tests/actions/registry.test.ts and tests/actions/editorialTimeline.test.ts.
// Does not touch or hide any of the five actions' own written behaviour.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ---------------------------------------------------------------------------
// SHOTPROMPT.DERIVE.1 — `shot_prompt` stops being refabricated from
// description/actionPitch/cameraSubject on every write. One test per write
// path named by the ticket, all proving the same invariant: a Shot whose
// `shot_prompt` would previously have been *derived* now leaves it exactly
// as written (or absent), even though `description`/`actionPitch` are
// present and non-empty on the same write.
// ---------------------------------------------------------------------------

let ctx: TempDb;
let createShot: typeof import("@/actions/shots").createShot;
let updateShot: typeof import("@/actions/shots").updateShot;
let insertShotInSequenceFromEditorialContext: typeof import("@/actions/editorialInsert").insertShotInSequenceFromEditorialContext;
let createGeneratedShots: typeof import("@/actions/llm/sequenceShots").createGeneratedShots;
let createShotAtPosition: typeof import("@/actions/llm/shotInsertion").createShotAtPosition;

let projectId: number;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ createShot, updateShot } = await import("@/actions/shots"));
  ({ insertShotInSequenceFromEditorialContext } = await import("@/actions/editorialInsert"));
  ({ createGeneratedShots } = await import("@/actions/llm/sequenceShots"));
  ({ createShotAtPosition } = await import("@/actions/llm/shotInsertion"));
  projectId = await insertProject(ctx, "Owner project");
});

afterAll(() => ctx.cleanup());

describe("createShot — src/actions/shots.ts:56", () => {
  it("never derives shot_prompt from description/actionPitch even though both are present", async () => {
    const sequenceId = await insertSequence(ctx, projectId);

    await captureRedirect(() =>
      createShot(
        sequenceId,
        projectId,
        form({
          title: "Manual shot",
          description: "Azelle steadies herself against the vibration.",
          action_pitch: "She scans the failing consoles.",
        })
      )
    );

    // Read the shot back directly by sequence — the redirect path carries no id.
    const [row] = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    expect(row.shotPrompt).toBeNull();
  });
});

describe("updateShot — src/actions/shots.ts:126 (the reported defect)", () => {
  it("leaves an empty shot_prompt empty after a save carrying description and actionPitch", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, {
      title: "Shot 999230",
      description: "Azelle steadies herself against the vibration, scans the failing consoles.",
      actionPitch: "Azelle holds her position in the collapsing reactor control room.",
      cameraSubject: "The camera follows Azelle's face from a tense mid-close framing.",
      shotPrompt: null,
    });
    const before = await readShot(ctx, shotId);
    expect(before.shotPrompt).toBeNull();

    await captureRedirect(() =>
      updateShot(
        shotId,
        sequenceId,
        projectId,
        form({
          title: before.title,
          description: before.description ?? "",
          action_pitch: before.actionPitch ?? "",
          camera_subject: before.cameraSubject ?? "",
        })
      )
    );

    const after = await readShot(ctx, shotId);
    expect(after.shotPrompt).toBeNull();
  });
});

describe("insertShotInSequenceFromEditorialContext — src/actions/editorialInsert.ts:115", () => {
  it("creates the inserted shot with no shot_prompt, even though description is set", async () => {
    const sequenceId = await insertSequence(ctx, projectId);

    const result = await insertShotInSequenceFromEditorialContext({
      projectId,
      sequenceId,
      description: "A missing beat the author noticed in editorial.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await readShot(ctx, result.shotId);
    expect(row.shotPrompt).toBeNull();
  });
});

describe("createGeneratedShots — src/actions/llm/sequenceShots.ts:124 (Generate Shots)", () => {
  it("writes shot_prompt as null when the model's JSON carries none, never deriving one from description/action_pitch", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotsJson = JSON.stringify([
      {
        title: "Generated shot",
        description: "Azelle steadies herself against the vibration.",
        action_pitch: "She scans the failing consoles.",
        // no shot_prompt key at all
      },
    ]);

    await captureRedirect(() =>
      createGeneratedShots(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotsJson,
        })
      )
    );

    const [row] = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    expect(row.shotPrompt).toBeNull();
  });
});

describe("createShotAtPosition — src/actions/llm/shotInsertion.ts:178 (Insert Shot dirigé, UC1)", () => {
  it("creates the inserted shot with no shot_prompt on every insertion, since ProposedShot carries no such field", async () => {
    const sequenceId = await insertSequence(ctx, projectId);
    const shotJson = JSON.stringify({
      title: "Directed shot",
      description: "Azelle steadies herself against the vibration.",
      actionPitch: "She scans the failing consoles.",
    });

    await captureRedirect(() =>
      createShotAtPosition(
        form({
          projectId: String(projectId),
          sequenceId: String(sequenceId),
          shotJson,
        })
      )
    );

    const [row] = await ctx.db
      .select()
      .from(ctx.schema.shots)
      .where(eq(ctx.schema.shots.sequenceId, sequenceId));
    expect(row.shotPrompt).toBeNull();
  });
});
