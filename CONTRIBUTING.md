# Contributing

Thank you for helping improve the RMA Display Identification System. Keep changes focused, describe their operational impact, and preserve customer-data and queue boundaries.

## Development setup

Requirements: Node.js 24, npm, and PostgreSQL 16. Use a disposable local database; never point development or test commands at production.

```bash
git clone https://github.com/arslanbasharat-o-o/RMA-System.git
cd RMA-System
npm ci
createdb rma_system_dev
cp .env.example .env.local
```

Edit `.env.local` with the local database URL, a unique `SESSION_SECRET`, and a unique `INITIAL_ADMIN_PASSWORD` of at least 16 characters. Leave `LENS_PROVIDER=mock` and provider keys empty. Load the settings into your shell before running scripts that connect to PostgreSQL:

```bash
set -a
. ./.env.local
set +a
npm run db:migrate
npm run db:seed
npm run dev
```

Start the background worker in a second terminal after loading the same environment values:

```bash
set -a
. ./.env.local
set +a
npm run worker
```

## Tests and checks

Use a separate disposable database for integration and browser tests. Set `DATABASE_URL` to that database, set `NODE_ENV=test`, and keep `LENS_PROVIDER=mock`. Load only the synthetic test fixtures with:

```bash
NODE_ENV=test npm run test:fixtures
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The fixture loader refuses to run outside test mode. The CI workflow creates its own PostgreSQL service, generates temporary credentials, uses mock recognition, and runs desktop and mobile camera-intake browser checks. Do not add CI credentials that can reach production. Tests must not call OpenAI, SerpApi, Google Lens, or another paid provider.

## Pull requests

- Explain the problem, the change, and the checks you ran.
- Include screenshots only when they contain synthetic or properly sanitized data.
- Keep dependency updates focused; review upstream changes and run relevant checks before merging.
- Do not add production credentials, customer records, display images, private catalog files, database dumps, or deployment keys.
- Do not add a project license or publish a container image without an explicit licensing decision.
- Do not deploy production from a pull request. Production rollout remains a separate, reviewed process.

The repository's branch protection requires the `validate` CI check on pull requests to `main`.
