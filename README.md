# MikAI Production Lab

A local AI production preparation tool for structuring film and animation projects around story, universe, time, and image.

## Stack

- **Next.js 16** (App Router) — TypeScript
- **Tailwind CSS v4**
- **SQLite** via `better-sqlite3` + **Drizzle ORM**
- Local-first, no cloud dependency

## Requirements

- Node.js 20+ (LTS recommended)
- npm 10+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local if needed (default DB path: ./data/mikailab.db)

# 3. Generate and apply DB migrations
npm run db:generate
npm run db:migrate

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database scripts

| Command | Description |
|---|---|
| `npm run db:generate` | Generate SQL migration files from schema changes |
| `npm run db:migrate` | Apply pending migrations to the local SQLite database |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

Migrations live in `drizzle/` and are committed to git.
The database file (`data/mikailab.db`) is local only and excluded from git.

## Data directory

All local data is stored in `data/` (excluded from git).
The path is configurable via `DB_PATH` in `.env.local`.

When Dockerized in the future, `data/` will be mounted as a volume so the database persists across container restarts.

## V0 Scope

- Projects → Sequences → Shots
- Create, view, edit all entities
- Manual entry only

**Not yet implemented:** LLM assistance, asset library, timeline, image references, prompt composer, ComfyUI integration, Muse Studio export, Docker.

## Project structure

```
src/
├── app/          # Next.js App Router pages + Server Actions
├── db/           # SQLite connection + Drizzle schema
├── components/   # Shared UI components
drizzle/          # SQL migration files (committed)
data/             # Local SQLite database (not committed)
```
