# Google Lens service

The [Google Lens API repository](https://github.com/arslanbasharat-o-o/Google-Lens-API)
is the single maintained source for the authenticated API and Scrapling worker images. The worker uses
Google Chrome through Scrapling. RMA reaches the API over its existing Docker
network; the diagnostic port binds to loopback and Redis stays private.

## Production settings

Keep the existing untracked environment file and its current database, session,
OpenAI, Lens API, and image-storage credentials. The API and RMA app share the
same private Lens key.

```dotenv
LENS_PROVIDER=self_hosted_lens
LENS_TIMEOUT_MS=10000
LENS_API_BASE_URL=http://lens-api:3000
LENS_API_KEY=<private Lens service key>
LENS_API_MODE=upload_search
LENS_API_POLL_INTERVAL_MS=250
LENS_SEARCH_PROMPT="Identify exact phone display screen model. Inspect notch vs Dynamic Island cutout, length and width dimensions, aftermarket IC chip markings (e.g. SQ9, JK, RJ), flex cable layout, connector pin count, and laser etched QR/text codes to distinguish Pro vs Pro Max and standard vs Plus models."
LENS_API_IMAGE=ghcr.io/arslanbasharat-o-o/google-lens-api:1.0.22
LENS_WORKER_IMAGE=ghcr.io/arslanbasharat-o-o/google-lens-scrapling-worker:1.0.22
RMA_DOCKER_NETWORK=rma-system_rma_network
```

The API retains search images for at most 15 minutes. RMA scores up to 30
ranked matches and keeps uncertain model evidence in the review queue. The
worker reports Google verification or browser failures; it does not bypass
those checks.

## Start and verify

On the VPS, check out the selected Google Lens API release at
`/opt/rma-lens/app`. Start or update the Lens stack using the existing RMA
environment file:

```bash
docker compose --project-name rma-lens --env-file /opt/rma-system/.env \
  -f /opt/rma-lens/app/docker-compose.production.yml up -d
curl -fsS http://127.0.0.1:23900/readyz
```

After the API and browser worker report ready, update only the RMA app and
background worker so they receive the new provider configuration:

```bash
docker compose --env-file .env up -d --no-deps app worker
```

This does not require a database migration. It preserves the existing
PostgreSQL, Redis, and image-storage volumes. Check HTTPS, `/api/health`, the
Settings provider health, container health, and recent logs before processing a
new RMA.

## Rollback

Pin the RMA app, worker, Lens API, and Scrapling worker to their previous image
tags, then recreate only those services. Do not recreate or remove PostgreSQL,
Redis, or image-storage volumes during rollback. Verify API and RMA health
before resuming image processing.
