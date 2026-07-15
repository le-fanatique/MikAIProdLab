import { db } from "@/db";
import { promptSegments, shotAssets, assets, shotReferenceImages, assetReferenceImages } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import Card from "@/components/Card";
import Collapsible from "@/components/Collapsible";
import CopyTextButton from "@/components/CopyTextButton";
import { compilePromptSegments } from "@/lib/prompts/compilePromptSegments";
import type { PromptCompilationReferenceImageInput } from "@/lib/prompts/buildPromptCompilationContext";
import {
  buildSequenceGenerationPackage,
  formatSequenceGenerationPackageText,
  type SequenceGenerationPackageShotInput,
} from "@/lib/prompts/buildSequenceGenerationPackage";

type ShotRow = {
  id: number;
  shotCode: string | null;
  title: string;
  description: string | null;
  actionPitch: string | null;
  cameraPitch: string | null;
  framing: string | null;
  cameraMovement: string | null;
  continuityIn: string | null;
  continuityOut: string | null;
  continuityNotes: string | null;
  durationSeconds: number | null;
  shotPrompt: string | null;
  approvedVideoPath: string | null;
  orderIndex: number;
};

type Props = {
  projectId: number;
  sequenceId: number;
  sequence: {
    title: string;
    sequenceCode: string | null;
    summary: string | null;
    mood: string | null;
    locationHint: string | null;
    narrativePurpose: string | null;
  };
  project: {
    name: string;
    pitch: string | null;
    story: string | null;
  };
  /** Already ordered by orderIndex (Sequence Structure/Storyboard order) — never re-sorted here. */
  shots: ShotRow[];
  /**
   * SEQGEN.STORYBOARD.2 — optional: only read for the two `pkg*` option
   * flags below. Any other key is ignored, so passing a page's full
   * `searchParams` object (Sequence Detail, Storyboard) is safe.
   */
  searchParams?: Record<string, string | string[] | undefined>;
};

// A checkbox's own field is present only while checked, so "checked by
// default" needs the classic hidden("0") + checkbox("1") pair with the same
// `name` — GET-submits either "0" alone (unchecked) or "0","1" together
// (checked, both values present). Absent entirely (first load, no form
// submission yet) falls back to `defaultOn`.
function isFlagOn(raw: string | string[] | undefined, defaultOn: boolean): boolean {
  if (raw === undefined) return defaultOn;
  if (Array.isArray(raw)) return raw.includes("1");
  return raw === "1";
}

/**
 * SEQGEN.1 (extended by SEQGEN.STORYBOARD.2 with the `Ignore prompt
 * segments`/`Ignore unapproved reference images` options) — read-only
 * preview of the Sequence Generation Package: an async Server Component
 * (same pattern as ShotGenerationPanel) that gathers per-Shot casting/
 * references/Asset Bibles/Prompt Segments with lightweight batched queries,
 * then hands everything to the pure buildSequenceGenerationPackage/
 * compileShotPrompt/buildPromptCompilationContext chain. Never calls
 * ComfyUI, never writes to the DB, never produces a video.
 */
