# Changelog

Changes to the public source are recorded here.

## [0.3.12] - 2026-10-18

### Fixed

- Connected `SelfHostedLensProvider` to `cleanVisualCandidatesWithOpenAi` to enable decisive `gpt-4o-mini` arbitration for ambiguous visual splits.
- Enhanced OpenAI cleaner prompt rules to decisively select the leading smartphone display model from candidate consensus, eliminating "Unidentified Apple Display" and preventing false iPad classifications.
- Added distributor title sanitization (`cleanCatalogModelName`) and OLED technology guards (`sanitizeDisplayTechnology`) to strip "with frame" prefixes and suppress erroneous "(LCD)" tags on OLED flagships.
- Bumped `VISUAL_DECISION_POLICY` to `v3` to bypass historical conflicting/unresolved snapshots and ensure clean re-evaluations.
- Streamlined RMA shipment status badge to eliminate duplicate spinner and clock icon confusion.

### Verification

- All 22 test suites (146 tests) pass with 100% success rate.
- TypeScript compilation and ESLint pass cleanly.

## [0.3.11] - 2026-10-18

### Fixed

- Fixed Display Catalog infinite loading trap caused by abort-signal handling, and added server-side pagination with search filtering across 2,400+ display items.
- Enhanced recognition synthesizer to resolve multi-variant catalog SKUs (e.g., Soft OLED, Hard OLED, COF) using candidate titles and technology keywords rather than dropping internal SKU.
- Deduplicated UI loading spinners in display inspection drawer and unified status badge terminology across the RMA view.
- Added recognized internal SKU badges to RMA items table and mobile drawer with one-click copy.

### Verification

- Comprehensive unit tests for multi-variant SKU resolution and catalog containment matching pass.
- Playwright E2E and browser test suites pass across desktop, mobile Chrome, and Safari.

## [0.3.10] - 2026-10-18

### Added

- Magic-byte image inspection in `SelfHostedLensProvider` detecting PNG, JPEG, WebP, and GIF formats from byte signatures, preventing HTTP 400 validation errors on client MIME/extension mismatches.
- End-to-end `noCache` option in `DisplayVisualRecognitionContext` and `requestSearch`, enabling explicit live Google Lens re-queries while maintaining sub-40ms cached duplicates by default.

### Verification

- Validated on 15 distinct hardware component images across sequential initial recognition, sub-40ms cached duplicates, and live re-queries.
- Verified 5-user concurrent burst scaling under live load without queue drops or timeouts.

## [0.3.9] - 2026-10-18

### Fixed

- Ignore automated image decisions saved by older recognition policies so legacy conflicts cannot suppress a fresh Google Lens search.
- Reuse current-policy unresolved results for identical image bytes, preventing repeated Lens requests for the same uncertain photo.
- Keep conflicting model results in manual review while combining the fresh Lens overview and candidate listings for the reviewer.

### Verification

- Regression tests cover legacy conflict refresh, unresolved same-image reuse, confidence updates, and candidate preservation on conflicts.
- All 143 unit and integration tests, TypeScript, ESLint, production build, and the mobile end-to-end workflow pass locally.
- Live Lens checks use the visual pipeline only; no OCR or paid AI calls are made by release validation.

## [0.3.8] - 2026-10-18

### Fixed

- Treat stored "Unidentified" assembly labels as unidentified in the RMA table and review drawer instead of showing them as model suggestions.

### Verification

- Regression coverage uses the exact "Unidentified Apple Display" value shown by live items.
- Full local and GitHub release validation is the publication gate.

## [0.3.7] - 2026-10-18

### Fixed

- Count only reviewed, verified model selections in the dashboard's model totals; machine suggestions remain visible as suggestions until an operator confirms them.
- Remove the heuristic match percentage from item review and label uncertain or unidentified results clearly on desktop and mobile.
- Preserve a Lens provider error when a prior same-image decision is reused, so Google challenges and timeouts are visible instead of being reported as successful recognition.

### Verification

- All 134 unit and integration tests passed; TypeScript and ESLint passed.
- Desktop Chrome and Pixel 7 browser checks passed for RMA result labels, camera intake, and dashboard layouts at 320, 768, 1024, and 1440 pixels.
- Browser and provider tests use synthetic images and the mock Lens provider; no paid recognition API was called in local validation.

## [Unreleased]

## [0.3.6] - 2026-10-18

### Fixed

- Reuse legacy visual recognition results for the exact same image even when older releases did not store image checksums, while rejecting filename or upload-time mismatches.
- Treat conflicting model evidence from historical runs as review-required so reprocessing cannot silently replace a model with a different guess.
- Preserve legacy result fields when reading recognition evidence created before stable-decision snapshots.
- Expose the mobile navigation drawer's expanded state to assistive technology and retry the release workflow's early menu interaction if it lands before client hydration.

### Verification

- All 133 unit and integration tests passed; TypeScript, ESLint, optimized production build, and the mobile 36-step workflow passed locally on disposable QA databases.
- Lens recognition tests use mocks and fixtures; no paid recognition API was called. Full release CI remains the publication gate.

## [0.3.5] - 2026-10-18

### Fixed

