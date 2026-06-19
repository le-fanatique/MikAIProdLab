import { db } from "@/db";
import { projects, sequences, shots, motionBeats } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { updateMotionBeat } from "@/actions/motionBeats";

type Props = {
  params: Promise<{
    projectId: string;
    sequenceId: string;
    shotId: string;
    beatId: string;
  }>;
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

export default async function EditMotionBeatPage({ params }: Props) {
  const { projectId, sequenceId, shotId, beatId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);
  const bid = parseInt(beatId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const [beat] = await db.select().from(motionBeats).where(eq(motionBeats.id, bid));
  if (!beat || beat.shotId !== shid) notFound();

  const action = updateMotionBeat.bind(null, bid, shid, sid, pid);

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
          { label: "Edit Beat" },
        ]}
      />

      <PageHeader title="Edit Motion Beat" />

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <FormField
          label="Beat Type"
          name="beatType"
          type="select"
          required
          defaultValue={beat.beatType}
          options={BEAT_TYPE_OPTIONS}
        />
        <FormField
          label="Label"
          name="label"
          required
          defaultValue={beat.label}
          placeholder="e.g. Hero draws weapon, Push in on reaction, Cut to black"
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={3}
          defaultValue={beat.description}
          placeholder="Optional details about this beat..."
        />
        <FormField
          label="Timing Position"
          name="timingPosition"
          type="select"
          defaultValue={beat.timingPosition ?? ""}
          options={TIMING_POSITION_OPTIONS}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Save Changes
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
