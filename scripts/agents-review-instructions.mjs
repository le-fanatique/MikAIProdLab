#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Codex review pre-flight + instructions (SUPERVISION.LOOP.1)
//
// V1 deliberately does NOT call a Codex CLI — no such integration has been
// tested against this repo yet (see docs/SUPERVISION_LOOP_1_FILE_BASED_
// CODEX_REVIEW.md). This script only checks that the two required review
// inputs exist and are non-empty, reports the current git diff surface,
// and prints the exact instructions to hand to Codex (CLI or VS Code
// extension) yourself. Never crashes — missing inputs are reported, not
// thrown.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const agentsDir = path.join(repoRoot, ".agents");

const currentTaskPath = path.join(agentsDir, "current_task.md");
const claudeReportPath = path.join(agentsDir, "claude_report.md");

function isPresentAndNonEmpty(filePath) {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, "utf-8").trim().length > 0;
}

const taskPresent = isPresentAndNonEmpty(currentTaskPath);
const reportPresent = isPresentAndNonEmpty(claudeReportPath);

console.log("[ai:review] Checking .agents/ review inputs...\n");
console.log(`  .agents/current_task.md   : ${taskPresent ? "present" : "MISSING"}`);
console.log(`  .agents/claude_report.md  : ${reportPresent ? "present" : "MISSING"}`);

if (!taskPresent || !reportPresent) {
  console.log("");
  console.log("[ai:review] Missing required input(s). Run `npm run ai:init` first, then:");
  if (!taskPresent) console.log("  - fill in .agents/current_task.md with this ticket's scope;");
  if (!reportPresent) console.log("  - have Claude finish the ticket and write .agents/claude_report.md.");
  console.log("");
  console.log("[ai:review] Codex's own correct verdict in this state is NEEDS_USER — this is expected, not a bug.");
  process.exit(0);
}

/**
 * Runs a git command and NEVER treats a failure as "clean"/"empty" output.
 * A `spawnSync` transport failure (`result.error`, e.g. EPERM, ENOENT) or a
 * non-zero exit code is reported explicitly and marks the whole review run
 * as failed — REVISE fix for Codex's finding that this script previously
 * printed "(clean)"/"(empty)" even when the underlying git call errored,
 * which made the review gate lie about there being nothing to review.
 */
function runGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf-8" });
  if (result.error) {
    return { ok: false, output: "", errorText: `spawnSync error: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    return {
      ok: false,
      output: "",
      errorText: `git ${args.join(" ")} exited with status ${result.status}${stderr ? `\n${stderr}` : ""}${!stderr && stdout ? `\n${stdout}` : ""}`,
    };
  }
  return { ok: true, output: (result.stdout ?? "").trim(), errorText: "" };
}

function printSection(title, result) {
  console.log(`  ${title}:`);
  if (!result.ok) {
    console.log(`    Git command failed: ${result.errorText}`);
    return;
  }
  console.log(result.output ? result.output.split("\n").map((l) => `    ${l}`).join("\n") : "    (none)");
}

const statusResult = runGit(["status", "--short"]);
const diffResult = runGit(["diff"]); // unstaged
const diffStagedResult = runGit(["diff", "--cached"]); // staged — REVISE fix: was missing entirely
const diffStagedStatResult = runGit(["diff", "--cached", "--stat"]);

console.log("");
printSection("git status --short", statusResult);
console.log("");
printSection("git diff --cached --stat (staged)", diffStagedStatResult);
console.log("");
printSection("git diff --cached (staged, full)", diffStagedResult);
console.log("");
printSection("git diff (unstaged)", diffResult);

const anyGitFailed = !statusResult.ok || !diffResult.ok || !diffStagedResult.ok || !diffStagedStatResult.ok;
if (anyGitFailed) {
  console.log("");
  console.log("[ai:review] One or more git commands failed — see \"Git command failed\" above.");
  console.log("[ai:review] Not printing a review prompt: the review surface could not be reliably determined.");
  process.exit(1);
}

const hasStatus = statusResult.output.length > 0;
const hasStagedDiff = diffStagedResult.output.length > 0;
const hasUnstagedDiff = diffResult.output.length > 0;

if (!hasStatus && !hasStagedDiff && !hasUnstagedDiff) {
  console.log("");
  console.log("[ai:review] No changes detected (clean status, empty staged and unstaged diff). Nothing for Codex to review yet.");
  console.log("[ai:review] Codex's own correct verdict in this state is NEEDS_USER — this is expected, not a bug.");
  process.exit(0);
}

console.log("");
console.log("=".repeat(78));
console.log("[ai:review] Ready for review. Paste the following into Codex (CLI or VS Code extension):");
console.log("=".repeat(78));
console.log(`
Read .agents/current_task.md and .agents/claude_report.md in this repo.

Review the review surface below — do not assume it's only one of these:
  - git status (what's staged/unstaged/untracked)
  - git diff --cached (the STAGED patch — this is what would actually be
    committed if a commit happened right now)
  - git diff (the UNSTAGED patch, if any — not yet staged, won't be
    committed as-is)

Write your findings to .agents/codex_review.md and your machine-readable
verdict to .agents/codex_verdict.json, using the exact schema in
.agents/templates/codex_verdict.json (verdict must be one of APPROVED,
REVISE, or NEEDS_USER; safeToCommit may only be true when verdict is
APPROVED).
`);
console.log("=".repeat(78));
console.log("[ai:review] No Codex CLI integration is wired up yet — this script only prepared the above.");
console.log("[ai:review] Run it yourself in Codex, then check .agents/codex_verdict.json.");
