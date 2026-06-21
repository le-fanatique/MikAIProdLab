import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import { attachOutputAsShotReference } from "@/actions/generation";

export type GeneratedOutputItem = {
  id: number;
  outputPath: string;
  completedAt: string | null;
  createdAt: string;
  workflowName: string | null;
  workflowKind: "image" | "video" | string | null;
};

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  outputs: GeneratedOutputItem[];
  attachError?: string | null;
  attachedReference?: boolean;
};

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

function getExt(outputPath: string): string {
  return outputPath.split(".").pop()?.toLowerCase() ?? "";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function GeneratedOutputsPanel({
  projectId,
  sequenceId,
  shotId,
  outputs,
  attachError,
  attachedReference,
}: Props) {
  const returnTo =
    Number.isFinite(projectId) && Number.isFinite(sequenceId) && Number.isFinite(shotId)
      ? `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`
      : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Feedback messages */}
      {attachedReference && (
        <p className="text-xs text-[#6b9e72]">
          Output attached as a reference image.
        </p>
      )}
      {attachError && (
        <p className="text-xs text-[#cf7b6b]">{attachError}</p>
      )}

      {/* Empty state */}
      {outputs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2c3035] px-6 py-10 text-center">
          <p className="text-[#a4abb2] text-sm font-medium mb-1">
            No generated outputs yet.
          </p>
          <p className="text-[#6e767d] text-xs mt-1">
            Generate a workflow output to see it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outputs.map((item) => {
            const ext = getExt(item.outputPath);
            const isImage = IMAGE_EXTS.has(ext);
            const isVideo = VIDEO_EXTS.has(ext);
            const src = `/${item.outputPath}`;
            const displayDate = formatDate(item.completedAt ?? item.createdAt);
            const wfName = item.workflowName ?? "Unknown workflow";

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded border border-[#2c3035] bg-[#0d0e10] p-2"
              >
                {/* Preview */}
                <div className="w-full aspect-video bg-[#141618] rounded overflow-hidden flex items-center justify-center">
                  {isImage ? (
                    <img
                      src={src}
                      alt={wfName}
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo ? (
                    <video
                      src={src}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <p className="text-xs text-[#4b5158] font-mono">
                      .{ext || "bin"}
                    </p>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.workflowKind && (
                      <WorkflowKindBadge
                        kind={
                          item.workflowKind === "image" ||
                          item.workflowKind === "video"
                            ? item.workflowKind
                            : "image"
                        }
                      />
                    )}
                    <span className="text-xs text-[#a4abb2] truncate leading-tight">
                      {wfName}
                    </span>
                  </div>
                  {displayDate && (
                    <p className="text-[10px] text-[#4b5158]">{displayDate}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="px-1 pb-0.5 flex items-center gap-3 flex-wrap">
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                  >
                    Open ↗
                  </a>

                  {isImage &&
                    Number.isFinite(projectId) &&
                    Number.isFinite(sequenceId) &&
                    Number.isFinite(shotId) &&
                    Number.isFinite(item.id) && (
                    <form action={attachOutputAsShotReference}>
                      <input type="hidden" name="projectId" value={String(projectId)} />
                      <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                      <input type="hidden" name="shotId" value={String(shotId)} />
                      <input type="hidden" name="jobId" value={String(item.id)} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
                      >
                        Attach as Reference
                      </button>
                    </form>
                  )}

                  {isVideo && (
                    <span className="text-[10px] text-[#3a4046]">
                      Video — cannot attach as reference
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
