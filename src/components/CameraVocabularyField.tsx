// ---------------------------------------------------------------------------
// CameraVocabularyField.tsx — B19c, the camera vocabulary's first consumer.
//
// Server Component, no state, no effect: renders one axis of
// `src/lib/cameraVocabulary.ts` as a text `<input list>` + `<datalist>` pair
// (never a `<select>` — the palette is suggestions over free text, not a
// closed enum; a `<select>` would make the 13 out-of-palette values already
// in the DB unreachable and silently replace them on the next save). Works
// with JavaScript disabled, exactly like `FieldTooltip`, which this reuses
// for the per-value definitions rather than duplicating that mechanism.
//
// `cameraSubject` (no palette, `axis.values.length === 0`) renders as plain
// free text: no datalist, no per-value tooltip (nothing to define beyond the
// axis itself), no out-of-palette flag (there is no palette to be outside
// of) — only the axis definition, always visible under the label.
// ---------------------------------------------------------------------------

import FieldTooltip from "@/components/FieldTooltip";
import {
  CameraVocabularyAxisId,
  getCameraVocabularyAxis,
  recognizeCameraVocabularyValue,
  writtenCameraVocabularyValue,
} from "@/lib/cameraVocabulary";

type Props = {
  axisId: CameraVocabularyAxisId;
  /** Form field name — kept independent from `axisId` so the existing
   * `framing`/`camera_movement` naming conventions already read by
   * `src/actions/shots.ts` are preserved rather than renamed. */
  name: string;
  defaultValue?: string | null;
};

function formatValueDefinitionsTooltip(axisId: CameraVocabularyAxisId): string {
  const axis = getCameraVocabularyAxis(axisId);
  return axis.values
    .map((v) => `${v.code} — ${v.label}${v.group ? ` (${v.group})` : ""}: ${v.definition}`)
    .join(" · ");
}

const inputClass =
  "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors";

export default function CameraVocabularyField({ axisId, name, defaultValue }: Props) {
  const axis = getCameraVocabularyAxis(axisId);
  const listId = `camera-vocab-${axisId}`;
  const raw = defaultValue ?? "";
  const hasPalette = axis.values.length > 0;

  // `recognizeCameraVocabularyValue` never throws and never picks a default
  // (see cameraVocabulary.ts). `interval` ("MS to WS") is a valid shape, not
  // an out-of-palette flag — only `unknown` on a non-empty value is.
  const recognition = hasPalette ? recognizeCameraVocabularyValue(axisId, raw) : null;
  const isOutOfPalette = recognition?.kind === "unknown" && raw.trim() !== "";

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wider text-[#a4abb2] inline-flex items-center gap-1.5"
      >
        {axis.label}
        {hasPalette && <FieldTooltip text={formatValueDefinitionsTooltip(axisId)} />}
      </label>
      <p className="text-[11px] text-[#6e767d]">{axis.definition}</p>
      <input
        id={name}
        type="text"
        name={name}
        list={hasPalette ? listId : undefined}
        defaultValue={raw}
        className={inputClass}
      />
      {hasPalette && (
        <datalist id={listId}>
          {axis.values.map((v) => (
            <option key={`${v.code}-${v.group ?? ""}`} value={writtenCameraVocabularyValue(axis, v)}>
              {axis.writtenForm === "code" ? `${v.code} — ${v.label}` : v.label}
              {v.group ? ` — ${v.group}` : ""}
            </option>
          ))}
        </datalist>
      )}
      {isOutOfPalette && (
        <span className="text-[9px] uppercase tracking-wider text-[#cda24f]">
          Out of palette — kept as written
        </span>
      )}
    </div>
  );
}
