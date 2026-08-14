// ---------------------------------------------------------------------------
// GET /api/llm-templates/[templateId]/export — LLMW.STORAGE.1 (B6a)
//
// Downloads an `llm_templates` row's stored `templateJson`, reformatted
// readable (§4.2: "Export produces a short, readable JSON"), not the
// compacted string stored in the row. Form of precedent:
// `src/app/api/projects/[projectId]/sequences/[sequenceId]/editorial-export/route.ts:216`
// — but `attachment;`, not `inline;`: this is a download, not a preview.
// A `templateId` that does not resolve to a row answers 404.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/db";
import { llmTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const id = parseInt(templateId, 10);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 404 });
  }

  const [template] = await db.select().from(llmTemplates).where(eq(llmTemplates.id, id));
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  let readable: string;
  try {
    readable = JSON.stringify(JSON.parse(template.templateJson), null, 2);
  } catch {
    // Stored JSON should always be valid (written only via a validated
    // path), but fall back to the raw string rather than fail the export.
    readable = template.templateJson;
  }

  const safeName = template.name.replace(/[^a-zA-Z0-9-_]+/g, "-");
  const filename = `llm-template-${id}-${safeName}.json`;

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
