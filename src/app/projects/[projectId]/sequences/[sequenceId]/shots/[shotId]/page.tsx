import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
        {label}
      </div>
      <p className="text-sm text-[#a4abb2] whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export default async function ShotDetailPage({ params }: Props) {
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

  const hasDetails =
    shot.description || shot.actionPitch || shot.cameraPitch || shot.continuityNotes;
  const hasProduction =
    shot.framing || shot.cameraMovement || shot.continuityIn || shot.continuityOut;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: sequence.title, href: `/projects/${pid}/sequences/${sid}` },
          { label: shot.shotCode ?? shot.title },
        ]}
      />

      <PageHeader
        title={
          shot.shotCode ? `${shot.shotCode} — ${shot.title}` : shot.title
        }
        meta={
          shot.durationSeconds != null ? `${shot.durationSeconds}s` : undefined
        }
        actions={
          <Link
            href={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`}
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Edit Shot
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        {hasDetails && (
          <Card title="Details">
            <div className="flex flex-col gap-4">
              {shot.description && (
                <Field label="Description" value={shot.description} />
              )}
              {shot.actionPitch && (
                <Field label="Action Pitch" value={shot.actionPitch} />
              )}
              {shot.cameraPitch && (
                <Field label="Camera Pitch" value={shot.cameraPitch} />
              )}
              {shot.continuityNotes && (
                <Field label="Continuity Notes" value={shot.continuityNotes} />
              )}
            </div>
          </Card>
        )}

        {hasProduction && (
          <Card title="Production">
            <div className="flex flex-col gap-4">
              {shot.framing && (
                <Field label="Framing" value={shot.framing} />
              )}
              {shot.cameraMovement && (
                <Field label="Camera Movement" value={shot.cameraMovement} />
              )}
              {shot.continuityIn && (
                <Field label="Continuity In" value={shot.continuityIn} />
              )}
              {shot.continuityOut && (
                <Field label="Continuity Out" value={shot.continuityOut} />
              )}
            </div>
          </Card>
        )}

        {!hasDetails && !hasProduction && (
          <p className="text-sm text-[#6e767d]">
            No details recorded yet.{" "}
            <Link
              href={`/projects/${pid}/sequences/${sid}/shots/${shid}/edit`}
              className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
            >
              Edit this shot
            </Link>{" "}
            to add them.
          </p>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#232629]">
        <Link
          href={`/projects/${pid}/sequences/${sid}`}
          className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          ← Back to {sequence.title}
        </Link>
      </div>
    </div>
  );
}
