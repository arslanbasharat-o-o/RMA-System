#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEPLOY_ROOT="/opt/rma-system"
APP_DIR="${DEPLOY_ROOT}/app"
BACKUP_DIR="/var/backups/rma-system"
STORAGE_DIR="/var/lib/docker/volumes/rma-system_storage_data/_data"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="${BACKUP_DIR}/rma-db-${TIMESTAMP}.dump"
STORAGE_FILE="${BACKUP_DIR}/rma-storage-${TIMESTAMP}.tar.gz"
MANIFEST="${BACKUP_DIR}/rma-${TIMESTAMP}.sha256"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
DB_TMP="${DB_FILE}.tmp"
STORAGE_TMP="${STORAGE_FILE}.tmp"
trap 'rm -f "${DB_TMP}" "${STORAGE_TMP}"' EXIT

docker compose \
  --env-file "${DEPLOY_ROOT}/.env" \
  -p rma-system \
  -f "${APP_DIR}/docker-compose.yml" \
  exec -T postgres pg_dump --username=postgres --format=custom --dbname=rma_system > "${DB_TMP}"
test -s "${DB_TMP}"
docker exec -i rma-system-postgres-1 pg_restore --list < "${DB_TMP}" > /dev/null
mv "${DB_TMP}" "${DB_FILE}"

tar -czf "${STORAGE_TMP}" -C "${STORAGE_DIR}" .
tar -tzf "${STORAGE_TMP}" > /dev/null
mv "${STORAGE_TMP}" "${STORAGE_FILE}"

sha256sum "${DB_FILE}" "${STORAGE_FILE}" > "${MANIFEST}"
printf 'RMA backup complete: %s (database %s bytes, storage %s bytes)\n' \
  "${TIMESTAMP}" "$(stat -c %s "${DB_FILE}")" "$(stat -c %s "${STORAGE_FILE}")"
