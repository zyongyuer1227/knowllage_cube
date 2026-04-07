# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Npm workspace: `apps/backend` (NestJS + TypeORM + PostgreSQL) and `apps/frontend` (Vue 3 + Vite + Pinia). Single-admin document management system for Chinese government documents.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm start` | Start both backend + frontend via `start-dev.js` (logs to `.logs/`) |
| `npm run dev:backend` | NestJS watch mode only |
| `npm run dev:frontend` | Vite on port 5173 only |
| `npm run build` | Build both apps (integration check) |
| `npm run smoke:backend` | Run `apps/backend/scripts/smoke.js` against live API+DB |
| `cd apps/backend && npm run db:migrate` | Apply pending SQL migrations (reads `apps/backend/.env`) |
| `cd apps/backend && node scripts/migrate.js 0005_search_logs.sql` | Apply a single specific migration |

No automated unit test runner is wired up. Extend `apps/backend/scripts/smoke.js` when adding backend behavior.

## Critical Architecture Patterns

### Auth — single static admin, no user table
- Credentials come exclusively from `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_LOGIN_CAPTCHA`.
- The users table was intentionally dropped (`db/migrations/0007_drop_users.sql`). Do **not** re-introduce a users table.
- JWT payload shape: `{ sub: 1, username: string, role: "admin" }`.

### Global guards — use `@Public()` to bypass
- `JwtAuthGuard` and `RolesGuard` are registered globally via `APP_GUARD` in `AppModule`.
- To expose a public endpoint, apply the `@Public()` decorator from `src/common/decorators/public.decorator.ts`.

### TypeORM — manual migrations only
- `synchronize: false` in `AppModule`. Never set it to `true`.
- Schema changes go in `db/migrations/` as sequentially numbered SQL files (`NNNN_description.sql`).
- The migration runner (`scripts/migrate.js`) tracks applied files in the `schema_migrations` table, not TypeORM's built-in migration runner.

### Document conversion — Python scripts
- `.doc`/`.docx` → Markdown via `scripts/word2md_converter.py`.
- Plain text → formatted Markdown via `scripts/text2md_formatter.py`.
- Supported upload extensions: `.doc .docx .txt .pdf .html .htm`.
- Uploaded files are stored under `storage/documents/` (relative to `process.cwd()`, i.e. `apps/backend/`).

### Preview rendering — inlined Chinese fonts
- `document-preview.util.ts` reads fonts from `static/fonts/` (FangSong, KaiTi, SimHei, FZXBSJW) and inlines them as base64 data URIs on first render, then caches the result in memory.
- Preview CSS lives in `static/css/cn-gov-doc.css`.

### Frontend — two views, one store
- Only two page-level views: `apps/frontend/src/views/GuestPage.vue` (public reader) and `AdminPage.vue` (admin panel).
- All API state lives in `apps/frontend/src/stores/workspace.ts` (Pinia). Keep it there; do not create ad hoc globals.
- All API calls go through `apps/frontend/src/lib/api.ts`. On HTTP 401, it dispatches a custom `kc:unauthorized` DOM event.
- `VITE_API_BASE_URL` defaults to `/api/v1`; dev proxy rewrites `/api` → `VITE_PROXY_TARGET` (default `http://127.0.0.1:3000`).

## Backend Module Layout

`src/modules/`: `auth`, `document`, `search`, `audit`, `reminder`, `reports`, `statistics`, `system`.

Each module follows: `*.module.ts`, `*.controller.ts`, `*.service.ts`, with `dto/` and `entities/` sub-directories.

## Code Style

- TypeScript throughout; 2-space indent; semicolons; double quotes.
- Vue SFCs: PascalCase filenames (`AdminPage.vue`).
- No formatter/linter configured — match the surrounding file's style exactly.

## Environment Setup

Copy `apps/backend/.env.example` → `apps/backend/.env` and `apps/frontend/.env.example` → `apps/frontend/.env`. Never commit populated `.env` files.

Key backend env vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_LOGIN_CAPTCHA`, `CORS_ORIGIN`.
