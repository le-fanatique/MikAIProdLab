import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { createSequence } from "@/actions/sequences";

type Props = { params: Promise<{ projectId: string }> };

export default async function NewSequencePage({ params }: Props) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const createAction = createSequence.bind(null, id);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${id}` },
          { label: "New Sequence" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">New Sequence</h1>

      <form action={createAction} className="max-w-xl flex flex-col gap-5">
        <FormField label="Title" name="title" required placeholder="Sequence title" />
        <FormField
          label="Summary"
          name="summary"
          type="textarea"
          rows={2}
          placeholder="Short summary"
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={4}
          placeholder="Detailed description, notes..."
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 pt-2">
          Narrative Context
        </p>
        <FormField
          label="Narrative Purpose"
          name="narrative_purpose"
          placeholder='e.g. "Opening act", "Reveal", "Climax"'
        />
        <FormField
          label="Mood"
          name="mood"
          placeholder='e.g. "tense", "serene", "chaotic"'
        />
        <FormField
          label="Location Hint"
          name="location_hint"
          placeholder='e.g. "Exterior rooftop / night"'
        />

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-neutral-100 text-neutral-900 px-5 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Create Sequence
          </button>
          <a
            href={`/projects/${id}`}
            className="rounded border border-neutral-700 text-neutral-400 px-5 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
