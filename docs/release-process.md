# Release process

Releases are created from reviewed commits on `main`. A GitHub Release does not deploy the production service.

## Prepare a release

1. Review merged pull requests and the changes since the last published tag.
2. Update `package.json`, `package-lock.json`, and `release.json` to the same `MAJOR.MINOR.PATCH` version.
3. Move the completed entries in `CHANGELOG.md` from `Unreleased` into the versioned section and record the publication date.
4. Run the CI checks: migrations and synthetic fixtures against a disposable PostgreSQL database, TypeScript, ESLint, npm audit, Vitest, production build, Docker image build, camera-intake checks, and the full desktop/mobile Playwright suite.
5. Publish the version and changelog changes on `main`, then confirm its required checks pass.
6. Create an annotated tag on that verified `main` commit using `vMAJOR.MINOR.PATCH` and push the tag.

The tag-triggered workflow re-runs validation, checks the tag against all version files, and publishes the release notes in `docs/releases/<tag>.md` when that file exists. GitHub-generated notes are the fallback. A rerun skips an already-published release. Do not reuse a version tag for different source.

## Container distribution

The project is distributed under the MIT License. After the full release validation passes, the tag workflow publishes the application and worker images to GitHub Container Registry. OCI metadata labels provide a human-readable description, source repository, version, revision, and license on the package page:

- `ghcr.io/arslanbasharat-o-o/rma-system:<version>` and `:latest` for the web application
- `ghcr.io/arslanbasharat-o-o/rma-system:worker-<version>` and `:worker-latest` for the queue worker

The standalone [Google Lens API repository](https://github.com/arslanbasharat-o-o/Google-Lens-API)
publishes the authenticated API and Scrapling Chrome worker under its own package names and version.

Confirm that the linked package is public after its first successful publication. Compose can use the published images by setting `RMA_APP_IMAGE` and `RMA_WORKER_IMAGE` to the desired tags, then running `docker compose pull` followed by `docker compose up -d --no-build`. No PostgreSQL data, uploaded images, or runtime secrets belong in an image.

## Production deployment

Deployment is separate from release publication. Follow [DEPLOYMENT.md](../DEPLOYMENT.md), verify the existing persistent volumes and rollback images, preserve secrets, and use the separately reviewed production rollout procedure. Image-only releases do not need a database migration. Release automation does not connect to or deploy the production host.
