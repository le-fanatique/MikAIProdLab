#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Repeat the vitest suite N times and watch for pass/fail count drift
// (REPO.VITEST.WORKERS.1).
//
// `vitest.config.mts:23` used to cap `maxWorkers` at 4 after 716fc55
// (2026-08-18) observed the suite failing unpredictably at higher
// concurrency — both as thrown errors and as raw pass/fail count drift
// across identical runs on a clean tree. This script is the tool that makes
// that signal measurable again: it is not enough for N runs to exit 0, a run
// whose totals differ from the previous run is exactly the anomaly the
// 2026-08-18 comment describes, even if every individual test in it "passed".
//
// Node built-ins only (node:child_process, node:fs) — no new dependency.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

// Anomaly evidence (full stdout/stderr of a faulty run) is written here —
// under /data/, already git-ignored wholesale, same convention as
// data/backups/ from scripts/data-backup.mjs. Never committed, never read by
// the app.
export const ANOMALY_DIR = path.join(repoRoot, "data", "test-repeat-anomalies");

/**
 * Runs `npx vitest run` once with the JSON reporter and returns the parsed
 * totals plus the raw stdout/stderr for anomaly reporting.
 *
 * @param {(cmd: string, args: string[], opts: object) => {status:number|null,stdout:string,stderr:string,error?:Error}} run
 */
export function runOnce(run = defaultRun) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mikai-test-repeat-"));
  const outputFile = path.join(tmpDir, "vitest-report.json");
  try {
    const result = run("npx", ["vitest", "run", "--reporter=json", `--outputFile=${outputFile}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    if (result.error) {
      return {
        ok: false,
        signature: `vitest failed to start: ${result.error.message}`,
        rawOutput: `${result.stdout || ""}\n${result.stderr || ""}`,
      };
    }

    let report = null;
    if (existsSync(outputFile)) {
      try {
        report = JSON.parse(readFileSync(outputFile, "utf8"));
      } catch (err) {
        return {
          ok: false,
          signature: `vitest JSON report could not be parsed: ${err.message}`,
          rawOutput: `${result.stdout || ""}\n${result.stderr || ""}`,
        };
      }
    }

    if (!report) {
      return {
        ok: false,
        signature: `vitest exited with status ${result.status} and produced no JSON report`,
        rawOutput: `${result.stdout || ""}\n${result.stderr || ""}`,
      };
    }

    const testResults = Array.isArray(report.testResults) ? report.testResults : [];
    const filesTotal = testResults.length;
    const filesPassed = testResults.filter((f) => f.status === "passed").length;
    const filesFailed = filesTotal - filesPassed;

    return {
      ok: true,
      exitStatus: result.status,
      counts: {
        filesTotal,
        filesPassed,
        filesFailed,
        testsTotal: report.numTotalTests ?? 0,
        testsPassed: report.numPassedTests ?? 0,
        testsFailed: report.numFailedTests ?? 0,
      },
      rawOutput: `${result.stdout || ""}\n${result.stderr || ""}`,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Injectable process runner, same shape and Windows shell rule as
 * scripts/mikai-deploy.mjs's defaultRun: shell:true only for npm/npx on
 * Windows, to resolve their .cmd shims.
 */
export function defaultRun(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32" && cmd !== "git",
    ...opts,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error,
  };
}

function formatCounts(counts) {
  return `${counts.filesPassed}/${counts.filesTotal} files, ${counts.testsPassed}/${counts.testsTotal} tests`;
}

function countsEqual(a, b) {
  return (
    a.filesTotal === b.filesTotal &&
    a.filesPassed === b.filesPassed &&
    a.filesFailed === b.filesFailed &&
    a.testsTotal === b.testsTotal &&
    a.testsPassed === b.testsPassed &&
    a.testsFailed === b.testsFailed
  );
}

/**
 * Runs the suite `n` times, comparing each run's totals to the previous run.
 * Any variation in totals is an anomaly, exactly like a thrown error — this
 * is the "raw pass/fail count drift" the 2026-08-18 cap's comment describes.
 *
 * @param {{ n?: number, run?: typeof defaultRun, log?: (msg: string) => void }} opts
 */
export function repeatSuite({ n = 30, run = defaultRun, log = console.log } = {}) {
  const runs = [];
  let previousCounts = null;
  let anomalyCount = 0;

  for (let i = 1; i <= n; i++) {
    const result = runOnce(run);

    if (!result.ok) {
      anomalyCount++;
      const signature = result.signature;
      log(`[test-repeat] run ${i}/${n}: ANOMALY — ${signature}`);
      writeAnomalyEvidence(i, signature, result.rawOutput);
      runs.push({ index: i, ok: false, signature });
      continue;
    }

    const isFirstRun = previousCounts === null;
    const driftedFromPrevious = !isFirstRun && !countsEqual(result.counts, previousCounts);
    const hasFailures = result.counts.filesFailed > 0 || result.counts.testsFailed > 0;
    const isAnomaly = driftedFromPrevious || hasFailures || result.exitStatus !== 0;

    if (isAnomaly) {
      anomalyCount++;
      const signature = driftedFromPrevious
        ? `pass/fail count drift — previous run: ${formatCounts(previousCounts)}; this run: ${formatCounts(result.counts)}`
        : `run failed — ${formatCounts(result.counts)}, exit status ${result.exitStatus}`;
      log(`[test-repeat] run ${i}/${n}: ANOMALY — ${signature}`);
      writeAnomalyEvidence(i, signature, result.rawOutput);
      runs.push({ index: i, ok: false, signature, counts: result.counts });
    } else {
      log(`[test-repeat] run ${i}/${n}: green — ${formatCounts(result.counts)}`);
      runs.push({ index: i, ok: true, counts: result.counts });
    }

    previousCounts = result.counts;
  }

  const greenCount = n - anomalyCount;
  log(`[test-repeat] ${greenCount} vert(s) / ${anomalyCount} anomalie(s) sur ${n} passage(s)`);

  return { runs, greenCount, anomalyCount };
}

function writeAnomalyEvidence(runIndex, signature, rawOutput) {
  mkdirSync(ANOMALY_DIR, { recursive: true });
  const file = path.join(ANOMALY_DIR, `run-${runIndex}-${Date.now()}.log`);
  writeFileSync(file, `${signature}\n\n${rawOutput}\n`, "utf8");
  console.log(`[test-repeat]   full output kept at ${file}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function isMainModule() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const arg = process.argv[2];
  const n = arg ? Number.parseInt(arg, 10) : 30;
  if (!Number.isInteger(n) || n < 1) {
    console.error(`[test-repeat] invalid run count: ${arg}`);
    process.exit(1);
  }
  const { anomalyCount } = repeatSuite({ n });
  process.exit(anomalyCount > 0 ? 1 : 0);
}
