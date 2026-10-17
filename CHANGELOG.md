# Changelog

Changes to the public source are recorded here.

## [Unreleased]

## [0.2.7] - 2026-10-17

### Fixed

- Remove the duplicate desktop sidebar toggle so the navigation has one clear collapse/expand control.

## [0.2.6] - 2026-10-17

### Changed

- Refresh the dashboard, navigation, RMA intake and inspection screens, catalogs, reports, login, and settings with consistent responsive layouts and motion.
- Add searchable selection controls, action menus, persistent sidebar collapse, page titles, and application branding.
- Show actual dashboard activity trends and keep unavailable trends hidden.

### Fixed

- Preserve processing updates, connection recovery, and the operator-corrected model label in the redesigned inspection drawer.
- Allow bounded, configurable visual-search timeouts during provider slowdowns; record useful failure messages and run text recognition independently of visual search.
- Show saved partial recognition results and explicit retry actions; keep inspection open when a retry cannot be queued.
- Support keyboard navigation, labels, disabled options, and form values in the new dropdown controls.
- Prevent stale list responses and repeated review shortcut submissions.
- Remove sample login credentials and replace the unsupported password-reset flow with administrator contact instructions.

## [0.2.5] - 2026-10-14

### Fixed

- Refresh recognition results in an open inspection drawer, including after a phone reconnects or returns to the page, while preserving unsaved corrections.
- Read live RMA and item responses without browser or proxy caching; recover interrupted reads with bounded retries.
- Preserve explicit operator model corrections during automated retries, while retaining the new recognition evidence for review.
- Preserve the original source title and rank for visual recognition evidence and show only the latest visual run in the inspection drawer.
- Keep iPhone Pro and Pro Max identities distinct, recognize abbreviated model listings, and require review when visual sources disagree.
- Preserve recognition confidence during catalog resolution and leave assembly selection unresolved when several catalog SKUs share the same model.
- Keep the explicitly selected photo side during capture and phone photo selection; serialize uploads and show duplicate photos only once with their saved side.

### Verification

- Added offline recognition replay, catalog-boundary, evidence API, and live drawer regression coverage.
- Release validation covers desktop Chrome, mobile Chrome, and mobile Safari intake and result updates using synthetic media and mocked recognition providers.

## [0.2.4] - 2026-10-11

### Fixed

- Retried recognition queue publication when an identical image had already been saved but the first queue attempt failed.
- Kept a display in its upload-ready state until the durable queue transaction succeeds, so a temporary queue outage can recover on retry.

### Verification

- Added a regression test for a queue outage followed by an idempotent image-upload retry.
- The full desktop and mobile browser suite passed with mock recognition providers; no paid recognition request was made.

## [0.2.3] - 2026-10-11

### Security

- Key login throttling to the reverse proxy's trusted client address instead of the client-controlled forwarded-address chain.
- Expire stale login-rate entries and cap tracked addresses to keep process memory bounded.

### Fixed

- Prevented stale review-drawer requests from replacing correction notes entered while item data loads.

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