export default async function SequenceGenerationPackagePanel({
  projectId,
  sequenceId,
  sequence,
  project,
  shots,
  searchParams = {},
}: Props) {
  const ignorePromptSegments = isFlagOn(searchParams["pkgIgnoreSegments"], true);
  const ignoreUnapprovedReferences = isFlagOn(searchParams["pkgIgnoreUnapproved"], true);
  const shotIds = shots.map((s) => s.id);

  const segmentRows =
    shotIds.length > 0
      ? await db
          .select()
          .from(promptSegments)
          .where(inArray(promptSegments.shotId, shotIds))
          .orderBy(asc(promptSegments.orderIndex))
      : [];
  const segmentsByShot = new Map<number, typeof segmentRows>();
  for (const row of segmentRows) {
    const list = segmentsByShot.get(row.shotId) ?? [];
    list.push(row);
    segmentsByShot.set(row.shotId, list);
  }

  const castRows =
    shotIds.length > 0
      ? await db
          .select({
            shotId: shotAssets.shotId,
            assetId: assets.id,
            assetName: assets.name,
            assetType: assets.type,
            description: assets.description,
            notes: assets.notes,
            visualIdentity: assets.visualIdentity,
            usageRules: assets.usageRules,
            forbiddenVariations: assets.forbiddenVariations,
          })
          .from(shotAssets)
          .innerJoin(assets, eq(shotAssets.assetId, assets.id))
          .where(inArray(shotAssets.shotId, shotIds))
          .orderBy(asc(assets.name))
      : [];
  const castByShot = new Map<number, typeof castRows>();
  for (const row of castRows) {
    const list = castByShot.get(row.shotId) ?? [];
    list.push(row);
    castByShot.set(row.shotId, list);
  }

  const shotRefRows =
    shotIds.length > 0
      ? await db
          .select({
            id: shotReferenceImages.id,
            shotId: shotReferenceImages.shotId,
            label: shotReferenceImages.label,
            imageRole: shotReferenceImages.imageRole,
          })
          .from(shotReferenceImages)
          .where(inArray(shotReferenceImages.shotId, shotIds))
          .orderBy(asc(shotReferenceImages.orderIndex), asc(shotReferenceImages.id))
      : [];
  const shotRefsByShot = new Map<number, typeof shotRefRows>();
  for (const row of shotRefRows) {
    const list = shotRefsByShot.get(row.shotId) ?? [];
    list.push(row);
    shotRefsByShot.set(row.shotId, list);
  }

  const allCastAssetIds = Array.from(new Set(castRows.map((r) => r.assetId)));
  const assetRefRows =
    allCastAssetIds.length > 0
      ? await db
          .select({
            id: assetReferenceImages.id,
            assetId: assetReferenceImages.assetId,
            label: assetReferenceImages.label,
            imageRole: assetReferenceImages.imageRole,
            variantState: assetReferenceImages.variantState,
            usageNotes: assetReferenceImages.usageNotes,
            approvedForGeneration: assetReferenceImages.approvedForGeneration,
          })
          .from(assetReferenceImages)
          .where(inArray(assetReferenceImages.assetId, allCastAssetIds))
          .orderBy(asc(assetReferenceImages.orderIndex), asc(assetReferenceImages.id))
      : [];
  const assetRefsByAsset = new Map<number, typeof assetRefRows>();
  for (const row of assetRefRows) {
    const list = assetRefsByAsset.get(row.assetId) ?? [];
    list.push(row);
    assetRefsByAsset.set(row.assetId, list);
  }

  const shotInputs: SequenceGenerationPackageShotInput[] = shots.map((s) => {
    const segments = segmentsByShot.get(s.id) ?? [];
    const hasPromptSegments = segments.length > 0;
    const compiledSegments = compilePromptSegments(segments);
    const cast = castByShot.get(s.id) ?? [];

    const references: PromptCompilationReferenceImageInput[] = [
      ...(shotRefsByShot.get(s.id) ?? []).map((img) => ({
        refId: `shot-${img.id}`,
        source: "shot" as const,
        assetId: null,
        assetName: null,
        label: img.label,
        role: img.imageRole,
        variantState: null,
        usageNotes: null,
        approvedForGeneration: null,
      })),
      ...cast.flatMap((c) =>
        (assetRefsByAsset.get(c.assetId) ?? []).map((img) => ({
          refId: `asset-${c.assetId}-${img.id}`,
          source: "asset" as const,
          assetId: c.assetId,
          assetName: c.assetName,
          label: img.label,
          role: img.imageRole,
          variantState: img.variantState,
          usageNotes: img.usageNotes,
          approvedForGeneration: img.approvedForGeneration,
        }))
      ),
    ];

    return {
      shotId: s.id,
      shotCode: s.shotCode,
      title: s.title,
      orderIndex: s.orderIndex,
      durationSeconds: s.durationSeconds,
      hasApprovedVideo: s.approvedVideoPath !== null,
      continuity: {
        framing: s.framing,
        cameraMovement: s.cameraMovement,
        continuityIn: s.continuityIn,
        continuityOut: s.continuityOut,
        continuityNotes: s.continuityNotes,
      },
      promptContext: {
        shot: {
          title: s.title,
          description: s.description,
          actionPitch: s.actionPitch,
          cameraPitch: s.cameraPitch,
          durationSeconds: s.durationSeconds,
          shotPrompt: s.shotPrompt,
          compiledPromptSegments: hasPromptSegments ? compiledSegments.text : "",
          hasPromptSegments,
          hasMissingTiming: compiledSegments.hasMissingTiming,
        },
        castAssets: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          description: c.description,
          notes: c.notes,
        })),
        references,
        assetBibles: cast.map((c) => ({
          assetId: c.assetId,
          assetName: c.assetName,
          assetType: c.assetType,
          visualIdentity: c.visualIdentity,
          usageRules: c.usageRules,
          forbiddenVariations: c.forbiddenVariations,
        })),
        sequenceContext: sequence,
        projectContext: project,
        sources: {
          casting: true,
          references: true,
          assetBibles: true,
          sequenceContext: true,
          projectContext: true,
        },
      },
    };
  });

  const pkg = buildSequenceGenerationPackage(
    {
      projectId,
      sequenceId,
      sequenceTitle: sequence.title,
      sequenceCode: sequence.sequenceCode,
    },
    shotInputs,
    { ignorePromptSegments, ignoreUnapprovedReferences }
  );
  const formattedText = formatSequenceGenerationPackageText(pkg);
  const formattedJson = JSON.stringify(pkg, null, 2);

  return (
    <Card title="Sequence Generation Package">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#a4abb2]">
          <span>
            {pkg.shotCount} shot{pkg.shotCount !== 1 ? "s" : ""}
          </span>
          <span>
            <span className="text-[#4b5158]">Known duration </span>
            <span className="font-mono">{pkg.totalKnownDurationSeconds.toFixed(1)}s</span>
            <span className="text-[#4b5158]">
              {" "}
              ({pkg.knownDurationShotCount}/{pkg.shotCount} timed)
            </span>
          </span>
        </div>

        {/* SEQGEN.STORYBOARD.2 — package options, both checked by default.
            Native GET form: no JS needed, works under pure SSR. Exclusions
            never erase source data — only this recomputed package. */}
        <form method="get" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#a4abb2] border-t border-[#232629] pt-3">
          <label className="flex items-center gap-1.5">
            <input type="hidden" name="pkgIgnoreSegments" value="0" />
            <input
              type="checkbox"
              name="pkgIgnoreSegments"
              value="1"
              defaultChecked={ignorePromptSegments}
              className="accent-[#5b93d6]"
            />
            Ignore prompt segments
          </label>
          <label className="flex items-center gap-1.5">
            <input type="hidden" name="pkgIgnoreUnapproved" value="0" />
            <input
              type="checkbox"
              name="pkgIgnoreUnapproved"
              value="1"
              defaultChecked={ignoreUnapprovedReferences}
              className="accent-[#5b93d6]"
            />
            Ignore unapproved reference images
          </label>
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-2.5 py-1 text-xs hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors"
          >
            Apply
          </button>
        </form>

        {pkg.warnings.length > 0 && (
          <div className="rounded border border-[#3d3423] bg-[#2e2410]/30 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-[#cda24f] mb-1.5">
              Warnings ({pkg.warnings.length})
            </p>
            <ul className="flex flex-col gap-0.5">
              {pkg.warnings.map((w, i) => (
                <li key={i} className="text-xs text-[#cda24f]">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2">
          <CopyTextButton text={formattedText} label="Copy compiled text" />
          <CopyTextButton text={formattedJson} label="Copy JSON" />
        </div>

        <Collapsible label={`Shot-by-shot detail (${pkg.shotCount})`}>
          <div className="flex flex-col gap-3">
            {pkg.shots.map((s, i) => (
              <div key={s.shotId} className="rounded border border-[#232629] bg-[#141618] p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-mono text-[#6e767d]">
                    #{i + 1} · {s.shotCode ?? "—"} · {s.title}
                  </span>
                  <span className="text-[10px] font-mono text-[#4b5158] shrink-0">
                    {s.durationSeconds !== null ? `${s.durationSeconds.toFixed(1)}s` : "no duration"}
                  </span>
                </div>
                <p className="text-[10px] text-[#4b5158] mb-1.5">
                  References: {s.referenceSourceCounts.shot} shot · {s.referenceSourceCounts.asset} asset
                </p>
                <pre className="text-[11px] text-[#a4abb2] whitespace-pre-wrap">
                  {s.compiledPrompt.text || "(no compiled prompt)"}
                </pre>
                {s.warnings.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {s.warnings.map((w, wi) => (
                      <li key={wi} className="text-[10px] text-[#cda24f]">
                        ⚠ {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Collapsible>

        <Collapsible label="Full JSON package">
          <pre className="text-[10px] text-[#6e767d] bg-[#141618] border border-[#232629] rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {formattedJson}
          </pre>
        </Collapsible>
      </div>
    </Card>
  );
}
