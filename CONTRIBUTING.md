# Contributing

## Before opening a change

- Describe the user-visible problem and keep changes focused.
- Preserve workflow and data-integrity behavior.
- Never include production credentials, customer data, private images, database dumps, or private catalog workbooks.
- Use a disposable local database and mock recognition providers for tests.
- Never point tests at production or use paid recognition APIs in CI.

## Development checks

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Database-backed tests need a disposable PostgreSQL instance. Run `npm run db:migrate`, `npm run db:seed`, and `NODE_ENV=test npm run test:fixtures` first. Playwright also requires an isolated database and `LENS_PROVIDER=mock`.

## Pull requests

Include a summary and checks performed. Add screenshots only when they contain synthetic or sanitized data. Do not add a license, production deployment, or secret values through a pull request.
