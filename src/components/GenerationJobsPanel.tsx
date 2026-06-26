import Link from "next/link";
import WorkflowKindBadge from "@/components/WorkflowKindBadge";
import EmptyState from "@/components/EmptyState";
import { retryGenerationJob, deleteGenerationJob } from "@/actions/generationJobs";
import { generatedOutputUrl } from "@/lib/getOutputUrl";

export type GenerationJobItem = {
  id: number;
  status: string;
  workflowId: number;
  outputPath: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workflowName: string | null;
  workflowKind: "image" | "video" | string | null;
};

type Props = {
  projectId: number;
  sequenceId: number;
  shotId: number;
  jobs: GenerationJobItem[];
  retryError?: string | null;
  deleteError?: string | null;
  deleteSuccess?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  uploading: "Uploading references",
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  timeout: "Timed out",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusClass(status: string): string {
  if (status === "done") return "text-[#6b9e72]";
  if (status === "failed" || status === "timeout") return "text-[#cf7b6b]";
  if (status === "running") return "text-[#5b93d6]";
  if (status === "queued" || status === "uploading") return "text-[#a4abb2]";
  return "text-[#6e767d]";
}

function isTerminalErrorStatus(status: string): boolean {
  return status === "failed" || status === "timeout";
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

function getExt(p: string): string {
  return p.split(".").pop()?.toLowerCase() ?? "";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  if (isNaN(ms) || ms < 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

export default function GenerationJobsPanel({
  projectId,
  sequenceId,
  shotId,
  jobs,
  retryError,
  deleteError,
  deleteSuccess,
}: Props) {
  const shotPath = `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Feedback messages */}
      {retryError && (
        <p className="text-xs text-[#cf7b6b]">{retryError}</p>
      )}
      {deleteError && (
        <p className="text-xs text-[#cf7b6b]">{deleteError}</p>
      )}
      {deleteSuccess && (
        <p className="text-xs text-[#6b9e72]">Job deleted.</p>
      )}

      {/* Refresh link */}
      <div className="flex justify-end">
        <Link
          href={shotPath}
          className="text-xs text-[#6e767d] hover:text-[#a4abb2] transition-colors"
        >
          Refresh ↻
        </Link>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No generation jobs yet."
          description="Run a workflow generation to see job history here."
        />
      ) : (
        <div className="flex flex-col divide-y divide-[#1c1f22]">
          {jobs.map((job) => {
            const ext = job.outputPath ? getExt(job.outputPath) : "";
            const isImage = job.outputPath && IMAGE_EXTS.has(ext);
            const isVideo = job.outputPath && VIDEO_EXTS.has(ext);
            const src = job.outputPath ? (generatedOutputUrl(job.outputPath) ?? null) : null;
            const duration = formatDuration(job.startedAt, job.completedAt);
            const wfKind =
              job.workflowKind === "image" || job.workflowKind === "video"
                ? job.workflowKind
                : null;
            const statusMapHref = `/projects/${projectId}/sequences/${sequenceId}/shots/${shotId}/workflows/${job.workflowId}/map?jobId=${job.id}`;

            return (
              <div key={job.id} className="py-3 flex flex-col gap-2">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    {/* Job id + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-[#4b5158]">
                        #{job.id}
                      </span>
                      <span className={`text-xs font-medium ${statusClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                      {wfKind && <WorkflowKindBadge kind={wfKind} />}
                    </div>
                    {/* Workflow name */}
                    <p className="text-xs text-[#a4abb2] truncate">
                      {job.workflowName ?? "Unknown workflow"}
                    </p>
                    {/* Dates + duration */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-[#4b5158]">
                        {formatDate(job.createdAt)}
                      </span>
                      {duration && (
                        <span className="text-[10px] text-[#4b5158]">
                          · {duration}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Open Status link + Retry + Delete */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <Link
                      href={statusMapHref}
                      className="text-[10px] text-[#5b93d6] hover:text-[#8fbbe8] transition-colors whitespace-nowrap"
                    >
                      Open Status ↗
                    </Link>

                    {(job.status === "failed" || job.status === "timeout") &&
                      Number.isFinite(projectId) &&
                      Number.isFinite(sequenceId) &&
                      Number.isFinite(shotId) &&
                      Number.isFinite(job.id) && (
                      <form action={retryGenerationJob}>
                        <input type="hidden" name="projectId" value={String(projectId)} />
                        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                        <input type="hidden" name="shotId" value={String(shotId)} />
                        <input type="hidden" name="jobId" value={String(job.id)} />
                        <input type="hidden" name="returnTo" value={shotPath} />
                        <button
                          type="submit"
                          className="text-[10px] text-[#a4abb2] hover:text-[#e7e9ec] transition-colors whitespace-nowrap"
                        >
                          Retry ↺
                        </button>
                      </form>
                    )}

                    {Number.isFinite(projectId) &&
                      Number.isFinite(sequenceId) &&
                      Number.isFinite(shotId) &&
                      Number.isFinite(job.id) && (
                      <form action={deleteGenerationJob}>
                        <input type="hidden" name="projectId" value={String(projectId)} />
                        <input type="hidden" name="sequenceId" value={String(sequenceId)} />
                        <input type="hidden" name="shotId" value={String(shotId)} />
                        <input type="hidden" name="jobId" value={String(job.id)} />
                        <input type="hidden" name="returnTo" value={shotPath} />
                        <button
                          type="submit"
                          className="text-[10px] text-[#4b5158] hover:text-[#cf7b6b] transition-colors whitespace-nowrap"
                        >
                          Delete ✕
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Error or warning message */}
                {job.errorMessage && isTerminalErrorStatus(job.status) && (
                  <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-2.5 py-1.5">
                    <p className="text-[10px] font-medium text-[#cf7b6b] mb-0.5">Error</p>
                    <p className="text-[10px] text-[#cf7b6b] leading-relaxed">
                      {job.errorMessage}
                    </p>
                  </div>
                )}
                {job.errorMessage && !isTerminalErrorStatus(job.status) && (
                  <div className="rounded border border-[#3a2c1a] bg-[#1a150a] px-2.5 py-1.5">
                    <p className="text-[10px] font-medium text-[#b89a5a] mb-0.5">ComfyUI warning</p>
                    <p className="text-[10px] text-[#b89a5a] leading-relaxed">
                      {job.errorMessage}
                    </p>
                  </div>
                )}

                {/* Output */}
                {src && (
                  <div className="flex items-center gap-2">
                    {isImage ? (
                      <img
                        src={src}
                        alt="Output"
                        className="h-12 w-auto rounded border border-[#2c3035] object-cover"
                      />
                    ) : isVideo ? (
                      <video
                        src={src}
                        muted
                        controls
                        className="h-12 w-auto rounded border border-[#2c3035]"
                      />
                    ) : null}
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                    >
                      Open output ↗
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {jobs.some((j) => j.status === "failed" || j.status === "timeout") && (
        <p className="text-[10px] text-[#4b5158] pt-1">
          Retry uses the current shot and workflow state.
        </p>
      )}
      {jobs.length > 0 && (
        <p className="text-[10px] text-[#4b5158]">
          Deleting a job removes its generated output file. Attached shot references are not affected.
        </p>
      )}
    </div>
  );
}
