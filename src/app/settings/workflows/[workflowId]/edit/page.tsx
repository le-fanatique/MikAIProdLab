import Link from "next/link";
import { db } from "@/db";
import { comfyWorkflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { updateComfyWorkflow } from "@/actions/comfyWorkflows";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_CATEGORY_IDS,
  WORKFLOW_CONTEXTS,
  WORKFLOW_CONTEXT_IDS,
  parseWorkflowContexts,
  parseWorkflowTags,
} from "@/lib/comfy/workflowCatalog";

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[#232629] pt-4 mt-2 mb-4">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#6e767d]">
        {label}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ error?: string }>;
};

const KIND_OPTIONS = [
  { value: "", label: "Select kind" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  ...WORKFLOW_CATEGORY_IDS.map((id) => ({ value: id, label: WORKFLOW_CATEGORIES[id].label })),
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: "Name is required.",
  invalid_kind: "Workflow kind is invalid.",
  missing_json: "Workflow JSON is required.",
  too_large: "Workflow JSON is too large. Maximum size is 5 MB.",
  invalid_json: "Invalid or unsupported workflow JSON. Use ComfyUI API JSON format.",
  invalid_category: "Selected category is invalid.",
  invalid_tags: "Tags could not be read. Use a comma-separated list.",
  invalid_contexts: "Selected contexts are invalid.",
  invalid_status: "Status is invalid.",
  thumbnail_missing_file: "Thumbnail file is missing.",
  thumbnail_invalid_file: "Thumbnail file could not be read.",
  thumbnail_too_large: "Thumbnail is too large. Maximum size is 10 MB.",
  thumbnail_invalid_type: "Thumbnail file type is not allowed. Use JPG, PNG, WEBP or GIF.",
  update_failed: "Could not save the workflow. Try again.",
};

export default async function EditWorkflowPage({ params, searchParams }: Props) {
  const { workflowId } = await params;
  const { error } = await searchParams;
  const wid = parseInt(workflowId, 10);
  if (isNaN(wid)) notFound();

  const [workflow] = await db
    .select()
    .from(comfyWorkflows)
    .where(eq(comfyWorkflows.id, wid));
  if (!workflow) notFound();

  const action = updateComfyWorkflow.bind(null, wid);
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  // Tolerant parsers (§5): a corrupted stored value must not prevent the
  // form that would repair it from opening.
  const currentTags = parseWorkflowTags(workflow.tags);
  const currentContexts = parseWorkflowContexts(workflow.contexts);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Workflows", href: "/settings/workflows" },
          { label: workflow.name, href: `/settings/workflows/${wid}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader title="Edit Workflow" />

      {errorMessage && (
        <p className="mb-5 text-sm text-[#cf7b6b]">{errorMessage}</p>
      )}

      <form action={action} className="flex flex-col gap-5">
        <FormField
          label="Name"
          name="name"
          required
          defaultValue={workflow.name}
          placeholder="e.g. LTX Image to Video"
        />
        <FormField
          label="Kind"
          name="kind"
          type="select"
          defaultValue={workflow.kind}
          options={KIND_OPTIONS}
          required
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={2}
          defaultValue={workflow.description}
          placeholder="Optional description..."
        />

        <SectionLabel label="Catalog" />

        <FormField
          label="Category"
          name="category"
          type="select"
          defaultValue={workflow.category ?? ""}
          options={CATEGORY_OPTIONS}
        />

        <FormField
          label="Tags"
          name="tags"
          defaultValue={currentTags.join(", ")}
          placeholder="storyboard, gemini, fast"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
            Contexts
          </label>
          <div className="flex flex-col gap-1.5">
            {WORKFLOW_CONTEXT_IDS.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm text-[#e7e9ec]">
                <input
                  type="checkbox"
                  name="contexts"
                  value={id}
                  defaultChecked={currentContexts?.includes(id) ?? false}
                />
                {WORKFLOW_CONTEXTS[id].label}
              </label>
            ))}
          </div>
          <p className="text-xs text-[#4b5158]">
            Leave every box unchecked to offer this workflow wherever the kind allows.
          </p>
        </div>

        <FormField
          label="Status"
          name="status"
          type="select"
          defaultValue={workflow.status}
          options={STATUS_OPTIONS}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Thumbnail
          </label>
          {workflow.thumbnailPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/${workflow.thumbnailPath}`}
              alt="Current thumbnail"
              className="h-24 w-24 rounded object-cover border border-[#2c3035]"
            />
          )}
          <input
            type="file"
            name="thumbnailFile"
            accept="image/*"
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-[#1a1d20] file:text-[#a4abb2] hover:file:bg-[#212529] focus:outline-none focus:border-[#3a4046] transition-colors cursor-pointer"
          />
          {workflow.thumbnailPath && (
            <label className="flex items-center gap-2 text-sm text-[#e7e9ec]">
              <input type="checkbox" name="removeThumbnail" />
              Remove thumbnail
            </label>
          )}
        </div>

        <SectionLabel label="Upload" />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Replace Workflow JSON File
          </label>
          <input
            type="file"
            name="workflowFile"
            accept=".json,application/json"
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-[#1a1d20] file:text-[#a4abb2] hover:file:bg-[#212529] focus:outline-none focus:border-[#3a4046] transition-colors cursor-pointer"
          />
        </div>

        <FormField
          label="Workflow JSON"
          name="workflowJson"
          type="textarea"
          rows={12}
          defaultValue={workflow.workflowJson}
        />

        <p className="text-xs text-[#4b5158]">
          Upload a new file or edit the JSON below to replace the stored workflow.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Save Workflow
          </button>
          <Link
            href={`/settings/workflows/${wid}`}
            className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
