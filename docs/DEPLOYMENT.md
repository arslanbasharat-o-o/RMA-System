# Production rollout and rollback plan

**Status: planning only. Do not run the modifying commands without a separate approved rollout.** This plan was assessed read-only on 2026-10-28 at approximately 14:38 UTC. Recheck all live state and CI before acting. Every command below is labeled: **verified** means observed in this audit or present in repository documentation/scripts; **unverified** means proposed and not executed in this audit. A documented command is not proof that a backup, deployment, or rollback will succeed.

## Provenance and present state

- Host `rma.txparts.io` (`Txparts`); `/opt/rma-system/app` points to `/opt/rma-system/releases/v0.4.1`. This directory has no Git metadata. Active Compose uses `/opt/rma-system/app/docker-compose.yml` and `/opt/rma-system/.env`. The latter contains secrets; never print or copy its contents into logs or documentation.
- Running app and worker images were created 2026-10-26 13:41 UTC and labeled `0.4.1`, revision `2cb09cd6ed09398a1380021d439c22ca119fc102`. Their locally recorded image IDs/repository digests are app `sha256:c68656ca34bedeab3a699b820a2f2806982f8a7ccd1b490c0c6988b868eaa2c1` and worker `sha256:ea0af562bb9b45a01a9aa770c8e067488a27db147e57743acf8166b6a4829c18`. Preserve the actual local images, not merely their mutable tags.
- The images' Compose build labels, history and creation time before the GitHub release build support a separate build; exact build host, context and command are **unverified**. The GitHub v0.4.1 release job published different manifest digests at 14:40–14:41 UTC, from public commit `84c8254`. Image labels are supplied build arguments, not proof of input content.
- The labeled commit descends from root `9db001b`; current public main descends from independent root `f17d54c`, so there is no merge base. The public commit `84c8254` has the same runtime tree as `2cb09cd`; their only tree differences are documentation and one test. This supports a separately established public baseline/source publication, not evidence of a force-push or a different product; the exact historical operation remains **unverified**.
- The on-server directory is a mixed manual copy, not an exact match to either commit: 262 of 269 tracked files match `e9381a1`, seven differ (Compose, CI workflow, four E2E files and `package-lock.json`). Its Compose file adds a writable `./src:/app/src` bind mount to the worker. The mount is active and the current file on that mount matches the host. The worker started before the current `processor.ts` modification, so its loaded modules and actual processing behavior are **unverified**. Retaining an image alone is not an exact rollback of this mixed runtime.
- Public release `v0.4.5` resolves to `e9381a1f79d94117410bad0bdfe15b3dfe0ecb63`; release workflow 40403934899 succeeded and published app digest `sha256:0e32f32e8ac767ccf600a1de5e4418be94e9a3a0c8b3e6d7187553ff845a09d1` and worker digest `sha256:26b12d311854bb8c09492d4f2342da67e9a23ec9ddc954a6e79a35ee27f6358b`. Verify those digests, labels, platform and availability again at rollout. Do not assume the current `0.4.1` registry tag can reproduce the running images.

## Upgrade delta and risk

**Risk: high until backup recovery, worker provenance and recognition behavior are resolved.** Comparing labeled `2cb09cd` with `e9381a1`: `src/db/schema.ts`, `src/db/migrate.ts`, `.env.example`, `docker-compose.yml` and `Dockerfile` are byte-identical. No new schema migration, environment variable, or Compose service is introduced by that source diff. The actual server Compose file differs as described above. Four relevant live columns, including both `recognition_revision` columns, were confirmed present; the entire production schema and all historical migrations were not audited. Do not run `db:migrate` merely because the version changes. A separate approval is required for any migration or data restore.

The changes include candidate cards and manual model entry, different navigation and polling, acceptance and model-review rules, visual decision logic, and verified part-number matching (`src/app/api/rma-items/[id]/review/route.ts`, `src/lib/queue/processor.ts`, `src/lib/recognition/lens/`). Operators may persist different verified model choices, recognition evidence and audit records; these data changes are not undone by an image rollback. Paid provider activity and queue replay are possible. Test with isolated synthetic data, explicit operator expectations and an approved provider budget. The new verified-part-number path and conflicting-evidence handling need focused review before rollout. Source code and CI checks alone do not establish production recognition quality.

At audit time the app, worker and PostgreSQL containers reported healthy; health checks database connectivity, not the worker's results. The last recorded manifest and `/500` errors were at 2026-10-26 18:20 UTC. There were no app log lines at all since 2026-10-27 00:00 UTC through this audit, so no recurrence was observed; this is not proof of healthy authenticated use. The two named RMA client-reference manifests and `/500` file exist in the current app container. Loopback GETs for `/rmas`, `/rmas/new`, a synthetic `/rmas/<id>` and its `/capture` path returned HTTP 200; these are unauthenticated HTTP checks, not successful signed-in navigation or a real-record workflow. The evidence suggests the earlier running build was missing or unable to load Next.js build artifacts; the underlying cause and whether a restart or image change corrected it are **unverified**. Current `next build` defaults to Turbopack; do not rely on the old changelog's Webpack claim.

## Backups and preservation

`scripts/backup-production.sh` documents a PostgreSQL custom-format dump, a storage-volume archive, archive/list checks and a SHA-256 manifest under `/var/backups/rma-system`. At audit time that directory did not exist; searches under `/var/backups`, `/opt/rma-system`, and selected `/root` locations found no matching RMA backups. **Last successful backup time and off-site backups are unverified.** An archive listing and checksum do not prove an actual restore. Database and image archive snapshots also need a controlled write/worker quiescence strategy to be mutually consistent.

