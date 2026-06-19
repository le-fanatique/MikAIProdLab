import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { createMotionBeat } from "@/actions/motionBeats";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
};

const BEAT_TYPE_OPTIONS = [
  { value: "action", label: "Action" },
  { value: "camera", label: "Camera" },
  { value: "performance", label: "Performance" },
  { value: "transition", label: "Transition" },
  { value: "continuity", label: "Continuity" },
  { value: "other", label: "Other" },
];

const TIMING_POSITION_OPTIONS = [
  { value: "", label: "None" },
  { value: "start", label: "Start" },
  { value: "middle", label: "Middle" },
  { value: "end", label: "End" },
];

export default async function NewMotionBeatPage({ params }: Props) {
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

  const action = createMotionBeat.bind(null, shid, sid, pid);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          {
            label: shot.shotCode ?? shot.title,
            href: `/projects/${pid}/sequences/${sid}/shots/${shid}`,
          },
          { label: "Add Beat" },
        ]}
      />

      <PageHeader title="Add Motion Beat" />

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <FormField
          label="Beat Type"
          name="beatType"
          type="select"
          required
          options={BEAT_TYPE_OPTIONS}
        />
        <FormField
          label="Label"
          name="label"
          required
          placeholder="e.g. Hero draws weapon, Push in on reaction, Cut to black"
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={3}
          placeholder="Optional details about this beat..."
        />
        <FormField
          label="Timing Position"
          name="timingPosition"
          type="select"
          options={TIMING_POSITION_OPTIONS}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Create Beat
          </button>
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}`}
            className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
