# Project memory

**Update this file whenever the project changes.** Recheck time-sensitive facts and the exact files touched before changing code; this index is not a substitute for the relevant Next.js documentation or production verification.

## Contents

- [Identity and architecture](#identity-and-architecture)
- [Code map](#code-map)
- [Data and workflows](#data-and-workflows)
- [Local setup and checks](#local-setup-and-checks)
- [Git and delivery](#git-and-delivery)
- [Production](#production)
- [Conventions and recipes](#conventions-and-recipes)
- [Skills and gotchas](#skills-and-gotchas)
- [Last verified](#last-verified)

## Identity and architecture

This repository is **RMA System**, repair-return and display-photo identification software, not a restaurant management system. The Next.js 16 App Router serves React 19/TypeScript UI and route handlers; PostgreSQL 16 and Drizzle store data; a separate pg-boss worker performs image recognition using Lens and OpenAI adapters. Docker Compose defines app, worker, PostgreSQL and optional Caddy (`package.json`, `docker-compose.yml`, `src/worker/index.ts`, `ARCHITECTURE.md`).

## Code map

- `src/app/`: pages and layouts, `globals.css`; `api/` contains Next.js route handlers. Pages include dashboard, RMAs and mobile capture, review queue, customers, vendor catalog, reports, login and settings (legacy display catalog routes were removed as dead code).
- `src/components/`: reusable UI, application shell, camera scanner, review drawer, settings, theme, motion and premium elements; `src/context/SidebarContext.tsx` holds sidebar state.
- `src/db/schema.ts`: Drizzle schema; `src/db/migrate.ts`: transactional, idempotent SQL schema setup; `src/db/seed.ts`: initial data. `src/db/seed-display-inventory.ts` imports the private seeded product references. `drizzle.config.ts` configures generation into `src/db/migrations`.
- `src/lib/auth/`: signed session tokens, database session validation, roles, passwords and login limiting; `src/lib/storage/`: image storage and validation.
- `src/lib/queue/`, `src/worker/`: transactional job enqueue and worker; `src/lib/recognition/`: Lens, OCR, vendor rules, verified-example comparisons, seeded exact-variant matching (`seeded-inventory.ts`), synthesis, and AI Vision gate (`src/lib/recognition/lens/decision.ts`) for photo inspection on ambiguous candidates.
- `src/__tests__/`, `e2e/`, `scripts/`: Vitest unit/integration tests, Playwright scenarios, fixtures and operational/evaluation scripts. `.github/workflows/`: CI and release publication.
- `docker-compose.yml`, `Dockerfile`, `Caddyfile`, `DEPLOYMENT.md`: runtime definition and deployment guidance. `docs/releases/` and `CHANGELOG.md` are historical release records, not current runtime status.

## Data and workflows

`src/db/schema.ts` defines users/sessions, customers/return reasons, RMAs/items/images, the phone-model catalog, seeded exact display products and back references, vendors/variants/rules, recognition runs/OCR/candidates, review actions, audit logs and app settings. `src/db/migrate.ts` also creates a sequence and foreign keys. Review schema and migration SQL together: `db:migrate` runs the hand-maintained script, not a demonstrated Drizzle migration runner.

An operator creates an RMA, uploads images, and enqueueing advances the recognition revision in the same database transaction as job publication (`src/lib/queue/index.ts`). The worker first compares the display back (handling both `back` and legacy/default `primary` photos explicitly) against active seeded exact product variants (`seeded-inventory.ts`). A confident, distinguishable match attaches the seed's product record and suggests the model; an ambiguous result, miss, provider error, or contradictory OCR part-number evidence continues through the existing Lens/OCR flow and leaves UPC/EAN and SKU unattached. A seeded match still requires operator confirmation. Photo changes, manual model correction, "mark unknown", and conflicting OCR retries clear stale product links, match confidence, and evidence. The old generic Excel catalog parser and its `db:seed` branch are removed; ordinary admin/settings/reason seeding remains.

The current private source seed package is `.local/display-inventory-seed/` (ignored by Git): 76 product records with 83 cropped display-back references. One source sample that shows a package back is excluded from matching. `npm run db:seed-display-inventory` validates and reports a dry run by default; add `--apply` only after verifying the local database target. It refuses a non-local database unless `--allow-remote` is explicitly supplied. Explicit manifest exclusions are processed transactionally, reject overlaps with included sample IDs, and deactivate matching on previously imported references. The images, manifest and resulting storage objects are not committed to the source repository.

Staff review and correct suggestions (`src/worker/index.ts`, `src/lib/queue/processor.ts`, `src/app/api/rma-items/`). Failures, uncertain matches, provider costs and stale job revisions need attention. The authenticated routes use `requireAuth`; roles are `admin`, `operator`, `viewer` (`src/lib/auth/middleware.ts`). JWTs are signed and checked against session and active-user rows (`src/lib/auth/session.ts`).

## Local setup and checks

Use Node `24.21.0` (`.nvmrc`), npm and an isolated PostgreSQL database. `npm ci`; configure `.env.local` from `.env.example` with local-only values. Next loads `.env.local`; shell scripts/worker need variables loaded separately. Then `npm run db:migrate`, `npm run db:seed`, `npm run dev`, and separately `npm run worker`. Migration and seed change the selected database: verify its target first. Use mock Lens and disposable test data; never aim fixtures or tests at production (`CONTRIBUTING.md`, `scripts/seed-test-fixtures.ts`).

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; `npm run test:e2e` needs isolated database, fixtures and browsers. CI's actual sequence and mock configuration are in `.github/workflows/ci.yml`. An isolated 0.4.5 Docker app boot, database health and login response were verified against restored production snapshots on 2026-10-28. A second restore included grants with a local non-login role placeholder and `--no-owner`; public object owners and schema ACL matched in targeted checks. Full roles and privileges, authenticated flows and recognition remain unverified. See the progress ledger.

Configuration names only: see `.env.example` and `docker-compose.yml`. Important groups: `DATABASE_URL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `COOKIE_NAME`, `SESSION_MAX_AGE_SECONDS`, `INITIAL_ADMIN_*`, `APP_URL`, `LENS_*`, `OPENAI_*`, `WORKER_CONCURRENCY`, `STORAGE_*`, `MAX_UPLOAD_SIZE_BYTES`, `BUSINESS_TIMEZONE`, `RMA_APP_IMAGE`, `RMA_WORKER_IMAGE`, `NEXT_PUBLIC_APP_COMMIT`. Do not record values or copy production credentials into local files.

## Git and delivery

GitHub default branch is `main`; a PR with the required `validate` check is enforced for administrators too. Recent history contains merged PRs. Use a focused branch, commit, push and open a PR; describe verification. Confirm live rules and checks before merging. CI validates on PR and main; `.github/workflows/release.yml` publishes releases/images from version tags after full validation. GitHub publication does not deploy production (`docs/release-process.md`).

Production rollout requires explicit authorization; see `docs/DEPLOYMENT.md` for the observed 2026-10-28 rollout, verified backup procedure and untested rollback commands. Review diff, app/worker image revisions and schema changes, backups, queue state and rollback images. `DEPLOYMENT.md` documents the generic Compose procedure; **rollback has not been rehearsed**. Do not assume `git pull`: the production release path is not a Git checkout. Do not run migration, restart containers, alter environment or switch images without explicit authorization and a reviewed plan. Restore previous matching app/worker images and preserve database and storage volumes if rollback is approved; exact operational sequence remains unverified.

## Production

Observed 2026-10-28: host `<production-host>`, SSH access configured via dedicated deploy key. Real hostnames, usernames and key paths are stored only in local untracked notes (`.local/production-access.md`) to maintain public repository hygiene. `/opt/rma-system/app` points to `/opt/rma-system/releases/v0.4.5-e9381a1`, an extracted release. Compose uses `/opt/rma-system/.env` (secret) and the pinned release Compose file. App and worker images report version `0.4.5` and revision `e9381a1f79d94117410bad0bdfe15b3dfe0ecb63`; app digest `sha256:0e32f32e8ac767ccf600a1de5e4418be94e9a3a0c8b3e6d7187553ff845a09d1`, worker digest `sha256:26b12d311854bb8c09492d4f2342da67e9a23ec9ddc954a6e79a35ee27f6358b`. The worker mounts the storage volume and has no source bind mount. App, worker and PostgreSQL are healthy; nginx serves HTTPS to app port 23001. Ten-minute monitoring found no app/worker error lines and sampled unauthenticated routes returned HTTP 200. Signed-in RMA flows and actual recognition processing remain unverified. Legacy 0.4.1 images and release directory were removed under owner approval following verification; pre-cutover rollout backup files (`20261028T152407Z`) on the server and local staging directories were also cleaned up under owner instruction.

Read-only diagnostics: `docker ps`, `docker logs --tail 50 rma-system-app-1`, `docker logs --tail 50 rma-system-worker-1`, `curl -fsS http://127.0.0.1:23001/api/health`, and public `https://<production-host>/api/health`. Logs may contain sensitive operational data. Health checks do not prove authenticated UI or worker processing. A coordinated backup was taken and tested locally on 2026-10-28; see `docs/DEPLOYMENT.md` for paths, hashes, limitations and rollback. Do not execute a rollback, migration or data restore without the applicable authorization.

## Conventions and recipes

- Respect `AGENTS.md`: read installed `node_modules/next/dist/docs/` for the relevant Next.js APIs before writing code. Follow existing TypeScript, Zod, route-handler auth and test patterns. Check caller and data boundaries.
- UI currently uses CSS light/dark semantic variables in `src/app/globals.css`, reusable primitives in `src/components/ui`, shell/theme providers and motion tokens (`src/lib/motion/tokens.ts`), including reduced-motion handling. The source-derived design reference is `DESIGN_LANGUAGE.md`; the owner's separate custom design-language skill remains unidentified.
- Feature: trace relevant page, API, permissions, database and worker paths; preserve data and add appropriate tests. Removal: trace callers, persisted data, jobs and UI before changing; obtain approval for destructive operations.
- UI page: follow matching `src/app/<route>/page.tsx` and layout, existing shell, theme and responsive/accessibility patterns. API: add a route handler under `src/app/api/`, follow neighboring validation, role checks and error handling.
- DB change: review `src/db/schema.ts` and `src/db/migrate.ts` together; test an upgrade and rollback on an isolated copy. Generated Drizzle migration execution is unverified. Production migration or data changes require explicit approval.

## Skills and gotchas

Ponytail guides minimum complete code changes; GSD skills support planning/workflows when requested; CodeRabbit `code-review` is available for reviews; `design-taste-frontend` and `ui-skills-root` help UI work. `find-skills` is installed and available in the skill catalog. Custom design-language skill pending; use `DESIGN_LANGUAGE.md` for the source-derived baseline.

The 2026-10-28 deployment had zero app and worker error lines during the ten-minute monitoring window. Authenticated routes, paid-provider recognition, full backup permissions and a production rollback remain unverified. Local ignored `.local/`, `.env.local`, build and test artifacts may contain operational data; preserve them. Historical recognition documentation contains deployment-specific benchmarks and settings that may be stale; validate against current code and runtime before use. Do not call paid providers as a test without authorization.

## Last verified

- Date: 2026-10-30 (Asia/Karachi).
- Application image source: `dfd51f3885ebd9036fe18f04bf84e625da961e68` (version `0.4.10`); GitHub main is `dfd51f3`.
- Review queue & recognition precision fixes verified: sanitized review reason telemetry display (clean bulleted list of operator-relevant reasons, no raw matcher token logs or empty OCR strings), OLED vs legacy LCD gating to eliminate false iPhone 6/7/8/SE misidentifications on modern displays with aftermarket steel heat-shields, and physical display aspect ratio heuristics in vision decision prompt.
- Server app image digest: `sha256:c6b0119b5ac241174fb15d5ff081d971ce29fbf2faa48db8b0b55263c619865d`; worker image digest: `sha256:9d44680f49d8a1b9044f8fc5941227fa16238b2ce54b5d97706bca22d316a445`.
- Production deployment active at `/opt/rma-system/releases/v0.4.10-dfd51f3`; symlink `/opt/rma-system/app` verified pointing to `v0.4.10-dfd51f3`. Backup release `v0.4.9` (`/opt/rma-system/releases/v0.4.9-231c24e`) remains available on server for rollback.
- App/worker/database health verified healthy on 0.4.10 (`/api/health` returns HTTP 200 `{"status":"ok","database":"healthy","version":"0.4.10"}`).
- Self-hosted Google Lens upgraded to `v1.0.22` with Scrapling worker `v1.0.22`, AnyIP preemptive proxy tunnel forwarder (1.17s latency), and `LENS_SEARCH_PROMPT` multisearch inspection prompt configured across `.env`, `docker-compose.yml`, app, and worker.
- Cleanup executed: Obsolete GitHub releases (`v0.4.7`, `v0.4.8`) and remote tags removed, retaining strictly active backup `v0.4.9` and latest `v0.4.10`. Remote branches cleaned, retaining only `main`. Server cleaned of obsolete release directories (`v0.4.7-fa93d6e`, `v0.4.8-f4c603f`) and unused docker images (`0.4.7`, `0.4.8`), maintaining strictly 1 backup version and the latest active version.
