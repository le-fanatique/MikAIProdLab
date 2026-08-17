"use server";

import { db } from "@/db";
import { projects, assets } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { GeneratedAssetCandidate } from "@/types/llm";
import { runOperation } from "@/lib/llmWorkspace/runner";
import { assetsFromProjectDescriptor } from "@/lib/llmWorkspace/descriptors/assetsFromProject";
import { mapListItemToModelKeys } from "@/lib/llmWorkspace/benchRun";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ASSET_TYPES = [
  "character",
  "environment",
  "prop",
  "vehicle",
  "crowd",
  "other",
] as const;
type AssetType = (typeof VALID_ASSET_TYPES)[number];

function normalizeAssetType(raw: unknown): AssetType {
  if (typeof raw === "string" && (VALID_ASSET_TYPES as readonly string[]).includes(raw)) {
    return raw as AssetType;
  }
  return "other";
}

function str(v: unknown, maxLen = 1000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maxLen) : null;
}

function normalizeCandidate(raw: unknown): GeneratedAssetCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 200);
  if (!name) return null;

  const rawSourceLevel = r.sourceLevel ?? r.source_level;
  const sourceLevel: GeneratedAssetCandidate["sourceLevel"] =
    rawSourceLevel === "outline" ||
    rawSourceLevel === "sequence" ||
    rawSourceLevel === "shot" ||
    rawSourceLevel === "story"
      ? rawSourceLevel
      : "outline";

  return {
    name,
    assetType: normalizeAssetType(r.assetType ?? r.asset_type),
    description: str(r.description, 500),
    notes: str(r.notes, 500),
    sourceLevel,
    sourceExcerpt: str(r.sourceExcerpt ?? r.source_excerpt, 200),
    duplicateWarning: str(r.duplicateWarning ?? r.duplicate_warning, 200),
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Thin adapter over `runOperation(assetsFromProjectDescriptor, ...)`
 * (LLMW.MIGRATE.LIST.3, B7f-m), on the same model
 * `generateSequencesFromOutlineDraft` (`src/actions/llm/sequenceGeneration.ts`,
 * post-B7g-m) already reproduces: keeps the exact `{ok:true, assets}` return
 * shape `AssetsLLMExtractPanel` depends on.
 *
 * The form sends seven booleans (`includeShots` plus six `include*` type
 * flags, `AssetsLLMExtractPanel.tsx:63-69` / `assetExtraction.ts` pre-
 * migration lines 92-101); the descriptor declares two `intent.parameters`:
 * `includeShots` (`"boolean"`) and `assetTypes` (`"multiEnum"`). Converting
 * the seven form booleans into these two parameters is this adapter's own
 * job — the panel is not touched. The six `if` below are read verbatim off
 * the pre-migration source (`assetExtraction.ts:96-101`, `git show
 * bd38db5:src/actions/llm/assetExtraction.ts`) and kept in that exact order
 * (`character, environment, prop, vehicle, crowd, other`): the prompt
 * builder joins `assetTypes` as-is (`assets-from-project.ts:52`, `typesStr`),
 * so the array's member order is observable in the rendered prompt.
 *
 * An empty `assetTypes` array is passed through unchanged, not omitted: a
 * `"multiEnum"` value of `[]` is valid per `isValidIntentParameterValue`
 * (`runner.ts`), so `normalizeIntentParameters` never substitutes the
 * descriptor's default (`["character", "environment", "prop"]`) for it. The
 * descriptor's own `preconditions[0]` (`refs: [{parameter: "assetTypes"}]`)
 * then reproduces "Select at least one asset type." on that empty array
 * exactly as the pre-migration guard did. Falling back to the default here
 * would silently defeat that guard and run an extraction the user refused —
 * proven by the mutation control in `tests/llmWorkspace/assetsFromProject.migration.test.ts`
 * (see `.agents/executor_report.md`).
 *
 * `result.items` are keyed by entity field name (`assetType`); the same
 * `mapListItemToModelKeys` bridge `generateSequencesFromOutlineDraft` uses
 * translates each item back to the model's own JSON keys, matching
 * `GeneratedAssetCandidate`'s own field names. Only the five `type: "string"`
 * fields (`name`, `description`, `notes`, `sourceExcerpt`,
 * `duplicateWarning`) need the `"" -> null` fill-back `readStringField`
 * (`runner.ts`) does not do itself. `assetType` and `sourceLevel` are the
 * two `type: "enum"` fields, each with a mandatory `default`
 * (`assetsFromProjectDescriptor.output.item.fields`), so `readEnumField`
 * always produces one of their valid members, never `""` — they need no
 * fill. `name` is never `null` — `item.validity` already filtered out any
 * item missing it.
 */
export async function generateAssetCandidatesDraft(
  formData: FormData
): Promise<{ ok: true; assets: GeneratedAssetCandidate[] } | { ok: false; error: string }> {
  try {
    const projectId = parseInt(formData.get("projectId") as string, 10);

    const bool = (key: string) => formData.get(key) === "true";
    const includeShots = bool("includeShots");

    const assetTypes: AssetType[] = [];
    if (bool("includeCharacters")) assetTypes.push("character");
    if (bool("includeEnvironments")) assetTypes.push("environment");
    if (bool("includeProps")) assetTypes.push("prop");
    if (bool("includeVehicles")) assetTypes.push("vehicle");
    if (bool("includeCrowds")) assetTypes.push("crowd");
    if (bool("includeOther")) assetTypes.push("other");

    const result = await runOperation(
      assetsFromProjectDescriptor,
      { projectId },
      { parameters: { includeShots, assetTypes } }
    );
    if (!result.ok) return { ok: false, error: result.error };
    // `assetsFromProjectDescriptor.output.kind` is always `"list"` — the
    // guard exists because `RunOperationResult` is `kind`-discriminated
    // (LLMW.OUTPUT.LIST.1, B7a), not because this branch is reachable here.
    if (result.kind !== "list") {
      throw new Error("generateAssetCandidatesDraft: expected a list-kind result.");
    }
    if (assetsFromProjectDescriptor.output.kind !== "list") {
      throw new Error("generateAssetCandidatesDraft: descriptor output is not list-kind.");
    }

    const fields = assetsFromProjectDescriptor.output.item.fields;
    const stringFields = new Set(fields.filter((f) => f.type === "string").map((f) => f.field));
    const generatedAssets: GeneratedAssetCandidate[] = result.items.map((item) => {
      const mapped = mapListItemToModelKeys(fields, item);
      const candidate: Record<string, string | number | null> = {};
      for (const field of fields) {
        const key = field.jsonKey;
        if (!(key in mapped)) {
          candidate[key] = null;
          continue;
        }
        const value = mapped[key];
        candidate[key] = stringFields.has(field.field) && value === "" ? null : value;
      }
      return candidate as unknown as GeneratedAssetCandidate;
    });

    return { ok: true, assets: generatedAssets };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error. Please try again.";
    return { ok: false, error: message };
  }
}

export async function createSelectedAssets(formData: FormData): Promise<void> {
  const projectId = parseInt(formData.get("projectId") as string, 10);
  const returnTo =
    (formData.get("returnTo") as string | null)?.trim() ||
    `/projects/${projectId}/assets`;
  const selectedJson = (formData.get("selectedJson") as string | null) ?? "";

  function errRedirect(msg: string): never {
    const sep = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${sep}assetsCreateError=${encodeURIComponent(msg)}`);
  }

  if (!Number.isInteger(projectId) || projectId <= 0) {
    errRedirect("Invalid request.");
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    errRedirect("Project not found.");
  }

  let candidates: GeneratedAssetCandidate[];
  try {
    const raw = JSON.parse(selectedJson);
    if (!Array.isArray(raw)) throw new Error();
    candidates = raw
      .map(normalizeCandidate)
      .filter((c): c is GeneratedAssetCandidate => c !== null);
  } catch {
    errRedirect("Invalid asset data.");
  }

  if (candidates!.length === 0) {
    errRedirect("No valid assets to create.");
  }

  const [maxResult] = await db
    .select({ max: max(assets.orderIndex) })
    .from(assets)
    .where(eq(assets.projectId, projectId));

  const startIndex = (maxResult?.max ?? -1) + 1;

  for (let i = 0; i < candidates!.length; i++) {
    const c = candidates![i];
    await db.insert(assets).values({
      projectId,
      name: c.name,
      type: c.assetType,
      description: c.description ?? null,
      notes: c.notes ?? null,
      orderIndex: startIndex + i,
    });
  }

  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}assetsCreated=${candidates!.length}`);
}
