import { db } from "@/db";
import { sequenceVideoSplitRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string; sequenceId: string; splitRunId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SEQGEN.SPLIT.WORKSPACE.1 (Lot A) — compatibility redirect only. The
 * dedicated per-run review page has been merged into the unified workspace
 * at `.../storyboard/video/splits`; this route now exists purely so no
 * pre-existing bookmark/link to `.../splits/[splitRunId]` ever 404s. It
 * re-derives `sequenceVideoDraftId` from the run's own server row (never
 * trusted from the URL) and preserves every feedback query param
 * (`splitError`/`splitWarning`/`splitEdited`/`splitValidated`) across the
 * redirect so in-flight feedback from an action that still targets the old
 * URL shape is never silently lost.
 */
export default async function SequenceVideoSplitRunCompatRedirect({ params, searchParams }: Props) {
  const { projectId, sequenceId, splitRunId } = await params;
  const resolvedSearchParams = await searchParams;
  const pid = parseInt(projectId, 10);
  const sid = parseInt(sequenceId, 10);
  const runId = parseInt(splitRunId, 10);

  const [run] = await db.select().from(sequenceVideoSplitRuns).where(eq(sequenceVideoSplitRuns.id, runId));
  if (!run || run.sequenceId !== sid) notFound();

  const target = new URLSearchParams();
  target.set("sequenceVideoDraftId", String(run.sequenceVideoDraftId));
  target.set("splitRunId", String(run.id));
  for (const key of ["splitError", "splitWarning", "splitEdited", "splitValidated"]) {
    const raw = resolvedSearchParams[key];
    const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (value !== undefined) target.set(key, value);
  }

  redirect(`/projects/${pid}/sequences/${sid}/storyboard/video/splits?${target.toString()}`);
}
