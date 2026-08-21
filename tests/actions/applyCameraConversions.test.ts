import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTempDb, type TempDb } from "./helpers/tempDb";
import { insertProject, insertSequence, insertShot } from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// applyCameraConversions — B19f's write side.
//
// What these tests protect is the operation's whole premise: an axis the legacy
// camera text says nothing about must stay empty rather than be guessed. If the
// write side filled blanks, the instruction telling the model to leave them
// empty would be worthless.
//
// And `camera_pitch` must survive untouched. It is the source being converted,
// and 88 shots hold their only camera angle in it.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string };
    error.digest = `NEXT_REDIRECT;${url}`;
    throw error;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let ctx: TempDb;
let applyCameraConversions: typeof import("@/actions/llm/cameraConversion").applyCameraConversions;

beforeAll(async () => {
  ctx = await setupTempDb();
  ({ applyCameraConversions } = await import("@/actions/llm/cameraConversion"));
});

afterAll(() => ctx.cleanup());

/** Runs the action and swallows the redirect it always ends on. */
async function apply(form: FormData): Promise<void> {
  try {
    await applyCameraConversions(form);
  } catch (e) {
    const digest = (e as { digest?: string })?.digest ?? "";
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return;
    throw e;
  }
}

function formFor(projectId: number, sequenceId: number, selected: unknown): FormData {
  const form = new FormData();
  form.set("projectId", String(projectId));
  form.set("sequenceId", String(sequenceId));
  form.set("selectedJson", JSON.stringify(selected));
  return form;
}

async function readShot(shotId: number) {
  const { schema, db } = ctx;
  const [row] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  return row;
}

describe("applyCameraConversions", () => {
  it("writes only the axes the proposal fills, and leaves the others exactly as they were", async () => {
    const projectId = await insertProject(ctx, "Conversion project");
    const sequenceId = await insertSequence(ctx, projectId);
    const shotId = await insertShot(ctx, sequenceId, {
      title: "A shot",
      shotSize: "MS",
      cameraMovement: "tracking",
      cameraPitch: "Low angle, following her gloved hand",
    });

    await apply(
      formFor(projectId, sequenceId, [
        {
          shotId,
          // The legacy text names a position and a subject, and says nothing
          // about speed. So speed is not proposed — and must not be invented.
          cameraPosition: "Low Angle",
          cameraSubject: "follows her gloved hand",
          movementSpeed: null,
          shotSize: "",
        },
      ])
    );

    const row = await readShot(shotId);
    expect(row.cameraPosition).toBe("Low Angle");
    expect(row.cameraSubject).toBe("follows her gloved hand");
    // Not proposed: untouched, not blanked.
    expect(row.movementSpeed).toBeNull();
    // Proposed as an empty string: treated as "not proposed", so the existing
    // value survives rather than being wiped.
    expect(row.shotSize).toBe("MS");
    expect(row.cameraMovement).toBe("tracking");
  });

  it("never touches camera_pitch — it is the source being converted", async () => {
    const projectId = await insertProject(ctx, "Pitch project");
    const sequenceId = await insertSequence(ctx, projectId);
    const legacy = "Over-the-Shoulder (OTS): Max at Alex's desk - 3/4 angle";
    const shotId = await insertShot(ctx, sequenceId, { title: "A shot", cameraPitch: legacy });

    await apply(
      formFor(projectId, sequenceId, [
        { shotId, cameraPosition: "Over-the-Shoulder (OTS)", shotSize: "MS" },
      ])
    );

    const row = await readShot(shotId);
    expect(row.cameraPosition).toBe("Over-the-Shoulder (OTS)");
    expect(row.cameraPitch).toBe(legacy);
  });

  it("drops a proposal naming a shot outside the sequence, rather than writing it", async () => {
    const projectId = await insertProject(ctx, "Owner project");
    const sequenceId = await insertSequence(ctx, projectId);
    const otherSequenceId = await insertSequence(ctx, projectId);
    const foreignShotId = await insertShot(ctx, otherSequenceId, {
      title: "Foreign shot",
      cameraPosition: "Eye Level",
    });

    await apply(
      formFor(projectId, sequenceId, [{ shotId: foreignShotId, cameraPosition: "Worm's-Eye" }])
    );

    const row = await readShot(foreignShotId);
    expect(row.cameraPosition).toBe("Eye Level");
  });

  it("leaves a shot alone when it is not in the selection", async () => {
    const projectId = await insertProject(ctx, "Selection project");
    const sequenceId = await insertSequence(ctx, projectId);
    const selected = await insertShot(ctx, sequenceId, { title: "Selected" });
    const untouched = await insertShot(ctx, sequenceId, {
      title: "Untouched",
      cameraPitch: "High angle",
    });

    await apply(formFor(projectId, sequenceId, [{ shotId: selected, cameraPosition: "High Angle" }]));

    expect((await readShot(selected)).cameraPosition).toBe("High Angle");
    const other = await readShot(untouched);
    expect(other.cameraPosition).toBeNull();
    expect(other.cameraPitch).toBe("High angle");
  });
});
