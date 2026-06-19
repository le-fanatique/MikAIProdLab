import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { updateSequence } from "@/actions/sequences";

type Props = { params: Promise<{ projectId: string; sequenceId: string }> };

export default async function EditSequencePage({ params }: Props) {
  const { projectId, sequenceId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const updateAction = updateSequence.bind(null, sid, pid);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: "Edit" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Edit Sequence</h1>

      <form action={updateAction} className="max-w-xl flex flex-col gap-5">
        <FormField label="Title" name="title" required defaultValue={sequence.title} />
        <FormField
          label="Summary"
          name="summary"
          type="textarea"
          rows={2}
          defaultValue={sequence.summary}
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={4}
          defaultValue={sequence.description}
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 pt-2">
          Narrative Context
        </p>
        <FormField
          label="Narrative Purpose"
          name="narrative_purpose"
          defaultValue={sequence.narrativePurpose}
          placeholder='e.g. "Opening act", "Reveal", "Climax"'
        />
        <FormField
          label="Mood"
          name="mood"
          defaultValue={sequence.mood}
          placeholder='e.g. "tense", "serene", "chaotic"'
        />
        <FormField
          label="Location Hint"
          name="location_hint"
          defaultValue={sequence.locationHint}
          placeholder='e.g. "Exterior rooftop / night"'
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
