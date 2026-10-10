# Release process

Releases are created from reviewed commits on `main`. A GitHub Release does not deploy the production service.

## Prepare a release

1. Review merged pull requests and the changes since the last published tag.
2. Update `package.json`, `package-lock.json`, and `release.json` to the same `MAJOR.MINOR.PATCH` version.
3. Move the completed entries in `CHANGELOG.md` from `Unreleased` into the versioned section and record the publication date.
4. Run the CI checks: migrations and synthetic fixtures against a disposable PostgreSQL database, TypeScript, ESLint, npm audit, Vitest, production build, Docker image build, camera-intake checks, and the full desktop/mobile Playwright suite.
5. Open and merge the version and changelog change through the normal protected-branch workflow.
6. Create an annotated tag on the verified `main` commit using `vMAJOR.MINOR.PATCH` and push that tag.

The tag-triggered workflow re-runs validation, checks the tag against both version files, and creates GitHub-generated notes from the actual commit and pull-request history. A rerun skips an already-published release. Do not reuse a version tag for different source.

## Container distribution

The project is distributed under the MIT License. After the full release validation passes, the tag workflow publishes the application and worker images to GitHub Container Registry:

- `ghcr.io/arslanbasharat-o-o/rma-system:<version>` and `:latest` for the web application
- `ghcr.io/arslanbasharat-o-o/rma-system:worker-<version>` and `:worker-latest` for the queue worker

The package must be set to public in GitHub Packages after its first successful publication. Compose can use the published images by setting `RMA_APP_IMAGE` and `RMA_WORKER_IMAGE` to the desired tags, then running `docker compose pull` followed by `docker compose up -d --no-build`. No PostgreSQL data, uploaded images, or runtime secrets belong in an image.

## Production deployment

Deployment is separate from release publication. Follow [DEPLOYMENT.md](../DEPLOYMENT.md), verify database and image-storage backups, preserve existing volumes and secrets, and use the separately reviewed production rollout procedure. Release automation does not connect to or deploy the production host.
