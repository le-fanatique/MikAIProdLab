import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * STORY.WORKSPACE.MERGE.1: /outline is a compatibility route, not a second
 * workspace. Story Workspace now owns the outline editor, its generation,
 * Sequence Structure (with per-sequence narrative context editing and
 * deletion, both moved from here), Assets and Casting Coverage — see
 * src/app/projects/[projectId]/story/page.tsx. Any incoming query-string
 * feedback (e.g. sequencesCreated) is forwarded so it still renders after
 * the redirect, and #outline anchors straight to the Outline section
 * instead of leaving this as a dead or competing page.
 */
export default async function OutlinePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) notFound();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) query.set(key, value[0]);
  }
  const queryString = query.toString();

  redirect(`/projects/${pid}/story${queryString ? `?${queryString}` : ""}#outline`);
}