- Align the complete desktop and mobile browser suite with the conservative recognition result: an unknown vendor remains unassigned and needs review even when the display is a possible candidate.

### Verification

- The v0.3.4 candidate passed 269 browser checks but was not published because this stale assertion failed on desktop and mobile Chrome. This release includes that corrected assertion and the v0.3.4 source changes.

## [0.3.4] - 2026-10-18 (unpublished candidate)

### Fixed

- Reuse an operator-confirmed model or a corroborated visual decision for identical image bytes across RMA items. A later weak Lens response cannot erase a supported suggestion, and conflicting credible models go to review.
- Keep an explicit reprocess able to collect fresh evidence while recording a conflict instead of silently replacing a previous model.
- Select the named mobile navigation drawer in the complete browser workflow so unrelated dialogs cannot intercept the Dashboard step.

### Verification

- Local checks passed: 130 unit and integration tests, TypeScript, ESLint, production build, and the complete 36-step mobile Chrome workflow against an isolated database.
- Lens recognition tests use mocks and fixtures; they do not call paid recognition APIs.
- The v0.3.3 candidate tag was not published after full release validation found the mobile workflow selector failure. This release supersedes that candidate.

## [0.3.3] - 2026-10-18 (unpublished candidate)

### Added

- Read the visible Google AI Overview when the Lens page has an explicit overview heading, and pass it to the RMA scorer as optional supporting evidence.
- Score up to 30 independently attributable Lens listings and require manual review when a specific overview conflicts with listing consensus or names multiple unhedged models.
- Replace repetitive skeletons with accessible loading and status messages across intake, dashboards, catalogs, reports, settings, and review screens.

### Fixed

- Prevent low-confidence visual guesses from becoming catalog identities or model-bearing display labels; retain exact physical part-number matches.
- Keep the loading inspection drawer full-height and expose its loading state as a dialog on mobile and desktop.
- Replace stale skeleton and spinner selectors in the full browser suite with checks for the accessible loading status and busy button state.

### Release note

- The v0.3.2 and v0.3.3 candidate tags were not published. Version v0.3.4 includes these changes and the corrected full mobile workflow.

### Verification

- Local checks: 125 unit and integration tests, lint, TypeScript checks, and production build passed.
- Targeted Playwright checks passed for camera intake, responsive navigation, and live recognition on desktop Chrome, mobile Chrome, Safari, and mobile Safari; 3 desktop-only checks were skipped on mobile profiles.
- All Google Lens and recognition test requests use fixtures or mocks; no paid recognition API was called.

## [0.3.1] - 2026-10-17

### Fixed

- Use Google Lens' displayed publisher when its result link is a Google redirect, while collapsing regional marketplace labels so one seller cannot count multiple times.
- Keep Google-origin labels and close or conflicting model evidence out of confident Apple display suggestions.

### Verification

- Add regression coverage for Google redirects, regional marketplace aliases, and Google labels.
- Pass 118 unit tests, lint, TypeScript checks, and a production build.

## [0.3.0] - 2026-10-17

### Changed

- Move the Google Lens API and Scrapling Chrome worker into their own public repository and versioned container packages.
- Keep the RMA deployment configuration pointed at the standalone API while removing its duplicated source tree.
- Keep the 20 highest-ranked Lens matches for staff review and require independently attributable display listings before a model suggestion can be confident.
- Show per-display recognition progress and completed results during camera intake so operators can continue to the next display without waiting on the details page.

### Removed

- Remove the unused SerpApi provider, settings, and credential configuration.

### Verification

- Keep uncertain or weakly sourced Apple variant matches in manual review; no model is marked as a certain match by the Lens title scorer.
- Keep production database and uploaded-image volumes unchanged during the release.

## [0.2.9] - 2026-10-17

### Fixed

- Add a Redis healthcheck so the production Lens API and Scrapling worker start only after their queue backend is ready.
- Exercise the production Redis health dependency in CI to catch Compose startup failures before a release.

### Verification

- Validate the production Compose Redis health dependency with a real local startup check and an automated CI smoke test.

## [0.2.8] - 2026-10-17

### Added

- Package the authenticated self-hosted Lens API and Scrapling Chrome worker with the RMA source and publish versioned container images.
- Add a production Compose stack that keeps the Lens API private to the existing RMA Docker network and exposes only a loopback health port.
- Show the self-hosted Lens API and worker readiness in provider settings without exposing the service key.

### Fixed

- Upload extensionless RMA image-store files to Chrome with the real image filename and MIME type detected from their bytes.
- Reduce provider status polling to one request per second to stay within the Lens API rate limit.
- Require exact, corroborated model evidence before treating Apple display suggestions as confident; compatibility listings and conflicting or unparseable results stay in human review.
- Keep environment-managed production provider settings authoritative over saved UI settings.

### Verification

- The real RMA provider completed 15 runs over 13 production-stored image files with zero request failures; slowest cold run was 3.541 seconds. Repeated content used the service cache.
- Local RMA checks passed: typecheck, lint, and 121 tests. Local Lens API checks passed: typecheck, build, audit, 50 API tests, 26 worker tests, and Redis recovery integration.

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
