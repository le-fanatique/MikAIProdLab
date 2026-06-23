import { db } from "@/db";
import { projects, sequences, shots, promptSegments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { updatePromptSegment } from "@/actions/promptSegments";

type Props = {
  params: Promise<{
    projectId: string;
    sequenceId: string;
    shotId: string;
    segmentId: string;
  }>;
};


export default async function EditPromptSegmentPage({ params }: Props) {
  const { projectId, sequenceId, shotId, segmentId } = await params;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);
  const segId = parseInt(segmentId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const [segment] = await db
    .select()
    .from(promptSegments)
    .where(eq(promptSegments.id, segId));
  if (!segment || segment.shotId !== shid) notFound();

  const action = updatePromptSegment.bind(null, segId, shid, sid, pid);

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
          { label: "Edit Segment" },
        ]}
      />

      <PageHeader title="Edit Prompt Segment" />

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <FormField
          label="Prompt Text"
          name="promptText"
          type="textarea"
          rows={5}
          required
          defaultValue={segment.promptText}
          placeholder="Describe what the model should generate for this segment..."
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Start Time (seconds)
          </label>
          <input
            type="number"
            name="startSeconds"
            step="0.1"
            min="0"
            defaultValue={segment.startSeconds ?? ""}
            placeholder="e.g. 0 or 2.5"
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Duration (seconds)
          </label>
          <input
            type="number"
            name="durationSeconds"
            step="0.1"
            min="0"
            defaultValue={segment.durationSeconds ?? ""}
            placeholder="e.g. 3 or 1.5"
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors"
          />
        </div>
        <FormField
          label="Notes"
          name="notes"
          type="textarea"
          rows={3}
          defaultValue={segment.notes}
          placeholder="Internal notes, not exported..."
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
