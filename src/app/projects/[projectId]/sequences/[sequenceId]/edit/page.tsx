import { db } from "@/db";
import { projects, sequences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { updateSequence, fillSequenceLightingFromEnvironment } from "@/actions/sequences";
import { computeSequenceLightingFill } from "@/lib/llmWorkspace/sequenceLightingFill";

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
  // LLMW.LIGHTING.SURFACE.1 (B15b) — the button is offered only when there is
  // something to copy (§5.9: a bare button that would write empty is worse
  // than no button). Computed once at render time so the page and the
  // button's own action can never disagree.
  const environmentLightingFill = await computeSequenceLightingFill(sid);
  const hasOwnLighting = Boolean(sequence.lighting && sequence.lighting.trim() !== "");

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

      {environmentLightingFill !== null && (
        <form
          action={fillSequenceLightingFromEnvironment}
          className="max-w-xl mb-5 rounded border border-neutral-700 px-4 py-3 flex items-center justify-between gap-4"
        >
          <input type="hidden" name="projectId" value={pid} />
          <input type="hidden" name="sequenceId" value={sid} />
          <input type="hidden" name="returnTo" value={`/projects/${pid}/sequences/${sid}/edit`} />
          <p className="text-xs text-neutral-400">
            Replaces the Lighting field below with the Lighting of this sequence&apos;s
            environment Asset(s), and saves it immediately.
            {hasOwnLighting && (
              <span className="text-[#cf7b6b]"> This replaces what is already written there
                — right away, not just in this form.</span>
            )}
          </p>
          <button
            type="submit"
            className="shrink-0 rounded border border-neutral-700 text-neutral-200 px-4 py-2 text-sm hover:border-neutral-500 transition-colors"
          >
            Fill from environment
          </button>
        </form>
      )}

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
        <FormField
          label="Lighting"
          name="lighting"
          type="textarea"
          rows={2}
          defaultValue={sequence.lighting}
          placeholder='e.g. "At the start the character is in shadow, at the end lit by the screens"'
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
