import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import { createComfyWorkflow } from "@/actions/comfyWorkflows";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

const KIND_OPTIONS = [
  { value: "", label: "Select kind" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
];

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: "Name is required.",
  invalid_kind: "Workflow kind is invalid.",
  missing_json: "Workflow JSON is required.",
  too_large: "Workflow JSON is too large. Maximum size is 5 MB.",
  invalid_json: "Invalid or unsupported workflow JSON. Use ComfyUI API JSON format.",
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

      <form action={createComfyWorkflow} className="flex flex-col gap-5 max-w-lg">
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Workflow JSON File
          </label>
          <input
            type="file"
            name="workflowFile"
            accept=".json,application/json"
            className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-neutral-700 file:text-neutral-200 hover:file:bg-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors cursor-pointer"
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
