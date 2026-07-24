// ---------------------------------------------------------------------------
// ownershipB.ts — STYLE.1.B.CORE
//
// Shared Project-existence check reused by projectStyleReferences.ts and
// projectStyleInfluences.ts (mirrors assertProjectExists in projectStyle.ts,
// STYLE.1.A — kept as its own tiny module here instead of exporting from
// that file, since it is not Working-Draft-specific).
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isValidId } from "@/lib/projectStyle/validationB";

export type OwnershipResult = { ok: true } | { ok: false; error: string };

export async function assertProjectExists(projectId: unknown): Promise<OwnershipResult> {
  if (!isValidId(projectId)) return { ok: false, error: "Invalid project id." };
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return { ok: false, error: "Project not found." };
  return { ok: true };
}