Before any rollout: locate existing recoverable off-host backups; create fresh database and image backups during an agreed write pause; verify checksums and restore both into an isolated environment; retain them encrypted off-host. Preserve the complete current release directory, exact Compose file, symlink target and restricted environment file using an approved secure procedure, plus both local image IDs and their loadable archives. The release directory's mounted worker source is part of the rollback state. Do not include secrets in tickets or command output. Decide whether to preserve or remove the worker bind mount; pinning 0.4.5 images while leaving the existing mount in place would still execute host source. The exact artifact capture, quiescence and restore procedure is **unverified** and requires rehearsal and approval.

**Verified — read-only health and image identity, observed during this audit:**

```sh
docker ps --filter name=rma-system
docker inspect rma-system-app-1 rma-system-worker-1 --format '{{.Name}} {{.Config.Image}} {{.Image}}'
curl -fsS http://127.0.0.1:23001/api/health
```

**Unverified — backup command is documented by the repository script but was not run in this session; it writes backup files:**

```sh
bash /opt/rma-system/app/scripts/backup-production.sh
```

**Unverified — future local image retention; writes archives and requires sufficient protected storage. Test archive loading in an isolated Docker host and also preserve the separately mounted source:**

```sh
docker save ghcr.io/arslanbasharat-o-o/rma-system:0.4.1 -o /secure-backup/rma-app-0.4.1.tar
docker save ghcr.io/arslanbasharat-o-o/rma-system:worker-0.4.1 -o /secure-backup/rma-worker-0.4.1.tar
```

Before saving, inspect each tag and confirm it still resolves to the exact running image ID above. `/secure-backup` is a placeholder, not a verified host path. Encrypt and move archives off-host using an approved method.

## Preliminary isolated restore — 2026-10-28

A read-only online database dump and image-storage archive were copied to a permission-restricted local backup directory. Their SHA-256 checksums were checked. The database restored into an isolated PostgreSQL 16 Docker container with `--no-owner --no-acl`; all 17 public-table row counts matched a subsequent read-only production comparison. Ownership and grants were not restored or verified. The storage archive restored into an isolated Docker volume; all archived contents matched the restored volume, and 502 paths and contents matched the server at comparison time. The pinned 0.4.5 app started on an internal Docker network against that database and read-only storage; its health endpoint returned database healthy and its login page returned HTTP 200. No production credentials or provider jobs were used.

These online snapshots are **not verified as a mutually consistent backup**: the application remained live while they were collected. A quiesced, coordinated backup and its verification are required before cutover. The original transfer wrapper exited with a local shell error after transfer; archive integrity and server content comparison independently succeeded. Do not infer a tested production restore or tested database permissions from the isolated checks.

## Proposed rollout sequence — not performed

1. Review the exact 0.4.5 behavioral changes, verified-part-number conflict handling and CI results; establish an authenticated, synthetic acceptance checklist, a provider budget, maintenance window, queue handling and clear stop conditions. Confirm whether live `0.4.1` records can be read by 0.4.5 and vice versa in a restored isolated copy. Resolve the worker bind-mount policy and preserve the current mixed state.
2. Obtain a tested, consistent database and storage backup, secure off-host copies, the current release/Compose/environment snapshots and retained app/worker image archives. Verify disk capacity, digests and restoration. If any are missing or a restore fails, stop.
3. Prepare a **new**, versioned release directory from the reviewed `e9381a1` source and a reviewed Compose file. Choose an immutable worker-image source with no accidental `./src` mount, or explicitly document and pin its mount. Do not replace the existing release directory or symlink until a separately approved cutover. The exact staging/cutover commands are **unverified**; prepare them only after the mount and maintenance decisions.
4. Pull both immutable 0.4.5 images, inspect their labels and platform, and confirm exact digests. Pulling changes server state and needs rollout authorization. **Unverified — proposed pulls, not run:**

```sh
docker pull ghcr.io/arslanbasharat-o-o/rma-system@sha256:0e32f32e8ac767ccf600a1de5e4418be94e9a3a0c8b3e6d7187553ff845a09d1
docker pull ghcr.io/arslanbasharat-o-o/rma-system@sha256:26b12d311854bb8c09492d4f2342da67e9a23ec9ddc954a6e79a35ee27f6358b
```

5. Cut over app and worker together using the reviewed staging configuration and explicit pinned images, only after queue/write controls are in place. No schema migration is indicated by the source diff, subject to the live schema review above. Exact Compose/symlink/restart commands are **unverified**; do not substitute generic `up` commands while the bind-mount question is unresolved.
6. Verify running image IDs, mounts, app `/api/version` and `/api/health`, nginx, app/worker/Lens logs, and authenticated RMA detail and capture on an approved synthetic record. Test one controlled end-to-end job only with approved provider spend and queue controls. Compare data, worker behavior, latency and errors against acceptance criteria. If a gate fails, stop and follow the approved rollback decision.

## Proposed rollback — not performed

1. Stop new writes and queue processing according to the approved runbook; record any work completed since backup. Image rollback alone does not reverse or safely reconcile those records.
2. Restore the preserved exact release/Compose configuration, including the worker's bind-mounted source and original symlink arrangement, and the two original locally retained images. Recreate only the approved app/worker services; preserve PostgreSQL and storage volumes. Exact commands are **unverified** until the full state has been captured and rollback rehearsed. In particular, do not repull a mutable `0.4.1` tag and assume it equals the original images.
3. Check image IDs, mounts, health, logs and authenticated flows, then resume work only when explicitly approved. If the problem requires database or image-data restoration, stop: restoring over production is a destructive, separately approved operation that can discard work created since the backup. Use the tested recovery plan and reconcile post-backup records before any restore.
