import { createProject } from "@/actions/projects";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";

export default function NewProjectPage() {
  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: "New Project" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">New Project</h1>

      <form action={createProject} className="max-w-xl flex flex-col gap-5">
        <FormField label="Name" name="name" required placeholder="Project name" />
        <FormField
          label="Pitch"
          name="pitch"
          type="textarea"
          rows={3}
          placeholder="One-line or short concept pitch"
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={5}
          placeholder="Longer description, notes, context..."
        />
        <FormField
          label="Status"
          name="status"
          type="select"
          defaultValue="draft"
          options={[
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded bg-neutral-100 text-neutral-900 px-5 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Create Project
          </button>
          <a
            href="/projects"
            className="rounded border border-neutral-700 text-neutral-400 px-5 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
