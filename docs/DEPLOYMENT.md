# Production deployment and rollback

Status below reflects the rollout verified on 2026-10-29. Recheck live state, GitHub checks, queue, backups and approval before future operations. Commands labeled **verified** were run during this rollout; commands labeled **unverified** are proposed and were not run. Secrets are in `/opt/rma-system/.env`; do not print them.

## Current runtime

- Host `<production-host>`; `/opt/rma-system/app` points to `/opt/rma-system/releases/v0.4.6-5a83ce2`. It is an extracted release, not a Git checkout. (Host details, login user, and SSH keys are kept in local untracked notes to protect public repository security).
- App image `ghcr.io/arslanbasharat-o-o/rma-system@sha256:41959a12901f4cfefddce269b56fb70e680fd246a376651712573f6ce5347e31`, worker image `ghcr.io/arslanbasharat-o-o/rma-system@sha256:16ef96fed2a7f2c615afc304560f2a7c7252fe42425683bd842b754229ddf99f`; both label version 0.4.6, revision `5a83ce254a5ceae0c44a0635ec807ce02654dd7f`. Main may contain newer documentation-only commits.
- Compose project `rma-system` runs app, worker and PostgreSQL. Its reviewed Compose file pins the images literally and mounts only the storage volume into the worker; no worker source bind mount. nginx is the host reverse proxy. The app listens on loopback port 23001.
- Previous releases: `/opt/rma-system/releases/v0.4.5-e9381a1` remains available on the server for instant rollback if required. Legacy `0.4.1` images and release directory were removed under prior owner authorization.

## Backups and restore evidence

The coordinated backup `20261028T152407Z` was taken while the app and worker were stopped and the queue was idle. Server files are under `/var/backups/rma-system/`; the locally transferred database and byte-identical storage archive are under `~/rms-backups/20261028T145724Z/coordinated-20261028T152407Z/`, with `SHA256SUMS`. The initial archive of the old release is in the parent directory. A zero-byte file with the original storage name is an interrupted redundant transfer and is **not** a backup; use `storage-verified-identical.tar.gz`.

Database dump: 397937 bytes, SHA-256 `405eaaab5957ce14a39c619050acf5a3ce948906a3d19cdbcefb539dd90cf21e`; storage archive: 32069622 bytes, SHA-256 `3ac3de86ce4a761dbdd0f37515a6c43ef377f73562473a0e2b97e2b0d762ad00`. Server manifest and local checksums passed. An isolated PostgreSQL 16 Docker restore using `--no-owner` and a local non-login role placeholder succeeded; all 17 public table counts matched production, and targeted public owners and schema ACL matched. The byte-identical storage copy was restored to an isolated Docker volume and all 502 server paths/content matched. The 0.4.5 app booted against the restored database and storage on an internal Docker network, with database health and login HTTP 200. Full roles, grants, authenticated flows and real provider processing were not verified. Copies on the server and Mac are not independently verified encrypted off-site disaster recovery.

**Verified — stop app, verify queue idle, stop worker, and run the repository backup script (writes production backup files; authorization required):**

```sh
docker compose --env-file /opt/rma-system/.env -p rma-system -f /opt/rma-system/app/docker-compose.yml stop --timeout 60 app
docker exec rma-system-postgres-1 psql -U postgres -d rma_system -X -A -t -c "SELECT count(*) FROM pgboss.job WHERE state IN ('created','retry','active');"
docker compose --env-file /opt/rma-system/.env -p rma-system -f /opt/rma-system/app/docker-compose.yml stop --timeout 60 worker
bash /opt/rma-system/app/scripts/backup-production.sh
```

Proceed only if the queue count is zero; verify the resulting database dump, storage archive and checksum manifest, transfer securely, restore both in an isolated environment and verify before deploying. This sequence pauses the site. Backup failures require restoring service and stopping the rollout. Retain production data and avoid migrations unless separately approved.

## Rollout procedure used

The 0.4.5 release source was extracted into a new directory, the reviewed pinned Compose file was placed there, both digest-pinned images were pulled, the old app and worker were stopped after an idle-queue check, and the `app` symlink was switched to the new directory. The following service commands were executed after the symlink change. They modify production and require explicit approval for future use.

**Verified — staging and release switch commands as executed during this rollout:**

```sh
mkdir /opt/rma-system/releases/v0.4.5-e9381a1
docker pull ghcr.io/arslanbasharat-o-o/rma-system@sha256:0e32f32e8ac767ccf600a1de5e4418be94e9a3a0c8b3e6d7187553ff845a09d1
docker pull ghcr.io/arslanbasharat-o-o/rma-system@sha256:26b12d311854bb8c09492d4f2342da67e9a23ec9ddc954a6e79a35ee27f6358b
ln -sfn /opt/rma-system/releases/v0.4.5-e9381a1 /opt/rma-system/app
```

The directory was populated with `git archive e9381a1` over SSH, then the reviewed candidate Compose file was copied into it; commands and exact remote destinations are in `~/rms-setup/PROGRESS.md`. The above commands describe this completed rollout and must not be blindly rerun for a future version.

**Verified — start app, then worker, with the current pinned Compose file:**

```sh
docker compose --env-file /opt/rma-system/.env -p rma-system -f /opt/rma-system/app/docker-compose.yml up -d --no-build --no-deps app
docker compose --env-file /opt/rma-system/.env -p rma-system -f /opt/rma-system/app/docker-compose.yml up -d --no-build --no-deps worker
```

**Verified — read-only checks:**

```sh
docker ps --filter name=rma-system
curl -fsS http://127.0.0.1:23001/api/health
curl -fsS http://127.0.0.1:23001/api/version
```

Verify image IDs and worker mounts, public and local login, authenticated RMA detail and capture if authorized credentials exist, queue and worker logs. A health response only checks database connectivity. Paid-provider tests require a numeric approved spend cap. The previous manifest errors concerned `/rmas/[id]` and `/rmas/[id]/capture`; verify the relevant runtime assets and authenticated behavior, not just HTTP status from an anonymous request.

## Rollback considerations

Following the verified rollout and owner-authorized removal of legacy 0.4.1 images and the `/opt/rma-system/releases/v0.4.1` directory, an instantaneous switch back to local 0.4.1 images is no longer applicable. If a rollback to 0.4.1 is required in the future:
1. Re-extract the preserved release archive (`release-v0.4.1.tar.gz` from `~/rms-backups/20261028T145724Z/`) into `/opt/rma-system/releases/v0.4.1`.
2. Repull or load the historical 0.4.1 images: `ghcr.io/arslanbasharat-o-o/rma-system:0.4.1` and `:worker-0.4.1`.
3. Update symlink `ln -sfn /opt/rma-system/releases/v0.4.1 /opt/rma-system/app` and start services with `docker compose`.

Then verify image IDs, mounts, health, login and logs. Do not restore database backups over production merely to roll back application images: later writes would be lost. Suspected data corruption requires an explicit decision and a separate reviewed restoration and reconciliation plan.
