# Repository Guidelines

## Project Structure & Module Organization

This repository is a small npm workspace with two applications:

- `apps/backend`: NestJS backend (`src/modules/*` for feature modules, `scripts/` for migration and smoke scripts, `storage/` for uploaded files in local development).
- `apps/frontend`: Vue 3 + Vite frontend (`src/views/`, `src/components/`, `src/stores/`, `src/lib/`).
- `db/migrations`: PostgreSQL schema changes.
- `docs/`: development plans and project notes.
- `static/`: shared static assets loaded by the frontend.

Prefer adding backend code inside a feature module and keeping frontend state in Pinia stores rather than ad hoc globals.

## Build, Test, and Development Commands

- `npm install`: install workspace dependencies.
- `npm run dev:backend`: start the NestJS API with watch mode.
- `npm run dev:frontend`: start the Vite app on port `5173`.
- `npm run build`: build backend and frontend for a quick integration check.
- `npm run smoke:backend`: run the backend smoke script against the configured API and database.
- `cd apps/backend && npm run db:migrate`: apply PostgreSQL migrations using backend `.env`.

Use the root `README.md` for required environment variables and local service endpoints.

## Coding Style & Naming Conventions

Follow the existing code style:

- TypeScript throughout backend and frontend source.
- 2-space indentation, semicolons, and double quotes.
- Vue SFCs use PascalCase filenames such as `AdminPage.vue`.
- NestJS modules, controllers, and services use `*.module.ts`, `*.controller.ts`, and `*.service.ts`.
- DTOs and entities live under each module in `dto/` and `entities/`.

No formatter or linter is currently wired in `package.json`, so keep changes consistent with nearby files and avoid unrelated reformatting.

## Testing Guidelines

Automated coverage is minimal today. The main executable check is `npm run smoke:backend`. When adding backend behavior, extend `apps/backend/scripts/smoke.js` or add focused tests near the feature if you introduce a test runner later. Name new tests after the feature they verify, for example `document.service.spec.ts`.

## Commit & Pull Request Guidelines

This repository has no commit history yet, so there is no established convention to mirror. Use short, imperative commit subjects such as `feat: add document rollback guard` or `fix: handle missing smtp config`.

PRs should include:

- a brief summary of user-visible or API-visible changes
- linked issue or task reference when available
- verification steps run locally (`npm run build`, `npm run smoke:backend`, manual UI checks)
- screenshots for frontend changes affecting `apps/frontend`

## Security & Configuration Tips

Do not commit populated `.env` files, database credentials, JWT secrets, or uploaded documents containing sensitive data. Use `apps/backend/.env.example` and `apps/frontend/.env.example` as templates.
