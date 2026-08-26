import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import CameraVocabularyField from "@/components/CameraVocabularyField";
import { updateShot, fillShotLightingFromSequence } from "@/actions/shots";
import { computeShotLightingFill } from "@/lib/llmWorkspace/shotLightingFill";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
};

export default async function EditShotPage({ params }: Props) {
  const { projectId, sequenceId, shotId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const updateAction = updateShot.bind(null, shid, sid, pid);
  // LLMW.LIGHTING.SHOTFILL.1 — the button is offered only when there is
  // something to copy (§5.9: a bare button that would write empty is worse
  // than no button). Computed once at render time so the page and the
  // button's own action can never disagree.
  const sequenceLightingFill = await computeShotLightingFill(sid);
  const hasOwnLighting = Boolean(shot.lighting && shot.lighting.trim() !== "");

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: shot.title },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Edit Shot</h1>

      {sequenceLightingFill !== null && (
        <form
          action={fillShotLightingFromSequence}
          className="max-w-xl mb-5 rounded border border-neutral-700 px-4 py-3 flex items-center justify-between gap-4"
        >
          <input type="hidden" name="projectId" value={pid} />
          <input type="hidden" name="sequenceId" value={sid} />
          <input type="hidden" name="shotId" value={shid} />
          <input type="hidden" name="returnTo" value={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`} />
          <p className="text-xs text-neutral-400">
            Replaces the Lighting field below with this shot&apos;s sequence&apos;s
            effective Lighting, and saves it immediately.
            {hasOwnLighting && (
              <span className="text-[#cf7b6b]"> This replaces what is already written there
                — right away, not just in this form.</span>
            )}
          </p>
          <button
            type="submit"
            className="shrink-0 rounded border border-neutral-700 text-neutral-200 px-4 py-2 text-sm hover:border-neutral-500 transition-colors"
          >
            Fill from sequence
          </button>
        </form>
      )}

      <form action={updateAction} className="max-w-xl flex flex-col gap-5">
        <FormField
          label="Shot Code"
          name="shot_code"
          defaultValue={shot.shotCode}
          placeholder="e.g. SQ01_SH010"
        />
        <FormField label="Title" name="title" required defaultValue={shot.title} />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={2}
          defaultValue={shot.description}
        />
        <FormField
          label="Duration (seconds)"
          name="duration_seconds"
          type="number"
          step="0.1"
          defaultValue={shot.durationSeconds ?? ""}
        />
        <FormField
          label="Action Pitch"
          name="action_pitch"
          type="textarea"
          rows={3}
          defaultValue={shot.actionPitch}
        />
        <FormField
          label="Continuity Notes"
          name="continuity_notes"
          type="textarea"
          rows={2}
          defaultValue={shot.continuityNotes}
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 pt-2">
          Production Details
        </p>
        <CameraVocabularyField axisId="shotSize" name="framing" defaultValue={shot.shotSize} />
        <CameraVocabularyField
          axisId="cameraPosition"
          name="camera_position"
          defaultValue={shot.cameraPosition}
        />
        <CameraVocabularyField
          axisId="cameraMovement"
          name="camera_movement"
          defaultValue={shot.cameraMovement}
        />
        <CameraVocabularyField
          axisId="movementSpeed"
          name="movement_speed"
          defaultValue={shot.movementSpeed}
        />
        <CameraVocabularyField
          axisId="cameraSubject"
          name="camera_subject"
          defaultValue={shot.cameraSubject}
        />
        <CameraVocabularyField
          axisId="cameraLens"
          name="camera_lens"
          defaultValue={shot.cameraLens}
        />
        <FormField
          label="Continuity In"
          name="continuity_in"
          defaultValue={shot.continuityIn}
          placeholder="Incoming edit cut / match"
        />
        <FormField
          label="Continuity Out"
          name="continuity_out"
          defaultValue={shot.continuityOut}
          placeholder="Outgoing edit cut / match"
        />
        <FormField
          label="Lighting"
          name="lighting"
          type="textarea"
          rows={2}
          defaultValue={shot.lighting}
          placeholder='e.g. "At the start the character is in shadow, at the end lit by the screens"'
        />
        <FormField
          label="Avoid (this shot only)"
          name="negative_constraints"
          type="textarea"
          rows={2}
          defaultValue={shot.negativeConstraints}
          placeholder='e.g. "no other crew member visible, no reflection in the window" — project-wide rules belong in Project Style, not here'
        />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-neutral-100 text-neutral-900 px-5 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Save Changes
          </button>
          <a
            href={`/projects/${pid}/sequences/${sid}`}
            className="rounded border border-neutral-700 text-neutral-400 px-5 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
