# Deployment

This guide covers a new Docker deployment. For an existing production system, preserve its current secrets and named volumes, verify recovery before changing images, and inspect the queue before starting a worker after a long outage.

## Requirements

- Linux host with Docker Engine and Compose plugin
- DNS records for the service hostname
- HTTPS reverse proxy (Caddy is available as an optional Compose profile)
- Persistent PostgreSQL and private image storage volumes

## Configure secrets

Create `.env` with owner-only permissions. Do not commit it.

```dotenv
NODE_ENV=production
APP_URL=https://rma.example.com
SESSION_SECRET=<unique output from openssl rand -base64 32>
POSTGRES_PASSWORD=<unique database password>
LENS_PROVIDER=serpapi_lens
SERPAPI_API_KEY=<provider key>
# For the self-hosted adapter, use these instead of the two SerpApi settings:
# LENS_PROVIDER=self_hosted_lens
# LENS_API_BASE_URL=https://lens.internal/api
# LENS_API_KEY=<self-hosted service key>
# LENS_API_MODE=upload_search
OPENAI_API_KEY=<provider key>
OPENAI_VISION_MODEL=gpt-4o-mini
WORKER_CONCURRENCY=1
BUSINESS_TIMEZONE=UTC
```

Compose assembles `DATABASE_URL` from `POSTGRES_PASSWORD`. Set `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (16+ unique characters), and `INITIAL_ADMIN_NAME` only for the initial seed. Remove the initial password from the environment after the first account is created.

```bash
chmod 600 .env
```

### Visual provider choice

`LENS_PROVIDER=serpapi_lens` keeps the existing SerpApi integration. To switch
reversibly to a self-hosted Lens-compatible service, set
`LENS_PROVIDER=self_hosted_lens`, `LENS_API_BASE_URL`, and `LENS_API_KEY`.
The adapter sends the key as both a bearer authorization and `X-API-Key` header.

With `LENS_API_MODE=upload_search` (the default), the base URL is treated as a
service root and the worker sends `POST <base>/upload`, then
`GET <base>/search?image_id=...` with the optional `q` filter. Set
`LENS_API_MODE=direct` when the base URL itself is the image-search endpoint;
the worker sends the image as multipart form data in one `POST`. Both response
shapes use the SerpApi-compatible `visual_matches` array.

## Start services

```bash
docker compose up -d --build postgres app
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

Before starting a worker on an existing database, inspect pending queue rows and determine whether processing them is intended. This avoids unexpected provider charges after a restart. Start the worker after the check:

```bash
docker compose up -d worker
```

If a dedicated Caddy container is needed and host ports 80/443 are available:

```bash
docker compose --profile standalone-proxy up -d caddy
```

Otherwise, configure the existing reverse proxy to forward HTTPS to the app. Compose binds the app to loopback port 23001; PostgreSQL has no published host port.

The proxy must overwrite `X-Real-IP` with the connecting client address. The login rate limiter trusts that header and deliberately ignores client-supplied `X-Forwarded-For` values. Do not expose the app port publicly or forward an untrusted `X-Real-IP` header from clients.

## Verify

```bash
docker compose ps
curl -fsS https://rma.example.com/api/health
```

Confirm database readiness, app health, worker logs, TLS, authentication, and persistent storage. Test recognition only within approved provider budgets. CI does not call paid providers.

## Backups and recovery

`scripts/backup-production.sh` writes PostgreSQL and image-volume archives under `/var/backups/rma-system`; it does not prune old copies. The destination is local to the deployment host and the files are unencrypted. They do not provide disaster recovery by themselves.

Before deleting any backup, create an encrypted off-server copy of both database and image data, verify checksums, and restore into an isolated environment. Do not restore over a live database without a reviewed maintenance plan. Preserve Docker volumes during source updates.

## Updates

Review a release and back up database and image storage before deployment. Build and start the app, apply schema setup when required, verify health, and start the worker only after checking the queue. This repository has no automatic production deployment workflow.
