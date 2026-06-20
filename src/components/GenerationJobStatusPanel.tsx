"use client";

import { useState, useEffect, useCallback } from "react";

type JobStatus =
  | "pending"
  | "uploading"
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "timeout";

type JobData = {
  id: number;
  status: JobStatus;
  promptId: string | null;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type Props = {
  jobId: number;
};

const TERMINAL_STATUSES: JobStatus[] = ["done", "failed", "timeout"];

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  uploading: "Uploading references",
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  timeout: "Timed out",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "text-[#6e767d]",
  uploading: "text-[#6e767d]",
  queued: "text-[#a4abb2]",
  running: "text-[#5b93d6]",
  done: "text-[#6b9e72]",
  failed: "text-[#cf7b6b]",
  timeout: "text-[#cf7b6b]",
};

function getOutputExt(outputPath: string): string {
  return outputPath.split(".").pop()?.toLowerCase() ?? "";
}

function isImagePath(outputPath: string): boolean {
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(getOutputExt(outputPath));
}

function isVideoPath(outputPath: string): boolean {
  return ["mp4", "webm", "mov"].includes(getOutputExt(outputPath));
}

export default function GenerationJobStatusPanel({ jobId }: Props) {
  const [job, setJob] = useState<JobData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = (await response.json()) as
        | { ok: true; job: JobData }
        | { ok: false; error: string };

      if (!data.ok) {
        setFetchError(data.error);
        return null;
      }

      setFetchError(null);
      setJob(data.job);
      return data.job.status as JobStatus;
    } catch {
      setFetchError("Could not reach the job status endpoint.");
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    async function tick() {
      const status = await poll();
      if (stopped) return;
      if (status && TERMINAL_STATUSES.includes(status)) {
        if (intervalId !== null) clearInterval(intervalId);
      }
    }

    // Immediate call
    tick();

    intervalId = setInterval(() => {
      tick();
    }, 2000);

    return () => {
      stopped = true;
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [poll]);

  const isTerminal = job ? TERMINAL_STATUSES.includes(job.status) : false;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
              Job
            </span>
            <span className="text-xs font-mono text-[#4b5158]">#{jobId}</span>
          </div>
          {job && (
            <p className={`text-sm font-medium ${STATUS_COLORS[job.status]}`}>
              {STATUS_LABELS[job.status]}
            </p>
          )}
          {!job && !fetchError && (
            <p className="text-sm text-[#6e767d]">Loading…</p>
          )}
        </div>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <p className="text-xs text-[#cf7b6b]">{fetchError}</p>
      )}

      {job && (
        <>
          {/* Polling indicator */}
          {!isTerminal && (
            <p className="text-xs text-[#4b5158]">
              Checking job status every 2 seconds…
            </p>
          )}

          {/* Prompt ID */}
          {job.promptId && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                Prompt ID
              </p>
              <p className="text-xs font-mono text-[#a4abb2] break-all">
                {job.promptId}
              </p>
            </div>
          )}

          {/* Error message */}
          {job.errorMessage && (
            <div className="rounded border border-[#3a2020] bg-[#1a0e0e] px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d] mb-1">
                Error
              </p>
              <p className="text-xs text-[#cf7b6b] leading-relaxed">
                {job.errorMessage}
              </p>
            </div>
          )}

          {/* Output */}
          {job.status === "done" && job.outputPath && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#6e767d]">
                Output
              </p>
              {isImagePath(job.outputPath) ? (
                <img
                  src={`/${job.outputPath}`}
                  alt="Generation output"
                  className="max-w-full rounded border border-[#2c3035]"
                />
              ) : isVideoPath(job.outputPath) ? (
                <video
                  src={`/${job.outputPath}`}
                  controls
                  className="max-w-full rounded border border-[#2c3035]"
                />
              ) : (
                <a
                  href={`/${job.outputPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
                >
                  Open output ↗
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
