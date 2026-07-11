#!/usr/bin/env node
// ---------------------------------------------------------------------------
// .agents/ scaffolding (SUPERVISION.LOOP.1)
//
// Copies .agents/templates/* into the live .agents/*.md / *.json working
// files, if and only if the live file doesn't already exist — never
// silently overwrites in-progress work. Pass --force to overwrite anyway;
// the existing file is backed up first (never deleted outright).
//
// Node built-ins only (fs/path), no new dependency.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readdirSync, copyFileSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const agentsDir = path.join(repoRoot, ".agents");
const templatesDir = path.join(agentsDir, "templates");

const force = process.argv.includes("--force");

if (!existsSync(templatesDir)) {
  console.error(`[ai:init] Templates directory not found: ${templatesDir}`);
  console.error("[ai:init] This repo's .agents/templates/ should already be committed — check your checkout.");
  process.exit(1);
}

if (!existsSync(agentsDir)) {
  mkdirSync(agentsDir, { recursive: true });
}

const templateFiles = readdirSync(templatesDir).filter((f) => !f.startsWith("."));

let created = 0;
let skipped = 0;
let backedUp = 0;

for (const file of templateFiles) {
  const src = path.join(templatesDir, file);
  const dest = path.join(agentsDir, file);

  if (existsSync(dest) && !force) {
    console.log(`[ai:init] Skipped ${file} (already exists — pass --force to overwrite).`);
    skipped++;
    continue;
  }

  if (existsSync(dest) && force) {
    const backupPath = `${dest}.bak-${Date.now()}`;
    renameSync(dest, backupPath);
    console.log(`[ai:init] Backed up existing ${file} -> ${path.basename(backupPath)}`);
    backedUp++;
  }

  copyFileSync(src, dest);
  console.log(`[ai:init] Created .agents/${file}`);
  created++;
}

console.log("");
console.log(`[ai:init] Done. ${created} created, ${skipped} skipped, ${backedUp} backed up.`);
console.log("");
console.log("[ai:init] Next steps:");
console.log("  1. Fill in .agents/current_task.md with this ticket's scope.");
console.log("  2. Implement the ticket, then write .agents/claude_report.md.");
console.log("  3. Run `npm run ai:review` for the Codex review instructions.");
