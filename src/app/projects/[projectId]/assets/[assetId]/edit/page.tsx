import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { updateAsset } from "@/actions/assets";

type Props = {
  params: Promise<{ projectId: string; assetId: string }>;
};

const ASSET_TYPE_OPTIONS = [
  { value: "character", label: "Character" },
  { value: "environment", label: "Environment" },
  { value: "prop", label: "Prop" },
  { value: "vehicle", label: "Vehicle" },
  { value: "crowd", label: "Crowd" },
  { value: "other", label: "Other" },
];

export default async function EditAssetPage({ params }: Props) {
  const { projectId, assetId } = await params;
  const pid = parseInt(projectId, 10);
  const aid = parseInt(assetId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, aid));
  if (!asset || asset.projectId !== pid) notFound();

  const action = updateAsset.bind(null, aid, pid);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${pid}` },
          { label: "Assets", href: `/projects/${pid}/assets` },
          { label: asset.name, href: `/projects/${pid}/assets/${aid}` },
          { label: "Edit" },
        ]}
      />

      <PageHeader title="Edit Asset" />

      <form action={action} className="flex flex-col gap-5 max-w-lg">
        <FormField
          label="Name"
          name="name"
          required
          defaultValue={asset.name}
        />
        <FormField
          label="Type"
          name="type"
          type="select"
          required
          defaultValue={asset.type}
          options={ASSET_TYPE_OPTIONS}
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={3}
          defaultValue={asset.description}
        />
        <FormField
          label="Notes"
          name="notes"
          type="textarea"
          rows={3}
          defaultValue={asset.notes}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Save Changes
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
