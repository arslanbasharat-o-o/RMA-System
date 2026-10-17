# Production reference map

This map records the files that make up the deployable path and the tests or
documents that exercise each boundary. Generated directories such as `.venv`,
`__pycache__`, `.mypy_cache`, and `data/images` are outside the source tree.

## Runtime entry points

| Area | Files | References |
| --- | --- | --- |
| Fastify process | `src/server.ts`, `src/http/app.ts` | `package.json:start`, `Dockerfile`, Compose `lens-api` |
| Configuration | `src/config.ts`, `.env.example` | `src/server.ts`, `docker-compose.yml`, README/operations docs |
| HTTP compatibility | `src/http/app.ts`, `src/http/uploads.ts`, `src/http/openapi.ts` | `test/app.test.ts`, RMA provider, `docs/api.md` |
| Authentication/admission | `src/http/security.ts`, `src/services/metrics.ts` | `src/http/app.ts`, `test/security.test.ts`, `test/app.test.ts` |
| Images | `src/storage/image-store.ts` | `src/http/app.ts`, `src/storage/job-store.ts`, worker shared volume |
| Jobs/batches | `src/storage/job-store.ts`, `src/storage/job-persistence.ts` | `src/http/app.ts`, `test/durable-backend.test.ts`, Redis integration test |
| API dispatch | `src/workers/worker-pool.ts`, `src/queue/in-memory-queue.ts`, `src/queue/redis-queue.ts`, `src/queue/scrapling-dispatch-queue.ts` | `src/http/app.ts`, `test/queue.test.ts`, `test/durable-backend.test.ts` |
| Scrapling result protocol | `src/adapters/scrapling-redis-adapter.ts`, `src/queue/scrapling-contract.ts` | Python `scrapling_worker/contract.py`, worker integration smoke, `docs/scrapling-worker.md` |
| Parser/cache | `src/parser/lens-parser.ts`, `src/services/cache.ts`, `src/services/hash.ts` | `test/parser.test.ts`, `test/app.test.ts`, Python parser fixtures |
| Remote URLs | `src/services/remote-image.ts` | `test/security.test.ts`, `docs/security.md` |

## Python worker

| Area | Files | References |
| --- | --- | --- |
| Console/runtime | `scrapling_worker/__main__.py`, `scrapling_worker/worker.py` | `pyproject.toml`, `Dockerfile.scrapling-worker`, Compose worker |
| Modes/browser | `scrapling_worker/config.py`, `scrapling_worker/adapters.py`, `scrapling_worker/browser_smoke.py` | `tests/test_adapter.py`, `tests/test_worker.py`, worker image build |
| Contract/parser | `scrapling_worker/contract.py`, `scrapling_worker/parser.py` | `tests/test_parser.py`, `tests/test_worker.py`, TypeScript adapter |
| Fixtures | `scrapling_worker/fixtures/*.html` | Python parser/worker tests; fixture Compose mode |

## Verification and delivery

- Offline command: `make check`.
- Real Redis recovery test: `test/durable-recovery.integration.test.ts`, enabled
  with `REDIS_URL` and isolated Redis.
- Cross-language fixture smoke: `scripts/cross-language-smoke.ts`.
- Offline valid-image benchmark: `scripts/offline-benchmark.ts` and
  `reports/offline-benchmark.json`.
- CI: `.github/workflows/ci.yml`.
- Containers: `Dockerfile`, `Dockerfile.scrapling-worker`, `docker-compose.yml`.
- Operational/compliance references: `docs/operations.md`, `docs/security.md`,
  `docs/research.md`, `docs/rma-integration.md`, and `docs/architecture.md`.

## Removed from the production graph

- `src/queue/redis-streams-queue.ts`: removed because it implemented a
  TypeScript consumer group on the same stream as the Python worker, which could
  race or strand jobs. `ScraplingDispatchQueue` now publishes durable entries
  and only polls them locally.
- `src/queue/bullmq-compatible.ts`: removed because no production, test, script,
  or documentation reference remained and the project has no BullMQ dependency.
