import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { inArray } from "drizzle-orm";

export type WorkflowDefaults = {
  assetImageId: number | null;
  shotImageId: number | null;
  shotVideoId: number | null;
};

const DEFAULT_KEYS = [
  "default_workflow_asset_image",
  "default_workflow_shot_image",
  "default_workflow_shot_video",
] as const;

function parseWorkflowDefaultId(value: string | undefined | null): number | null {
  if (!value || !value.trim()) return null;
  const n = parseInt(value, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

export async function getWorkflowDefaults(): Promise<WorkflowDefaults> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [...DEFAULT_KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    assetImageId: parseWorkflowDefaultId(map.get("default_workflow_asset_image")),
    shotImageId: parseWorkflowDefaultId(map.get("default_workflow_shot_image")),
    shotVideoId: parseWorkflowDefaultId(map.get("default_workflow_shot_video")),
  };
}
