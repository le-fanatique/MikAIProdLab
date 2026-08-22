import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { createComfyWorkflow } from "@/actions/comfyWorkflows";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_CATEGORY_IDS,
  WORKFLOW_CONTEXTS,
  WORKFLOW_CONTEXT_IDS,
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
  insert_failed: "Could not create the workflow. Try again.",
};

export default async function NewWorkflowPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Workflows", href: "/settings/workflows" },
          { label: "Add Workflow" },
        ]}
      />
      <PageHeader title="Add Workflow" />

      {errorMessage && (
        <p className="mb-5 text-sm text-[#cf7b6b]">{errorMessage}</p>
      )}

      <form action={createComfyWorkflow} className="flex flex-col gap-5">
        <FormField label="Name" name="name" required placeholder="e.g. LTX Image to Video" />
        <FormField
          label="Kind"
          name="kind"
          type="select"
          options={KIND_OPTIONS}
          required
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={2}
          placeholder="Optional description..."
        />

        <SectionLabel label="Catalog" />

        <FormField
          label="Category"
          name="category"
          type="select"
          options={CATEGORY_OPTIONS}
        />

        <FormField
          label="Tags"
          name="tags"
          placeholder="storyboard, gemini, fast"
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
            Contexts
          </label>
          <div className="flex flex-col gap-1.5">
            {WORKFLOW_CONTEXT_IDS.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm text-[#e7e9ec]">
                <input type="checkbox" name="contexts" value={id} />
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
          defaultValue="active"
          options={STATUS_OPTIONS}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Thumbnail
          </label>
          <input
            type="file"
            name="thumbnailFile"
            accept="image/*"
            className="w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-[#1a1d20] file:text-[#a4abb2] hover:file:bg-[#212529] focus:outline-none focus:border-[#3a4046] transition-colors cursor-pointer"
          />
        </div>

        <SectionLabel label="Upload" />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[#6e767d]">
            Workflow JSON File
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
          placeholder='Paste ComfyUI API JSON here (e.g. {"1": {"class_type": "...", ...}})'
        />

        <div className="flex flex-col gap-1 text-xs text-[#4b5158]">
          <p>Use ComfyUI API JSON format. UI workflow JSON is not supported.</p>
          <p>File takes priority over pasted JSON.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-[#e7e9ec] text-[#0d0e10] px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Add Workflow
          </button>
          <Link
            href="/settings/workflows"
            className="text-sm text-[#6e767d] hover:text-[#a4abb2] transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
