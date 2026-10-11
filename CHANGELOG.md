# Changelog

Changes to the public source are recorded here.

## [0.2.3] - 2026-10-11

### Security

- Key login throttling to the reverse proxy's trusted client address instead of the client-controlled forwarded-address chain.
- Expire stale login-rate entries and cap tracked addresses to keep process memory bounded.

## [0.2.2] - 2026-10-11

### Changed

- Rewrote the repository introduction in plain language and made release, license, setup, and container links easy to find.
- Added distinct, task-focused descriptions to the web and worker container packages.

## [0.2.1] - 2026-10-11

### Changed

- Added human-readable descriptions, MIT license metadata, and source details to the web and worker container images.
- Added a release-notes file workflow and a clear package install section to the project README.

## [0.2.0] - 2026-10-11

### Added

- Staff profile and password management with session revocation after password changes.
- Mobile camera intake for multiple display photos, with a file-upload fallback.
- A customer-information requirement before display capture and image processing begins.

### Changed

- Refined dashboard metrics, navigation, mobile layouts, and recognition review controls.
- Standardized the application, package, and future Git tag version on Semantic Versioning.

### Security

- Kept recognition providers mocked in CI and documented private-data boundaries for contributors.

## [Unreleased]
