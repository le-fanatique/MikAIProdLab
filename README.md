# MikAI Production Lab

A local AI production preparation tool for structuring film and animation projects around story, universe, time, and image.

## Stack

- **Next.js 16** (App Router) — TypeScript
- **Tailwind CSS v4**
- **SQLite** via `better-sqlite3` + **Drizzle ORM**
- **LLM providers**: Ollama (local), OpenRouter, OpenAI-compatible / vLLM
- **ComfyUI** integration for image and video generation
- Local-first, no cloud dependency

## Requirements

- **Node.js 22 LTS** — required. Node 24 is not supported yet (`better-sqlite3` native bindings not available).
- npm 10+
- [NVM for Windows](https://github.com/coreybutler/nvm-windows) recommended for managing Node versions

## Quick Start — Windows

```powershell
git clone https://github.com/le-fanatique/MikAIProdLab.git C:\AI\MikAIProdLab
cd C:\AI\MikAIProdLab

# Install Node 22 LTS (skip if already on 22)
nvm install 22
nvm use 22

# Install dependencies (reproducible install from lock file)
npm.cmd ci

# Apply database migrations (creates tables in data/mikailab.db)
npm.cmd run db:migrate

# Start dev server (localhost only)
npm.cmd run dev

# Or start with network access (reachable from other devices)
npm.cmd run dev:host
```

Open [http://localhost:3000](http://localhost:3000).

### Alternative launcher (PowerShell script)

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

`start-dev.ps1` auto-detects NVM Windows, verifies Node/npm, and starts the dev server on all interfaces.

> **PowerShell Execution Policy**: If `.ps1` scripts are blocked, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Windows assisted setup

Three PowerShell scripts are available for Windows users. Run them with:

```powershell
# First-time setup after clone (installs deps, migrates DB, creates folders)
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1

# Diagnose the local environment without modifying anything
powershell -ExecutionPolicy Bypass -File .\doctor.ps1

# Start the dev server on all network interfaces
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

Or via npm (Windows only):

```powershell
npm.cmd run setup:windows
npm.cmd run doctor:windows
```

> **Node 22 LTS is required** before running any of these scripts.
> `setup-windows.ps1` will abort with a clear error if the wrong Node version is active.
> `doctor.ps1` is read-only — it never modifies files, installs packages, or runs migrations.

## Quick Start — Linux / Ubuntu

```bash
# Install nvm and Node 22 LTS
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

git clone https://github.com/le-fanatique/MikAIProdLab.git ~/MikAIProdLab
cd ~/MikAIProdLab

# First-time setup (installs deps, migrates DB, creates folders)
chmod +x setup-linux.sh start-dev.sh doctor.sh
./setup-linux.sh

# Start the dev server
./start-dev.sh
```

Open [http://localhost:3000](http://localhost:3000).

Or via npm:

```bash
npm run setup:linux
npm run start:linux
```

> **If better-sqlite3 fails to build** (prebuilt binary not available for your platform):
> ```bash
> sudo apt-get install -y build-essential python3
> npm ci
> ```

## Linux assisted setup

Three shell scripts are available for Linux users:

```bash
# First-time setup after clone (installs deps, migrates DB, creates folders)
./setup-linux.sh

# Diagnose the local environment without modifying anything
./doctor.sh

# Start the dev server on all network interfaces
./start-dev.sh
```

> `doctor.sh` is read-only — it never modifies files, installs packages, or runs migrations.

Make sure scripts are executable after clone:

```bash
chmod +x setup-linux.sh start-dev.sh doctor.sh
```

## WSL Notes

- Clone into `~/MikAIProdLab` (Linux filesystem), **not** `/mnt/c/...` — I/O on the Windows filesystem is much slower.
- The Next.js dev server runs in WSL; the browser on Windows can access `http://localhost:3000` via WSL2 port forwarding.
- If ComfyUI or Ollama run on the **Windows host**, `localhost` from inside WSL does not reach them. Find the Windows host IP:
  ```bash
  cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
  ```
  Then set that IP in the **Settings UI** (ComfyUI URL / Ollama URL).
- On Windows 11 with Docker Desktop installed, `host.docker.internal` may work as the Windows host alias.

## RunPod / Cloud GPU

- Mount a **persistent volume** (e.g. `/workspace`) so data survives pod restarts.
- Expose **port 3000** in the pod configuration (RunPod HTTP ports).
- Start the dev server with `./start-dev.sh` or `npm run dev:host` — both bind to `0.0.0.0:3000`.
- If ComfyUI and Ollama run on the same pod, the default URLs work as-is:
  - ComfyUI: `http://127.0.0.1:8188`
  - Ollama: `http://127.0.0.1:11434`
- Override the DB path to the persistent volume in `.env.local`:
  ```bash
  DB_PATH=/workspace/data/mikailab.db
  ```
- **Without a persistent volume**, all local data (`data/`, `public/uploads/`, `public/outputs/`, `storage/`) is lost when the pod stops.

## Linux Troubleshooting

| Problem | Fix |
|---|---|
| `better-sqlite3` build failed | `sudo apt-get install -y build-essential python3` then re-run `npm ci` |
| `nvm: command not found` | `source ~/.bashrc` (or open a new terminal) |
| `node: command not found` after nvm install | `nvm use 22` then `source ~/.bashrc` |
| ComfyUI or Ollama not reachable from WSL | Use Windows host IP in Settings UI instead of `localhost` |
| Port 3000 blocked | `sudo ufw allow 3000` or check firewall settings |
| Scripts not executable | `chmod +x setup-linux.sh start-dev.sh doctor.sh` |

## Environment configuration

```powershell
cp .env.local.example .env.local
# Edit .env.local if needed — defaults work for a local setup
```

`.env.local` is gitignored and never committed. See `.env.local.example` for all available variables.

Most runtime settings (LLM provider, ComfyUI URL, API keys) can be configured directly from the **Settings** page in the UI — they are stored in the local SQLite database.

## Database

| Command | Description |
|---|---|
| `npm run db:migrate` | Apply pending migrations to the local SQLite database |
| `npm run db:generate` | Generate new SQL migration files after schema changes |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

**Important:**
- `db:migrate` applies existing migrations — run this on every fresh clone.
- `db:generate` creates new migration files after editing `src/db/schema.ts` — do not run on a fresh install.
- Migrations live in `drizzle/` and are committed to git.
- The database file (`data/mikailab.db`) is local only and excluded from git.

## Dev scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server on localhost:3000 |
| `npm run dev:host` | Dev server on 0.0.0.0:3000 (network accessible) |
| `npm run build` | Production build |
| `npm run start` | Production server |

## Features

- Projects → Sequences → Shots → Segments
- Asset library with reference images
- LLM-assisted story and prompt generation (Ollama / OpenRouter / OpenAI-compatible)
- ComfyUI workflow integration (image and video generation)
- Dynamic batch generation
- Local VRAM auto management between Ollama and ComfyUI

## Transferring to a new machine

To move an existing installation with all local data:

1. Clone the repo on the new machine and follow Quick Start above.
2. Copy `.env.local` from the old machine.
3. Copy `data/mikailab.db` if you want to transfer projects, shots, and settings.
4. Copy `public/uploads/` if you want to transfer reference images.
5. Copy `public/outputs/` if you want to transfer generated outputs.
6. Run `npm.cmd ci` and `npm.cmd run db:migrate` on the new machine.

If starting fresh (no data to transfer), skip steps 2–5 — the database will be created automatically.

## Project structure

```
src/
├── app/          # Next.js App Router pages + API routes + Server Actions
├── db/           # SQLite connection + Drizzle schema
├── lib/          # Core library (LLM providers, ComfyUI client, settings, VRAM manager)
├── components/   # Shared UI components
├── actions/      # Server Actions (generation, settings, LLM chat)
├── types/        # TypeScript type definitions
drizzle/          # SQL migration files (committed)
data/             # Local SQLite database (not committed)
public/
├── uploads/      # User-uploaded reference images (not committed)
└── outputs/      # Generated ComfyUI outputs (not committed)
```
