import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { createAssetReferenceImage } from "@/actions/assetReferenceImages";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_file: "Image file is required.",
  invalid_file: "Invalid image file.",
  file_too_large: "Image file is too large. Maximum size is 10 MB.",
  invalid_file_type: "Unsupported image type. Use JPG, PNG, WebP, or GIF.",
  upload_failed: "Image upload failed.",
  not_found: "Asset not found.",
};

// ASSET.BIBLE.2 — MVP roles for Seedance; legacy values kept selectable
// (grouped separately below) so existing images always display their real
// stored role instead of silently falling back to blank.
const ROLE_OPTIONS = [
  { value: "identity", label: "Identity" },
  { value: "full_body", label: "Full Body" },
  { value: "expression", label: "Expression" },
  { value: "pose", label: "Pose" },
  { value: "costume", label: "Costume" },
  { value: "environment_view", label: "Environment View" },
  { value: "lighting", label: "Lighting" },
  { value: "prop_state", label: "Prop State" },
  { value: "style", label: "Style" },
  { value: "other", label: "Other" },
];
const LEGACY_ROLE_OPTIONS = [
  { value: "reference", label: "Reference (legacy)" },
  { value: "keyframe", label: "Keyframe (legacy)" },
  { value: "character", label: "Character (legacy)" },
  { value: "environment", label: "Environment (legacy)" },
];

const inputClass =
  "w-full rounded bg-[#1a1d20] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#4b5158] focus:outline-none focus:border-[#3a4046] transition-colors";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[#6e767d]";

export default async function NewAssetReferenceImagePage({ params, searchParams }: Props) {
  const { projectId, assetId } = await params;
  const { error } = await searchParams;
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const action = createAssetReferenceImage.bind(null, aid, pid);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name, href: `/projects/${pid}/assets/${aid}` },
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
            placeholder="e.g. Hero front view, key lighting"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Role</label>
          <select name="imageRole" defaultValue="" className={inputClass}>
            <option value="">None</option>
            <optgroup label="Roles">
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Legacy">
              {LEGACY_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Variant / State</label>
          <input
            type="text"
            name="variantState"
            placeholder="e.g. Injured, Night version, Damaged"
            className={inputClass}
          />
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

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Usage Notes</label>
          <textarea
            name="usageNotes"
            rows={3}
            placeholder="How/when this image should be used for generation..."
            className={inputClass + " resize-y"}
          />
        </div>

        <p className="text-xs text-[#4b5158]">
          New images start as <span className="text-[#cda24f]">Not approved</span>. Approve them
          from Asset Detail once you&apos;ve reviewed the upload.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Add Reference Image
          </button>
          <Link
            href={`/projects/${pid}/assets/${aid}`}
            className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
