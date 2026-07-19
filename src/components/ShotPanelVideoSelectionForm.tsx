"use client";

// ---------------------------------------------------------------------------
// ShotPanelVideoSelectionForm.tsx — SHOT.VIDEO.LIBRARY.1, Lot C
//
// Per-node video picker for a ComfyUI workflow's video input(s), mirroring
// `ShotPanelImagePreviewForm.tsx`'s exact instant-navigation pattern (select
// a video -> immediately `router.replace` with `videoNode_<id>` reflected in
// the URL, kept in sync with "Update Preview" the same way image selections
// already are) — deliberately simpler (no shot/asset source grouping, no
// upload affordance: a Shot Video is either already in the library or it
// isn't). As of this ticket no real ComfyUI workflow has a video input node
// (see claude_report.md's audit), so `nodes` is empty and this component
// renders nothing on every real workflow today; it exists so a future real
// video-input node is immediately usable without further wiring.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ShotPanelVideoOption = {
  id: string;
  label: string;
  source: "generation" | "sequence_split";
  durationSeconds: number | null;
  isApproved: boolean;
};

export type ShotPanelVideoNode = {
  nodeId: string;
  displayLabel: string;
  initialValue: string;
  videos: ShotPanelVideoOption[];
};

type Props = {
  nodes: ShotPanelVideoNode[];
  passthroughParams: Record<string, string>;
  basePath: string;
};

function optionLabel(v: ShotPanelVideoOption): string {
  const provenance = v.source === "sequence_split" ? "Split" : "Generation";
  const duration = v.durationSeconds !== null ? ` · ${v.durationSeconds.toFixed(2)}s` : "";
  const approved = v.isApproved ? " · Approved" : "";
  return `${v.label} · ${provenance}${duration}${approved}`;
}

export default function ShotPanelVideoSelectionForm({ nodes, passthroughParams, basePath }: Props) {
  const router = useRouter();

  const [selectedByNode, setSelectedByNode] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const node of nodes) init[node.nodeId] = node.initialValue;
    return init;
  });

  if (nodes.length === 0) return null;

  function handleSelect(nodeId: string, videoId: string) {
    const newSelected = { ...selectedByNode, [nodeId]: videoId };
    setSelectedByNode(newSelected);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(passthroughParams)) {
      if (!k.startsWith("videoNode_") && k !== "jobId") params.set(k, v);
    }
    for (const [nid, id] of Object.entries(newSelected)) {
      if (id) params.set(`videoNode_${nid}`, id);
    }
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3">
      {nodes.map((node) => {
        const currentValue = selectedByNode[node.nodeId] ?? "";
        return (
          <div key={node.nodeId} className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4b5158]">{node.displayLabel}</label>
            <select
              value={currentValue}
              onChange={(e) => handleSelect(node.nodeId, e.target.value)}
              className="bg-[#0d0e10] border border-[#2c3035] rounded px-2 py-1 text-xs text-[#e7e9ec]"
            >
              <option value="">— none —</option>
              {node.videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {optionLabel(v)}
                </option>
              ))}
            </select>
            {node.videos.length === 0 && <p className="text-[10px] text-[#6e767d]">No Shot Videos available for this Shot.</p>}
          </div>
        );
      })}
    </div>
  );
}
