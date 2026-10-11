# RMA System Production Audit

Audit date: 2026-10-11 (UTC)

## Decision

**GO — release `v0.2.4` is published and deployed.** Local checks, the protected-branch check, the full release workflow, registry pulls, backup restore validation, and production health checks passed. The follow-up items below describe scale and monitoring limits; none blocked this code-only release.

## Release and public repository

- Repository: [RMA System](https://github.com/arslanbasharat-o-o/RMA-System)
- Main branch: `main` only. The short-lived review branch for PR #25 was deleted after merge.
- Release commit: `fc791893b0c2d51faae96ae36fa35b60b33bae91`.
- Pull request: [#25 — Recover intake after recognition queue outages](https://github.com/arslanbasharat-o-o/RMA-System/pull/25)
- GitHub Release: [v0.2.4](https://github.com/arslanbasharat-o-o/RMA-System/releases/tag/v0.2.4)
- Container package: [public GHCR package](https://github.com/arslanbasharat-o-o/RMA-System/pkgs/container/rma-system)
- Web image: `ghcr.io/arslanbasharat-o-o/rma-system:0.2.4`
- Worker image: `ghcr.io/arslanbasharat-o-o/rma-system:worker-0.2.4`
- The public images were pulled from the production host. Their OCI labels identify the app/worker, version `0.2.4`, release commit above, and MIT license.
- The README now points directly to the release and package and includes copyable pull commands. The GitHub About text and website link use plain-language project details.
- The release workflow passed all three jobs: full validation, release publication, and web/worker image publication. [Workflow run](https://github.com/arslanbasharat-o-o/RMA-System/actions/runs/38164165766).

## Verification matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Dependencies and security scan | `npm ci`; `npm audit --omit=dev --audit-level=low` | Pass; 0 reported vulnerabilities |
| TypeScript and lint | `npm run typecheck`; `npm run lint` | Pass |
| Unit and integration tests | `npm test` | Pass; 17 files, 96 tests |
| Production build | `npm run build` | Pass |
| Desktop and mobile browser workflows | Full Playwright run with disposable PostgreSQL and private temp storage | Pass; 244/244 |
| GitHub CI | PR #25 required `validate` check and post-merge `main` CI | Pass |
| Release validation | Tag workflow, mock recognition providers | Pass; full desktop/mobile browser suite and both image builds |
| Customer-required intake | API and browser scenarios reject capture/processing until a named customer is present | Pass |
| Upload recovery | Regression test covers queue outage after image storage, then identical retry | Pass; retry queues recognition without attaching a duplicate |
| Production HTTPS and health | `https://rma.txparts.io/login` and `/api/health` | Pass; HTTP 200, DB healthy, version `0.2.4` |
| Production browser page | Real Chromium loaded the login page | Pass; sign-in form visible, no console errors or failed network requests |
| Production containers | App and worker image labels match release SHA; PostgreSQL healthy | Pass; app/worker on `0.2.4` |
| Production data and queue | Business-table counts and active queue count before/after deploy | Pass; unchanged, queue empty |
| Other server projects | Container IDs before/after deployment | Pass; eight unrelated services were unchanged and remained healthy |
| Backup and restore | Checksums/archive listing; database restored into isolated temporary DB and removed | Pass; 17 tables restored; storage archive had 7 entries |
| Secret scan | Gitleaks staged-change scan | Pass; no findings |
| Paid recognition providers | Local, CI, and release checks used mocks; no live provider test was sent | Not called |

The full browser suite exercises authentication and role boundaries, RMA intake, camera and file-upload flows, customer gating, recognition results, manual review, vendor/catalog management, reports, dialogs, theme behavior, navigation, and responsive layouts. Production verification was read-only; no RMA, customer, vendor, or image record was created or changed.

## Fix included in `v0.2.4`

Image upload previously set an item to `queued` before durable queue publication. If pg-boss was unavailable, the upload returned an error but left the image attached and the item queued. Re-uploading the same image then followed the deduplication return path and could leave recognition unstarted.

The route now leaves the item upload-ready until the queue transaction commits. An identical retry detects the already-attached image and retries queue publication for upload-ready items. The test confirms a transient queue failure can recover without duplicating the image.

## Production deployment

- Production URL: [https://rma.txparts.io](https://rma.txparts.io)
- App and worker are both running release `0.2.4`, commit `fc791893b0c2d51faae96ae36fa35b60b33bae91`.
- PostgreSQL and the existing image-storage volume were preserved. No migration was needed or run.
- The active queue was empty during rollout. The app and worker were restarted; PostgreSQL and all eight unrelated project containers kept their prior container IDs.
- The login page returned HTTP 200, the production health endpoint returned `status: ok`, and app/worker logs had no error, fatal, or panic lines during the post-deploy check.
- The `0.2.3` web and worker images remain available for rollback. Rollback can retag those images to the Compose service aliases and recreate only the app and worker, preserving database and storage volumes.

## Follow-up findings

These are verified improvement items, not release blockers at the current observed data volume:

1. **Reports stop at 1,000 rows.** `GET /api/reports` applies a hard `.limit(1000)` and does not expose truncation or pagination. Large installations could receive an incomplete export without a warning.
2. **Some collection endpoints are unbounded.** RMA, customer, and display-catalog list queries return every matching row. Add pagination before these tables grow substantially.
3. **Worker readiness is not represented by `/api/health`.** That endpoint checks PostgreSQL only, and the worker container has no health check. Add an explicit worker heartbeat/queue-lag signal for monitoring.
4. **Database schema changes have no migration ledger.** The current migration script uses idempotent DDL and succeeded on a fresh CI database, but a versioned migration history would improve upgrade review and drift detection.
5. **The production host's Compose file predates the repository's image variables.** The release images were verified by digest and deployed through the host's existing local Compose image aliases. Syncing the deployment Compose file before the next rollout will simplify future image selection.
6. **Load and provider availability were not measured.** No multi-user load test or paid provider request was run. Provider credentials and external recognition services therefore remain unverified by this audit.

## Rollback

The previous `0.2.3` web and worker tags were pulled successfully before final verification. If `0.2.4` has an application failure, retag the `0.2.3` images to the existing Compose app/worker aliases and recreate those two services only. Do not remove or recreate PostgreSQL or storage volumes.
