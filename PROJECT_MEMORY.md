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
- Application image source: `39a6614` (version `0.4.11`); includes UI performance optimization, zero-re-render spotlights, HTTP image caching, stabilized RMA details layout, and 0.2s compositor-accelerated BlurIn.
- Deployed release: `v0.4.11` active at `/opt/rma-system/releases/v0.4.11-39a6614`; symlink `/opt/rma-system/app` verified pointing to `v0.4.11-39a6614`.
- App/worker/database health verified healthy on 0.4.11 (`/api/health` returns HTTP 200 in 1ms `{"status":"ok","database":"healthy","version":"0.4.11"}`).
- Server Cleanup & Resource Optimization: Reclaimed ~20 GB of disk space on production VPS (`df -h /` dropped from 50 GB / 52% used down to 30 GB / 31% used, 67 GB available). Pruned obsolete buildkit cache layers and intermediate release images while preserving recent rollback targets.
- Emil Kowalski Design Engineering Integration: Installed 16 skills from `emilkowalski/skill` via `npx skills add emilkowalski/skill`. Implemented physical motion tokens (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`), tactile `:active:scale-[0.97]` click transitions with `motion-reduce:transform-none`, and zero sluggish transitions across interactive buttons and dialog elements.
- Clean Modern UI & Div-Soup Elimination: Completely replaced nested container "divs in a div", harsh borders, blue diagnostic tiles, and CSS capsule clutter. Redesigned the reference detail modal in `/display-catalog` and `ItemReviewDrawer` with clean typographic hierarchy, neutral borders, and high-end image presentation frames. Removed all AI explanatory text, debug previews, and obsolete suggestion badges across the application.
- Robust Barcode (UPC) and Product SKU Resolution: Implemented `matchSeededProductByText` in `src/lib/recognition/seeded-inventory.ts` with 7 comprehensive unit test suites. Correctly resolves exact model names, printed titles, supplier SKUs, barcodes, and manufacturer-prepended strings ("Apple iPhone 16 Pro"). Enriched `GET /api/rmas/[id]`, `GET /api/rma-items/[id]`, and `GET /api/rmas/[id]/recognition-status` with guaranteed fallback lookup against `seeded_display_products`. Live verified on production RMA `94bfc7fc-7137-4196-8dff-39d661736ac3` (Item 1: iPhone 16 Pro, UPC 665871925243; Item 2: iPhone 16 Plus, UPC 665386615219).
- Full automated test suite passes: TypeScript typecheck, ESLint, 30 Vitest test files (242 tests), production Next.js build, and Playwright verification.
- High-Performance UI & Smooth Motion Polish: Optimized `BlurIn` heading duration from 1s to 0.2s with GPU compositor acceleration (`will-change`); converted `CardSpotlight` from per-pixel React `setState` updates to direct DOM overlay property styling to eliminate mouse-hover frame drops; added HTTP caching (`ETag`, `304 Not Modified`, `Cache-Control: private, max-age=86400`) and lazy/async loading to `/api/images/[id]` and `/display-catalog`; stabilized `RmaDetailPage` layout hierarchy to prevent `AppShell` remount flicker; eliminated initial 250ms debounce on RMA list loads.
- Vendor Multiple Codes Management & Auto-Synced Rules: Revamped `/vendor-catalog` with an "Edit Vendor" modal allowing operators to update vendor names, primary stamp codes, and multiple recognized stock/stamp codes (e.g. `TXP09`, `TXP08`, `TXP10`). Removed manual user-side recognition rule creation; the backend now automatically synchronizes and maintains `vendor_recognition_rules` via `src/lib/recognition/rules/sync.ts` upon vendor/variant creation and editing.
- Resilient Vendor Recognition & OCR Text Normalization: Enhanced `VendorRuleMatcher` in `src/lib/recognition/rules/matcher.ts` with automatic rule synthesis and multi-token expansion (space/hyphen/slash-stripped variations and delimited sub-word extraction), allowing OCR tokens like `TXP-09`, `TXP 09`, `[TXP09]`, and `QC PASS TXP09` to match vendor `TXP09` with 100% reliability. Tuned OCR instructions in `src/lib/recognition/openai/vision.ts` to actively capture 3-7 character supplier ink stamps and laser markings across backlight plates, flex cables, and warranty stickers.
- Authentic 1D Visual Barcode Rendering: Created `src/components/ui/barcode-visual.tsx` rendering scannable, crisp vector Code 128 barcodes via SVG with human-readable monospace digits below. Integrated into `ItemReviewDrawer`, `/review-queue`, and `/display-catalog`.
- Display Approvals & Review Queue Cleanup: Stripped all long diagnostic junk, raw internal debug arrays (`inventoryMatchEvidence` cues, conflicting cues, raw OCR strings) from `/review-queue` and `ItemReviewDrawer`. Built a clean, ultra-fast approval workflow with prominent Approve / Mark Unknown / Skip actions, visual barcodes, and zero CSS capsule or div-soup clutter.
- Production zero-downtime deployment active on `https://rma.txparts.io`. Immediate rollback target retained on host.
