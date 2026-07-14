import { db } from "@/db";
import { projects, sequences, shots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { createShotReferenceImage } from "@/actions/shotReferenceImages";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; shotId: string }>;
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_file: "Image file is required.",
  invalid_file: "Invalid image file.",
  file_too_large: "Image file is too large. Maximum size is 10 MB.",
  invalid_file_type: "Unsupported image type. Use JPG, PNG, WebP, or GIF.",
  upload_failed: "Image upload failed.",
  not_found: "Shot not found.",
};

const ROLE_OPTIONS = [
  { value: "", label: "None" },
  { value: "reference", label: "Reference" },
  { value: "keyframe", label: "Keyframe" },
  { value: "first_frame", label: "First Frame" },
  { value: "last_frame", label: "Last Frame" },
  { value: "style", label: "Style" },
  { value: "lighting", label: "Lighting" },
  { value: "character", label: "Character" },
  { value: "environment", label: "Environment" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full rounded bg-[#1a1d20] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046] transition-colors";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[#6e767d]";

export default async function NewShotReferenceImagePage({ params, searchParams }: Props) {
  const { projectId, sequenceId, shotId } = await params;
  const { error } = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const shid = parseInt(shotId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sid));
  if (!sequence || sequence.projectId !== pid) notFound();

  const [shot] = await db.select().from(shots).where(eq(shots.id, shid));
  if (!shot || shot.sequenceId !== sid) notFound();

  const action = createShotReferenceImage.bind(null, shid, sid, pid);

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
          { label: "Add Reference Image" },
        ]}
      />

      <PageHeader title="Add Reference Image" />

      {error && (
        <div className="mb-5 rounded border border-[#cf7b6b]/30 bg-[#cf7b6b]/5 px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </p>
        </div>
      )}

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>
            Image File <span className="text-[#cf7b6b] ml-1">*</span>
          </label>
          <input
            type="file"
            name="imageFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            required
            className="block w-full text-sm text-[#a4abb2] file:mr-3 file:rounded file:border file:border-[#3a4046] file:bg-[#1a1d20] file:px-3 file:py-1.5 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Label</label>
          <input
            type="text"
            name="label"
            placeholder="e.g. Opening frame, mood reference"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Role</label>
          <select name="imageRole" defaultValue="" className={inputClass}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Notes</label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Usage notes, context, source..."
            className={inputClass + " resize-y"}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Add Reference Image
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
