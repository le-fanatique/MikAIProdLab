import { db } from "@/db";
import { projects, assets, assetReferenceImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import { updateAssetReferenceImage } from "@/actions/assetReferenceImages";
import { pushAssetReferenceImageToInvoke } from "@/actions/invoke";
import { refImageUrl } from "@/lib/refImageUrl";
import { getReferenceImageRoleGroups } from "@/lib/referenceImageRoles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; assetId: string; imageId: string }>;
  searchParams: Promise<{ error?: string; invokeError?: string; invokePushed?: string; invokeBoardName?: string; invokeUrl?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_file: "Invalid image file.",
  file_too_large: "Image file is too large. Maximum size is 10 MB.",
  invalid_file_type: "Unsupported image type. Use JPG, PNG, WebP, or GIF.",
  upload_failed: "Image upload failed.",
  not_found: "Reference image not found.",
};

// REFROLE.MVP.1 — role options come from the shared catalogue
// (src/lib/referenceImageRoles.ts), grouped by category. Legacy values
// (reference, keyframe, character, environment) remain selectable in the
// "Legacy / Other" group so existing images always display their real
// stored role instead of silently falling back to blank.
const ROLE_GROUPS = getReferenceImageRoleGroups("asset");

const inputClass =
  "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[#6e767d]";

export default async function EditAssetReferenceImagePage({ params, searchParams }: Props) {
  const { projectId, assetId, imageId } = await params;
  const { error, invokeError, invokePushed, invokeBoardName, invokeUrl } = await searchParams;
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);
  const iid = parseInt(imageId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const [image] = await db
    .select()
    .from(assetReferenceImages)
    .where(eq(assetReferenceImages.id, iid));
  if (!image || image.assetId !== aid) notFound();

  const action = updateAssetReferenceImage.bind(null, iid, aid, pid);
  const pushToInvokeAction = pushAssetReferenceImageToInvoke;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name, href: `/projects/${pid}/assets/${aid}` },
          { label: "Edit Reference Image" },
        ]}
      />

      <PageHeader title="Edit Reference Image" />

      {error && (
        <div className="mb-5 rounded border border-[#cf7b6b]/30 bg-[#cf7b6b]/5 px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </p>
        </div>
      )}

      {invokeError && (
        <div className="mb-5 rounded border border-[#cf7b6b]/30 bg-[#cf7b6b]/5 px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">{invokeError}</p>
        </div>
      )}

      {invokePushed === "1" && invokeBoardName && invokeUrl && (
        <div className="mb-5 rounded border border-[#6b9e72]/30 bg-[#6b9e72]/5 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-[#6b9e72]">
            Sent to Invoke board &quot;{invokeBoardName}&quot;. Right-click it → New Canvas from Image. When done,
            right-click the layer → Run Workflow → Send to MikAI.
          </p>
          <a
            href={invokeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors w-fit"
          >
            Open Invoke ↗
          </a>
        </div>
      )}

      <div className="mb-5 max-w-lg">
        <p className={`${labelClass} mb-2`}>Current Image</p>
        <img
          src={refImageUrl(image.imagePath)}
          alt={image.label ?? image.sourceFilename ?? "Reference image"}
          className="rounded border border-[#2c3035] max-h-48 object-contain bg-[#141618]"
        />
        <form action={pushToInvokeAction} className="mt-3">
          <input type="hidden" name="projectId" value={pid} />
          <input type="hidden" name="assetId" value={aid} />
          <input type="hidden" name="imageId" value={iid} />
          <input
            type="hidden"
            name="returnTo"
            value={`/projects/${pid}/assets/${aid}/reference-images/${iid}/edit`}
          />
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Push to Invoke
          </button>
        </form>
      </div>

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Replace Image File</label>
          <input
            type="file"
            name="imageFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            className="block w-full text-sm text-[#a4abb2] file:mr-3 file:rounded file:border file:border-[#3a4046] file:bg-[#1a1d20] file:px-3 file:py-1.5 file:text-xs file:text-[#a4abb2] file:cursor-pointer hover:file:bg-[#232629] file:transition-colors"
          />
          <p className="text-xs text-[#4b5158]">Leave the file empty to keep the current image.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Label</label>
          <input
            type="text"
            name="label"
            defaultValue={image.label ?? ""}
            placeholder="e.g. Hero front view, key lighting"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Role</label>
          <select name="imageRole" defaultValue={image.imageRole ?? ""} className={inputClass}>
            <option value="">None</option>
            {ROLE_GROUPS.map((group) => (
              <optgroup key={group.category} label={group.label}>
                {group.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Variant / State</label>
          <input
            type="text"
            name="variantState"
            defaultValue={image.variantState ?? ""}
            placeholder="e.g. Injured, Night version, Damaged"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Notes</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={image.notes ?? ""}
            placeholder="Usage notes, context, source..."
            className={inputClass + " resize-y"}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Usage Notes</label>
          <textarea
            name="usageNotes"
            rows={3}
            defaultValue={image.usageNotes ?? ""}
            placeholder="How/when this image should be used for generation..."
            className={inputClass + " resize-y"}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="approvedForGeneration"
            name="approvedForGeneration"
            defaultChecked={image.approvedForGeneration}
            className="rounded border-[#3a4046]"
          />
          <label htmlFor="approvedForGeneration" className="text-sm text-[#a4abb2]">
            Approved for Generation
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Save Reference Image
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
