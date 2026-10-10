# Dependency maintenance

Reviewed on 2026-10-10 against the open Dependabot pull requests and their CI results. The repository runtime is Node.js 24. Routine npm and GitHub Actions patch/minor updates are grouped weekly; major upgrades stay separate for compatibility review.

| Update | Decision | Reason |
| --- | --- | --- |
| `actions/checkout` 4 → 7.0.1 | Adopted in CI and release workflows, pinned to the upstream commit SHA | The current CI run warned that v4 uses the deprecated Node 20 action runtime. The v7.0.1 upstream tag resolves to `3d3c42e5aac5ba805825da76410c181273ba90b1`. |
| `actions/setup-node` 4 → 7.0.0 | Adopted in CI and release workflows, pinned to the upstream commit SHA | The current CI run warned that v4 uses the deprecated Node 20 action runtime. The v7.0.0 upstream tag resolves to `820762786026740c76f36085b0efc47a31fe5020`. |
| `argon2` 0.41.1 → 0.45.1 | Deferred | The update is compatible with the Node 24 runtime and its Dependabot check passed, but the new release changes the native install process. Validate it on the current `main` tree before merging. |
| `openai` 4.x → 7.30.0 | Deferred | This is a major SDK update in the OCR provider path. It needs a focused compatibility review of image inputs, response parsing, and structured output with mocked offline tests. Do not validate by calling a paid API. |
| `recharts` 2.x → 3.10.1 | Deferred | This is a major chart API update. It needs a visual dashboard review and focused rendering checks before adoption. |
| `@types/node` 22.x → 26.6.4 | Deferred | The proposed major types target a newer Node major than the application's Node 24 runtime. Keep the types aligned with the supported runtime. |
| `pg-boss` 10.x → 12.37.0 | Deferred | This is a major queue upgrade that advances its schema to version 45 and runs a migration. Its current Dependabot CI fails TypeScript because v12 no longer has the default export used by `src/lib/queue/index.ts`; related callback types also need changes. Do not upgrade without isolated queue-migration and job-processing validation. |

The action pins were verified against the upstream Git reference API. Dependabot remains enabled for security updates. GitHub secret scanning and push protection are enabled; a local Gitleaks scan of the current history found no leaks.
