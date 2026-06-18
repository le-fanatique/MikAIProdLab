import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import FormField from "@/components/FormField";
import { updateProject } from "@/actions/projects";

type Props = { params: Promise<{ projectId: string }> };

export default async function EditProjectPage({ params }: Props) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  const updateAction = updateProject.bind(null, id);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${id}` },
          { label: "Edit" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Edit Project</h1>

      <form action={updateAction} className="max-w-xl flex flex-col gap-5">
        <FormField
          label="Name"
          name="name"
          required
          defaultValue={project.name}
        />
        <FormField
          label="Pitch"
          name="pitch"
          type="textarea"
          rows={3}
          defaultValue={project.pitch}
        />
        <FormField
          label="Description"
          name="description"
          type="textarea"
          rows={5}
          defaultValue={project.description}
        />
        <FormField
          label="Status"
          name="status"
          type="select"
          defaultValue={project.status}
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
            Save Changes
          </button>
          <a
            href={`/projects/${id}`}
            className="rounded border border-neutral-700 text-neutral-400 px-5 py-2 text-sm hover:border-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
