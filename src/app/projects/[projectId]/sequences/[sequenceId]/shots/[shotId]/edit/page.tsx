import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { updateShot } from "@/actions/shots";

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

      <form action={updateAction} className="max-w-xl flex flex-col gap-5">
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
          label="Camera Pitch"
          name="camera_pitch"
          type="textarea"
          rows={3}
          defaultValue={shot.cameraPitch}
        />
        <FormField
          label="Continuity Notes"
          name="continuity_notes"
          type="textarea"
          rows={2}
          defaultValue={shot.continuityNotes}
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
