// ---------------------------------------------------------------------------
// compareFields.ts — STYLE.1.F.UI
//
// Pure, additive helper — NOT part of the frozen STYLE.1.F.CORE contract,
// never imported by src/actions/assetAlignment.ts. The Asset Alignment
// review panel needs to derive, client-side, whether the user's edited
// proposal fields still differ from the generated canonical baseline — the
// exact same semantic question CORE's own `hasRealChange` (Apply) answers
// server-side. Both sides compare on a trimmed representation, so this
// helper's answer always agrees with what Apply will decide once
// `normalizeAlignmentFieldForStorage` runs there. This file only reads
// `AssetAlignmentFieldValues`/`ASSET_ALIGNMENT_EDITABLE_FIELDS` from
// contracts.ts — it never redefines or duplicates them.
// ---------------------------------------------------------------------------

import { ASSET_ALIGNMENT_EDITABLE_FIELDS, type AssetAlignmentFieldValues } from "./contracts";

/** True when at least one of the five fields, trimmed, differs from the baseline's own (already-trimmed) value — the exact condition the UI uses to choose between submitting `changes-proposed` and `already-aligned`. */
export function hasAlignmentFieldChanges(baseline: AssetAlignmentFieldValues, fields: AssetAlignmentFieldValues): boolean {
  return ASSET_ALIGNMENT_EDITABLE_FIELDS.some((field) => fields[field].trim() !== baseline[field].trim());
}
