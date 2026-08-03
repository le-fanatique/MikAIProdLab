"use server";

// UX.PRODUCTIVITY.POLISH.1 — Lot B. Server Actions for durable Custom
// Appearance (theme) presets. Same atomic read-check-write + optimistic
// concurrency pattern as `mutateComfyLocalPresets` (src/actions/settings.ts,
// Lot A): the whole read+validate+write happens inside one synchronous
// `db.transaction`, so two browser tabs can never silently clobber each
// other. Never touches the active-theme choice (that stays client-only in
// localStorage, see ThemeModeToggle.tsx) and never introduces any
// authentication/account mechanism.

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { CustomTheme } from "@/lib/mikrosTheme";
import {
  addTheme,
  editTheme,
  deleteTheme,
  importLegacyThemes,
  parseCustomThemePresetsDocument,
  serializeCustomThemePresetsDocument,
  emptyCustomThemePresetsDocument,
  CUSTOM_THEME_PRESETS_SETTINGS_KEY,
  type CustomThemePresetsDocument,
  type SaveThemeInput,
  type ImportLegacyResult,
} from "@/lib/mikrosThemePresets";

export interface CustomThemePresetsReadResult {
  document: CustomThemePresetsDocument;
  /** True when the stored row exists but failed validation — the UI must show this explicitly, never pretend the list is simply empty. */
  corrupted: boolean;
  error?: string;
}

export async function getCustomThemePresetsAction(): Promise<CustomThemePresetsReadResult> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CUSTOM_THEME_PRESETS_SETTINGS_KEY),
  });
  const parsed = parseCustomThemePresetsDocument(row?.value ?? null);
  if (!parsed.ok) {
    return { document: emptyCustomThemePresetsDocument(), corrupted: true, error: parsed.error };
  }
  return { document: parsed.document, corrupted: false };
}

export type ThemePresetMutationResult =
  | { ok: true; document: CustomThemePresetsDocument }
  | { ok: false; error: string; conflict?: true; document?: CustomThemePresetsDocument };

export async function mutateCustomThemePresets(
  op: { type: "add"; theme: SaveThemeInput } | { type: "edit"; theme: SaveThemeInput } | { type: "delete"; id: string },
  expectedRevision: number
): Promise<ThemePresetMutationResult> {
  try {
    const now = new Date().toISOString();
    const result = db.transaction((tx) => {
      const row = tx
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, CUSTOM_THEME_PRESETS_SETTINGS_KEY))
        .get();
      const parsed = parseCustomThemePresetsDocument(row?.value ?? null);

      if (!parsed.ok) {
        return {
          ok: false as const,
          error: "Stored Custom Appearance presets are corrupted and cannot be modified. Contact support before retrying.",
        };
      }
      const current = parsed.document;

      if (current.revision !== expectedRevision) {
        return {
          ok: false as const,
          error: "This preset list changed elsewhere. Reload to see the latest version.",
          conflict: true as const,
          document: current,
        };
      }

      const nextRevision = current.revision + 1;
      const mutation =
        op.type === "add"
          ? addTheme(current.themes, op.theme, nextRevision)
          : op.type === "edit"
            ? editTheme(current.themes, op.theme, nextRevision)
            : deleteTheme(current.themes, op.id);

      if (!mutation.ok) {
        return { ok: false as const, error: mutation.error };
      }

      const next: CustomThemePresetsDocument = { version: 1, revision: nextRevision, themes: mutation.themes };
      const value = serializeCustomThemePresetsDocument(next);
      tx.insert(appSettings)
        .values({ key: CUSTOM_THEME_PRESETS_SETTINGS_KEY, value, updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
        .run();

      return { ok: true as const, document: next };
    });
    return result;
  } catch {
    return { ok: false, error: "Failed to save this Custom Appearance preset. Please try again." };
  }
}

export type ImportLegacyThemePresetsResult =
  | { ok: true; document: CustomThemePresetsDocument; imported: string[]; skipped: ImportLegacyResult["skipped"] }
  | { ok: false; error: string; conflict?: true; document?: CustomThemePresetsDocument };

/**
 * One-time (idempotent) migration of themes that only ever existed in a
 * browser's localStorage into the durable server document. Never overwrites
 * a server theme sharing the candidate's id or name; the caller (client)
 * decides which local themes are "extra" by diffing against the last known
 * server document before calling this.
 */
export async function importLegacyCustomThemePresets(
  legacyCandidates: CustomTheme[],
  expectedRevision: number
): Promise<ImportLegacyThemePresetsResult> {
  try {
    const now = new Date().toISOString();
    const result = db.transaction((tx) => {
      const row = tx
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, CUSTOM_THEME_PRESETS_SETTINGS_KEY))
        .get();
      const parsed = parseCustomThemePresetsDocument(row?.value ?? null);

      if (!parsed.ok) {
        return {
          ok: false as const,
          error: "Stored Custom Appearance presets are corrupted and cannot be modified. Contact support before retrying.",
        };
      }
      const current = parsed.document;

      if (current.revision !== expectedRevision) {
        return {
          ok: false as const,
          error: "This preset list changed elsewhere. Reload to see the latest version.",
          conflict: true as const,
          document: current,
        };
      }

      const nextRevision = current.revision + 1;
      const merge = importLegacyThemes(current.themes, legacyCandidates, nextRevision);

      if (merge.importedIds.length === 0) {
        // Nothing to write — return the unchanged document at its current
        // revision so the caller doesn't bump revision for a no-op.
        return { ok: true as const, document: current, imported: [], skipped: merge.skipped };
      }

      const next: CustomThemePresetsDocument = { version: 1, revision: nextRevision, themes: merge.themes };
      const value = serializeCustomThemePresetsDocument(next);
      tx.insert(appSettings)
        .values({ key: CUSTOM_THEME_PRESETS_SETTINGS_KEY, value, updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
        .run();

      return { ok: true as const, document: next, imported: merge.importedIds, skipped: merge.skipped };
    });
    return result;
  } catch {
    return { ok: false, error: "Failed to import legacy Custom Appearance presets. Please try again." };
  }
}
