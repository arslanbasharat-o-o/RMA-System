# Self-hosted Google Lens service

The repository includes an authenticated Lens-compatible API and a separate
Scrapling worker that uses installed Google Chrome. The RMA app reaches the API
over the existing Docker network. The diagnostic host port binds to loopback;
the worker and Redis are not published.

## Production configuration

Add these values to the existing untracked RMA `.env` file. Generate a unique
key and use the same value for the API and RMA app:

```dotenv
LENS_PROVIDER=self_hosted_lens
LENS_TIMEOUT_MS=10000
LENS_API_BASE_URL=http://lens-api:3000
LENS_API_KEY=<unique 64-character hex key>
LENS_API_MODE=upload_search
LENS_API_POLL_INTERVAL_MS=1000
LENS_API_IMAGE=ghcr.io/arslanbasharat-o-o/rma-system-lens-api:0.2.8
LENS_WORKER_IMAGE=ghcr.io/arslanbasharat-o-o/rma-system-lens-worker:0.2.8
RMA_DOCKER_NETWORK=rma-system_rma_network
```

Keep the existing database, session, SerpApi, OpenAI, and image-storage
credentials unchanged. The worker does not attempt to solve Google verification
or bot challenges. It reports those states as failures so the item remains
available for staff review.

## Start and connect the service

From the deployment checkout, start the API stack first:

```bash
chmod 600 .env
docker compose --project-name rma-lens \
  --env-file .env \
  -f services/lens-api/docker-compose.production.yml up -d
curl -fsS http://127.0.0.1:23900/readyz
```

Wait for `/readyz` to report a ready Scrapling worker. Then recreate only the
application and RMA worker so they receive the self-hosted provider settings:

```bash
docker compose --env-file .env up -d --no-deps app worker
```

This provider change needs no database migration. It preserves the existing
PostgreSQL and image-storage volumes. Check the Settings provider health, app
and worker status, and Lens worker logs before processing a new RMA.

The API keeps uploaded search images in its private volume for at most 15
minutes. Redis is internal to the Lens stack. The API is rate-limited and the
RMA app polls status once per second. The Chrome worker has an 8-second browser
deadline, and the RMA provider has a 10-second overall deadline.

## Roll back

Set `LENS_PROVIDER` back to the provider that was active before the change and
recreate only `app` and `worker` with `--no-deps`. Existing RMA records and
images remain in their original volumes. Stop the Lens stack after the previous
provider has been restored and verified.
