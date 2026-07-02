import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { createShot } from "@/actions/shots";
import { getNomenclatureSettings } from "@/lib/settings";
import { generateNextCode } from "@/lib/nomenclature";

type Props = { params: Promise<{ projectId: string; sequenceId: string }> };

export default async function NewShotPage({ params }: Props) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const createAction = createShot.bind(null, sid, pid);

  // Compute suggested shot code for this sequence
  const { shotTemplate } = await getNomenclatureSettings();
  const existingCodes = await db
    .select({ shotCode: shots.shotCode })
    .from(shots)
    .where(eq(shots.sequenceId, sid));
  const suggestedCode = generateNextCode(shotTemplate, existingCodes.map((r) => r.shotCode));

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: "New Shot" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">New Shot</h1>

      <form action={createAction} autoComplete="off" className="max-w-xl flex flex-col gap-5">
        <FormField
          label="Shot Code"
          name="shot_code"
          defaultValue={suggestedCode}
          placeholder={suggestedCode}
        />
        <FormField label="Title" name="title" required placeholder="Descriptive title for this shot" />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={2}
          placeholder="Short description"
        />
        <FormField
          label="Duration (seconds)"
          name="duration_seconds"
          type="number"
          step="0.1"
          placeholder="e.g. 3.5"
        />
        <FormField
          label="Action Pitch"
          name="action_pitch"
          type="textarea"
          rows={3}
          placeholder="What happens in this shot"
        />
        <FormField
          label="Camera Pitch"
          name="camera_pitch"
          type="textarea"
          rows={3}
          placeholder="Camera angle, movement, lens..."
        />
        <FormField
          label="Continuity Notes"
          name="continuity_notes"
          type="textarea"
          rows={2}
          placeholder="Props, lighting, costume, VFX notes..."
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 pt-2">
          Production Details
        </p>
        <FormField
          label="Framing"
          name="framing"
          placeholder='e.g. "CU", "MS", "WS", "ECU", "OTS"'
        />
        <FormField
          label="Camera Movement"
          name="camera_movement"
          placeholder='e.g. "static", "pan left", "tracking"'
        />
        <FormField
          label="Continuity In"
          name="continuity_in"
          placeholder="Incoming edit cut / match"
        />
        <FormField
          label="Continuity Out"
          name="continuity_out"
          placeholder="Outgoing edit cut / match"
        />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-neutral-100 text-neutral-900 px-5 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Create Shot
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
