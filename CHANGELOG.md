# Changelog

Changes to the public source are recorded here.

## [Unreleased]

## [0.5.2] - 2026-10-31

### Fixed
- **Policy Invalidation & Stale Snapshot Purge**: Bumped `VISUAL_DECISION_POLICY` to `source-corroboration-2026-10-31-v8`. Prevents historical pre-v0.5.0 image decisions (which contained obsolete heuristic models such as false iPhone 8 Plus attributions) from being blindly reused as `same-image-evidence` during subsequent scans of identical image checksums.
- **Reasoning Model Completion Token Budget**: Increased `max_completion_tokens` from 350 to 2048 in `cleanVisualCandidatesWithOpenAi`. Eliminates output truncation and "Malformed cleaner response" errors when using reasoning models (such as `gpt-5.6-terra`) where internal reasoning tokens consume completion tokens before JSON serialization.
- **Cleaner Fallback Suggestion Preservation**: Updated `evaluateCleanerResponse` and provider error handlers to preserve upstream `evidence.suggestedModel` (e.g. iPhone 13 from Google Lens consensus) instead of nulling it out to "Unidentified Display" when an AI cleaner fails or abstains.
- **Forced Retry Cache Bypass**: Updated `processRmaItem` in `src/lib/queue/processor.ts` so that when `options.force` is active, fresh recognition results always take precedence over historical snapshots even when the fresh model decision is provisional.

## [0.5.1] - 2026-10-31

### Fixed
- **Provisional Model Rejection Guard (Blocker 1)**: Fixed `evaluateCleanerResponse` and downstream `synthesizer.ts` so when an AI cleaner explicitly rejects a candidate model (e.g. `rejected: true` or reasoning contradiction), the candidate model is strictly wiped from both `model` and `suggestedModel`. `displayName` falls back to `"Unidentified Display"` and cannot be resurrected through catalog fallback.
- **Google Lens Evidence Deduplication (Blocker 2)**: Added title signature deduplication and normalized canonical publisher collapsing across key parts retailers (`ebay`, `amazon`, `aliexpress`, `walmart`, `mobilesentrix`, `injuredgadgets`, `ifixit`, `parts4repair`, `mengtor`, `groupvertical`). Separated device-only listings from display assemblies and require $\ge 2$ independent display-specific sources for model consensus.
- **Production Seam Isolation (Blocker 3)**: Removed `mockInventoryMatch` option bypass from `processRmaItem`. Enforced strict `NODE_ENV === "test"` environment guard on `setInventoryMatcherForTesting`, ensuring ordinary production background jobs cannot bypass real physical inventory matching.
- **Single-Product Catalog Matching (Blocker 6)**: Added distinct 4-way evaluation for sparse single-product catalog coverage: automatic acceptance on verified physical proof ($\ge 0.90$ confidence, $\ge 2$ cues, 0 conflicts), candidate preservation for operator review on moderate evidence, verified non-match (`status: "miss"`) on explicit physical discrepancy, and `unavailable` on empty reference inputs without misclassifying displays as external.

## [0.5.0] - 2026-10-31

### Added
- **Explicit 6-State Inventory Match State Machine**: Added domain-constrained `inventory_match_status` (`not_evaluated`, `processing`, `matched`, `no_verified_match`, `review_required`, `error`) across `rma_items` schema, migrations, API route handlers, background worker persistence, and operator UI.
- **8 Product Display States in Review Drawer**: Revamped `ItemReviewDrawer.tsx` to distinguish identified models, automated suggestions awaiting confirmation (amber), operator-confirmed warehouse stock (emerald), evaluation in progress (blue pulse), incomplete comparisons (amber), ambiguous candidates, completed no-matches (neutral), and provider errors (rose).
- **Manual Inventory Confirmation Action**: Added `confirm_inventory` endpoint action in `/api/rma-items/[id]/review`, allowing operators to review automated warehouse suggestions and certify them into confirmed stock with audit logging.
- **Deterministic Vision Cleaner Decision Interface**: Extracted `evaluateCleanerResponse` with Contradiction Guard, ensuring cleaner responses marked `rejected: true` or containing contradictory reasoning are never promoted into accepted model suggestions even if the model string matches.
- **Preponderance Consensus Engine**: Replaced single-result `.some()` checks with multi-candidate consensus rules ($\ge 3$ listings, $\ge 2:1$ ratio, $\le 1$ outlier) in `model-evidence.ts` and `decision.ts`.
- **E2E Integration Lifecycle Suite**: Added `src/__tests__/integration/recognition-lifecycle-e2e.test.ts` verifying real background worker pipeline persistence with mock inventory match adapters, without manual database update shortcuts.
- **AI Cost Telemetry & Cache Optimization**: Added token-level usage accounting, cache hit/write reconciliation, and deterministic prompt caching headers.

### Changed
- **Historical Inventory Backfill Policy**: Refactored `src/db/migrate.ts` to require positive verification (operator confirmation or physical comparison $\ge 0.90$ confidence, $\ge 2$ cues, 0 conflicts) before setting `matched`. Demotes unverified legacy associations to `review_required` without data deletion.
- **Matcher Prerequisites & Incomplete Handling**: In `seeded-inventory.ts` and `processor.ts`, comparisons with < 2 reference samples or empty target images return `status: "unavailable"` and map to `review_required` instead of falsely mislabeling displays as external.
- **Hardware Flex-Code Guards**: Removed generic Apple `821-` flex prefixes and arbitrary lot stamps (`413022`, `M308`) from modern iPhone guards; legacy iPhones (e.g. iPhone 8 Plus) are preserved unless affirmative OLED cues (`HARD`, `SOFT`, `OLED`, `AMOLED`) or multi-candidate modern consensus are present.
- **Stale Worker Revision Gating**: Hardened `updateItemForRevision` in `processor.ts` so background jobs matching older revisions cannot overwrite newer operator review actions.

### Fixed
- **Unsafe Inventory Status Inference**: Replaced naive ternary fallbacks (`item.seededDisplayProductId ? "matched" : "not_in_inventory"`) with `deriveInventoryMatchStatus` validating against strict domain constraints.
- **Eliminated False Warehouse SKU/Barcode Fabrication**: Prohibited API handlers from attaching warehouse inventory SKUs and UPC/EAN barcodes to uncataloged external screens merely based on model name strings.


## [0.4.11] - 2026-10-30

### Added
- **Display Inventory Management Interface (`/display-catalog`)**: Complete administrative UI providing active display product overview, model/variant details, printed box titles, box UPC/EAN barcodes, supplier SKUs, and interactive high-resolution reference photo inspection.
- **Display Inventory API Endpoints (`/api/display-inventory`)**: Role-protected (`admin`, `operator`) endpoints for toggling product and reference matchability, previewing dry-run sync diffs from the seed package, and performing safe test record cleanup.
- **Seeded Reference Image Streaming (`/api/images/[id]`)**: Streaming support for seeded display inventory references with full authentication and access control.
- **GSD (Get Shit Done) Configuration**: Integrated `.planning/` workspace, configuration, project architecture map, and roadmap tracking.

### Fixed
- **Seeded Inventory Matching Precision**: Filtered conflicting cues so observations explaining why unselected alternatives did not match do not block acceptance of the selected reference candidate.
- **Vision Comparison System Prompt**: Instructed the multi-candidate variant reviewer to keep `conflicting_cues` strictly empty (`[]`) when the selected variant matches cleanly without physical contradiction.
- **Turbopack Build Optimization**: Eliminated dynamic filesystem access warnings in `seed-display-inventory.ts` using `/*turbopackIgnore: true*/`.
- **UI/UX Cleanup**: Removed dead component `blur-in-demo.tsx`, sanitized operator alert texts, and streamlined table card designs across all pages.
- **Test Safety Guard**: Established explicit `confirm: true` parameter and `isDisposableTestRecord` predicate to protect legitimate production customer and RMA records during test data cleanup.

## [0.4.10] - 2026-10-30

### Fixed
- **Clean Operator Review Alerts**: Replaced raw, pipe-delimited internal debug log dumps in the Review Queue UI with sanitized, human-readable bulleted review reasons.
- **Internal Matcher Telemetry Leakage**: Removed rule evaluation counters (`Evaluated X tokens against Y active rules with no match`) and stale catalog references from persisted operator evidence notes.
- **OLED vs Legacy LCD Differentiation**: Added physical technology checks so displays bearing `HARD`, `SOFT`, `OLED`, or `AMOLED` physical markings disqualify legacy LCD models (e.g. iPhone 6/7/8 series) from visual candidate selection.
- **Multimodal AI Vision Screen Inspection**: Enriched visual decision prompts to evaluate modern 19.5:9 all-screen aspect ratios, Dynamic Island cutouts, and rear silver heat-shield plates common on aftermarket assemblies, preventing false iPhone 7 Plus classifications on iPhone 16 Pro Max displays.


## [0.4.9] - 2026-10-29

### Added
- **Seeded Display Catalog Matching Engine**: Introduced catalog-first identification comparing display-back photos against seeded display inventory variants before running Google Lens.
- **Automated Box Metadata Linking**: Confident seed matches automatically attach the verified box UPC/EAN barcode, symbology, and supplier SKU to the RMA item while bypassing external visual search.
- **Seeded Catalog UI & Review Notes**: Displayed dedicated seeded inventory match badges, printed box title, barcode, SKU, and comparison confidence in `ItemReviewDrawer` and RMA detail pages.
- **Display Angle Preprocessing**: Explicitly mapped legacy and default `primary` photos to the display back view in `processor.ts` for seeded catalog comparisons.
- **Database Schema**: Added `seeded_display_products` and `seeded_display_references` tables with indexes and foreign keys on `rma_items`.
- **Seeded Inventory Management**: Added `npm run db:seed-display-inventory` supporting validation, dry-run reporting, transactional seeding, and reference deactivation.

### Fixed
- **OCR Contradiction Safeguard**: Physical part numbers read via OCR that contradict a seed candidate immediately withhold seeded UPC/SKU and flag the item for human review.
- **Pipeline-Wide Link Validation**: OCR retries and manual model overrides validate and clear conflicting seeded product links, confidence scores, and evidence atomically.
- **Reference Instruction Alignment**: Product variant visual comparisons use variant-level identity prompts without generic device geometry conflicts.

### Removed
- **Obsolete Excel Catalog Parser**: Completely removed `excelParser.ts`, its test suite, and the `xlsx` package dependency.

## [0.4.8] - 2026-10-29

### Added
- **Google Lens v1.0.22 Multisearch Integration**: Forwarded `LENS_SEARCH_PROMPT` to both `app` and `worker` services via `docker-compose.yml`, enabling physical inspection criteria (notch vs Dynamic Island, diagonal sizing, aftermarket IC markings) in live Google Lens queries.
- **Dynamic Inspection Prompt Prioritization**: Prioritized environment-configured inspection prompt (`process.env.LENS_SEARCH_PROMPT`) over defaults in `SelfHostedLensProvider` and background worker `processor.ts`.
- **Admin Settings Visibility**: Exposed `lensSearchPrompt` in `/api/settings` and rendered active inspection prompt status in the Recognition Providers settings card.
- **Service Documentation**: Updated `docs/self-hosted-lens.md` and `.env.example` with Google Lens v1.0.22 image references and multisearch prompt configuration.

## [0.4.7] - 2026-10-29

### Fixed
- **Catalog Foreign Key Constraint Crash**: Sanitized `catalogDisplayId` from historical `review_actions` against `allCatalog` before saving `rma_items`, preventing `rma_items_catalog_display_fk` violations when `display_catalog` is empty or lacks the reference.
- **Worker Error Resilience**: Wrapped worker item execution in a fallback error handler that resets any item stuck in `status: "processing"` to `review_required` with diagnostic notes if an unhandled exception occurs, preventing indefinite UI processing spinners.
- **AI Vision Model Guidance**: Enabled AI vision physical photo inspection to populate `suggestedModel` and `displayName` when source candidates are inconclusive or low-confidence (< 0.85), allowing operators to review and confirm physical display inspection suggestions even when Google Lens candidates are noisy.

## [0.4.6] - 2026-10-29

### Fixed
- **AI Vision Gate**: Enabled OpenAI Vision inspection when Google Lens web candidates are ambiguous, conflicting, or low-confidence (< 0.85). Distinguishes sibling models (e.g. iPhone 16 Pro vs 15 Pro) via physical screen bezels, Dynamic Island proportions, and flex cable markings, updating `suggestedModel` and `displayName` while preserving trust boundaries.

### Removed
- **Display Catalog Dead Code**: Removed obsolete `/display-catalog` pages, layouts, and `/api/display-catalog` endpoints. The system relies on dynamic Lens visual recognition and supplier/vendor rules.

## [0.4.5] - 2026-10-26

### Added
- Interactive Google Search candidate cards in `ItemReviewDrawer` and `review-queue` with rank badges, clean extracted titles, and 1-click model selection.
- Continuous operator feedback learning loop: confirmed display models, visual evidence, and extracted markings persist directly into ground truth.

### Changed
- Removed static display catalog requirement and replaced with dynamic Google Lens visual candidate matching.
- Updated sidebar navigation: removed dead `/display-catalog` link and renamed vendor catalog to "Suppliers".
- Optimized RMA detail polling to only trigger when displays are actively queued or processing.

### Fixed
- Addressed client reference manifest errors on dynamic `/rmas/[id]` routes; current source builds with `next build` (Turbopack by default). Production behavior requires separate verification.
- Restored complete 108 KB Tailwind v4 CSS asset pipeline in container by linking PostCSS configuration.


### Changed
- Shortlist the verified library in one compact discovery call when it contains at most 32 device models. Larger libraries still use bounded batches, but all batches in a round now run concurrently with `OPENAI_CONCURRENCY` (default 2) instead of two at a time.
- Make discovery cheaper: each reference contributes its focused sensor/notch view at high detail plus a low-detail context frame, discovery uses `reasoning_effort: low` and a minimal selection schema, and the final high-detail comparison remains unchanged.
- Cache prepared frames and focused crops per image buffer so the final comparison does not reprocess discovery inputs.
- Record discovery, final, and total comparison timings in `recognition_runs.raw_response.timings`.
- Add `OPENAI_CONCURRENCY` and `VERIFIED_DISCOVERY_MAX_MODELS` to the documented environment.

### Fixed
- Reduce the redundant sequential comparison rounds that made a single upload take roughly 80–95 seconds. The frozen holdout now measures p50 39.1 s and p95 52.8 s (v0.4.0: p50 77.6 s, p95 93.4 s).

### Verification
- Frozen 12-model holdout: 12/12 exact model accuracy, 9/12 accepted coverage (75.0%), 100% accepted precision, 12/12 review-suggestion coverage (100%), 100% review-suggestion precision, 0 false confident matches, and 0 errors. p50 39.1 s, p95 52.8 s; comparison stage p50 28.0 s, p95 37.9 s.
- Non-database unit tests 190/190 pass; TypeScript and ESLint pass. Seven database-backed tests require a local PostgreSQL and were not run in this workspace. The production build is validated during deployment.
- Live queue replay on the deployed v0.4.1 returned Apple iPhone XR with `review_required` and no verification, at 0.98 confidence. Comparison took 19.4 s and end-to-end processing took 22 s, versus roughly 82–85 s for previous live unified runs.
- Confidence thresholds, acceptance rules, the final high-detail comparison, and the human-review requirement are unchanged. The item is never auto-verified.

## [0.4.0] - 2026-10-26

### Changed
- Count verified visual references per device model instead of per catalog SKU. Two verified assemblies of one model (for example iPhone XR AM and COF) now corroborate the same model identity. The shortlist prefers the exact SKU proposed by search when it has a verified photo, and otherwise uses a verified sibling assembly.
- Keep a reference-backed model visible as a review-only suggestion when the comparison does not meet the acceptance policy, instead of replacing it with an unidentified result. The item remains `review_required`; the suggestion is never auto-verified.
- Allow the operator to approve a concrete reference-backed suggestion in one action even when the synthesized status is ambiguous. Items without a model and catalog ID remain blocked.
- Record `supportingModelReferenceCount` in recognition runs and report review-suggestion coverage/precision in the read-only benchmark.
- Retry a transient provider 5xx once during verified-example comparison, so a temporary outage does not unnecessarily force a correct upload into review.

### Fixed
- The supplied iPhone XR display no longer loses to a visually similar iPhone 11 search result. The verified XR assemblies corroborate one model, and a decisive single-reference comparison can set the review suggestion at 0.97+ with at least three cues and no unresolved alternative.
- Correctly handle near-identical sibling models whose references live on different catalog SKUs.
- Keep the 0.93 acceptance threshold, two-reference rule, and human-review requirement. The changes affect which model is suggested and counted; they do not auto-verify items.

### Verification
- Frozen 12-model holdout: 12/12 exact model accuracy, 7/12 accepted coverage (58.3%), 100% accepted precision, 10/12 review-suggestion coverage (83.3%), 100% review-suggestion precision, 0 false confident matches, and 0 errors. p50 latency 77.6 s, p95 93.4 s. The iPhone 15 Pro Max case hit a transient provider 500 in the main run and was rerun with the final retry-enabled build (0.96, two model-level references); the merged result records the retry explicitly.
- Non-database unit tests 189/189 pass; TypeScript, ESLint, and production build pass.
- Live production replay of the supplied iPhone XR returned Apple iPhone XR at 0.98 with two model-level verified references, no unresolved alternatives, and `review_required`. The item remains unverified for the operator. A one-click approval was exercised on a temporary copy and removed with the rest of the smoke-test data.
- This release supersedes the v0.3.34 candidate, which was built but never deployed.

## [0.3.34] - 2026-10-26

### Fixed
- Allow a decisive single-reference comparison to set the suggested model in review. This applies only when the comparison scores at least 0.97, cites at least three concrete matching cues, and leaves no unresolved alternative. Near-identical siblings such as iPhone XR and iPhone 11 can make generic image search rank the wrong model first; the operator-verified reference should still inform the operator.
- Keep the base acceptance threshold at 0.93 and keep two references as the standard for accepting a match that still has unresolved alternatives. The exception changes which model is suggested; the item remains `review_required` and is never auto-verified.
- Discard the earlier v0.3.34 candidate that let one reference veto a search-backed suggestion. It was built but never deployed, because it would have kept the wrong iPhone 11 suggestion over the operator-confirmed iPhone XR result.

### Verification
- On v0.3.33 the replay selected iPhone XR at 0.98 from one verified XR reference with zero unresolved alternatives and four matching cue groups. The policy withheld it, and search still ranked iPhone 11 first.
- The operator confirmed iPhone XR is the correct display. Focused recognition tests, typecheck, and lint pass. The live replay after deployment must show iPhone XR in review before this release is considered verified.

## [0.3.33] - 2026-10-26

### Fixed
- Stop the comparator from returning `none` merely because search found a lower-ranked model with no verified reference. It now selects the best-supported supplied candidate and records the unrepresented label as a caveat, while the acceptance policy decides whether two independent references are enough.
- Keep the confidence threshold at 0.93. The prompt change prevents self-censorship; it does not auto-accept a weak score.

### Verification
- The iPhone 11 replay on v0.3.32 still returned no model: discovery selected iPhone 11 at 0.86, but the focused comparison abstained at 0.30 after listing iPhone XS Max as an unrepresented alternative.
- With the revised prompt, the same five-reference focused comparison selected iPhone 11 in 3/3 attempts at 0.94, citing both independent iPhone 11 references. iPhone XS Max was no longer treated as a veto; the only residual caveat was the closer iPhone XR reference.
- Focused recognition tests, typecheck, and lint pass.

## [0.3.32] - 2026-10-26

### Fixed
- Fall back to a focused comparison of the three closest search-ranked models when every discovery batch abstains. Previously an all-abstain discovery round returned no model before the focused comparison could run, so a correct top candidate with two strong references could still be reported as unidentified.
- Keep the same acceptance threshold, two-reference corroboration, and human-review rules for the fallback result.

### Verification
- On v0.3.31 the iPhone 11 replay again returned no model: all four discovery batches abstained even though the visual search ranked iPhone 11 at 0.97. The focused three-model probe for this photo selected iPhone 11 at 0.93-0.94 in 3/3 attempts.
- Focused recognition tests, typecheck, and lint pass.

## [0.3.31] - 2026-10-26

### Fixed
- Focus the final verified-photo comparison on the discovery winner plus at most two search-ranked alternatives instead of sending every model from the winning batch. The wider prompt could contain dozens of near-identical reference photos and made the same iPhone 11 upload return either the correct model or no match across runs.
- Keep both independent examples for the winner and only the closest competing labels for the final check, so the comparison has enough evidence without losing track of which reference belongs to which model.

### Verification
- A focused production read-only probe with iPhone 11 plus iPhone XR and iPhone 16 Pro Max references selected iPhone 11 in 3/3 attempts at 0.93-0.94, citing both independent iPhone 11 references.
- The previous 32-reference final prompt returned no selection for the same photo on v0.3.30 after 40 seconds, despite the discovery batch having selected iPhone 11 at 0.88.
- Focused recognition tests, typecheck, and lint pass before the direct production deployment.

## [0.3.30] - 2026-10-26

### Fixed
- Accept a verified-photo comparison supported by two independent references even when the comparison also reports a residual lookalike caveat, because the model-level comparison already weighed and rejected that alternative. A single reference still requires independent search agreement and no unresolved alternatives.
- Keep the confidence threshold at 0.93 for every accepted comparison; the policy change only removes the blanket veto from a second corroborating reference.

### Verification
- Focused recognition tests, typecheck, and lint pass. Direct production deployment and a live replay of the unaffected iPhone 11 test photo are performed outside GitHub CI/CD at the user's request.

## [0.3.29] - 2026-10-26

### Fixed
- Retrieve operator-verified models independently of Google search candidates, so a model omitted by Lens can still be recognized from verified photos.
- Search the verified library in bounded batches, then compare finalists with up to two independent references per model. Newly verified displays become eligible on the next upload.
- Compare full photos at high detail and include rear sensor cutouts; require distinguishing geometry rather than generic flex-cable resemblance.
- Support a separately configured reference model with a reasoning token budget, bounded retries, and recorded discovery decisions. Preserve the existing OCR model and human confirmation rules.

### Verification
- Isolated, read-only server probe identified the supplied display as iPhone 13 Pro Max at 0.95 using two independent verified photos and GPT-6.1 Sol; the earlier GPT-4o probe selected an incorrect model below the acceptance threshold.
- Frozen 12-photo holdout: 8/12 exact model, 2/12 accepted, 100% accepted precision, 0 confident false matches, median comparison latency about 70 seconds. The missing-reference check accepted no model on 4/4 photos.
- Live authenticated production upload of the supplied photo returned iPhone 13 Pro Max at 0.94 against 32 verified references and correctly remained in review required instead of auto-verifying. The temporary test customer, RMA, item, images, and session were removed afterward.

## [0.3.28] - 2026-10-26

### Fixed
- Compare up to two distinct operator-verified display items per shortlisted model, so repeated verified samples can expose model-level visual consistency without an unbounded image pool.
- Withhold a weak model suggestion when verified-example comparison cannot confirm it, and treat a competing model result as a reason for human review rather than preserving a misleading first-pass guess.
- Compare candidate identities by device model across assembly variants, so catalog variants do not create false model conflicts.

### Verification
- The production v0.3.27 rescan confirmed the lower-ranked iPhone 13 Pro Max candidate and ran verified-example comparison, but the comparator selected iPhone 12 Pro Max at 0.90 and the system kept the low-confidence iPhone X suggestion in review. This release addresses that observed mismatch by using more verified samples and abstaining on unconfirmed suggestions.
- Focused unit tests, typecheck, and lint are run before the direct production deployment; this release is deployed outside the GitHub CI/CD workflow at the user's request.

## [0.3.27] - 2026-10-26

### Fixed
- Keep the bounded visual-search candidate pool available while selecting up to eight catalog models backed by angle-matched, operator-verified photos, including lower-ranked matches and verified photos on another assembly variant of the same model.
- Avoid treating a shorter model name embedded inside a stronger longer model match as a cross-manufacturer contradiction; independent conflicting mentions still remain in review.

### Verification
- PR #87 passed required CI: database fixtures, typecheck, ESLint, Vitest, production build, camera intake, and Safari live-result checks.
- Production replay on v0.3.26 showed the 13 Pro Max listing at Lens rank 13 was excluded before verified-reference comparison; the patched local replay retained it and selected the actual verified-photo catalog variant.

## [0.3.26] - 2026-10-26

### Fixed
- Compare the full visual-search candidate pool with angle-matched, operator-verified reference photos when search evidence contains competing catalog models, even when the first-pass decision reports high confidence.

### Verification
- PR #85 passed the required CI suite, including unit tests, typecheck, lint, production build, container build, and desktop/mobile browser checks.

## [0.3.25] - 2026-10-26

### Fixed
- Keep competing catalog models in the verified-photo comparison shortlist when listing votes are decisive but the image decision remains uncertain.

## [0.3.24] - 2026-10-26

### Fixed
- Aggregate visual-source votes by device model across catalog assembly variants, and keep conflicting or uncorroborated results in human review.

### Verification
- PR #81 passed required CI: database fixtures, typecheck, ESLint, Vitest, production build, runtime image build, camera intake, and Safari live-result checks.

## [0.3.23] - 2026-10-26

### Fixed
- Use catalog names and aliases to shortlist visual candidates across manufacturers; count independent publishers per catalog ID, reject mixed-model listings, and keep ambiguous matches in review.

### Verification
- PR #79 passed full CI, including database fixtures, TypeScript, ESLint, Vitest, production build, container build, and desktop/mobile browser checks.
- Live single-image validation on production v0.3.22 remains separate from this release; it returned an iPhone X suggestion with conflicting candidates and required review.

## [0.3.22] - 2026-10-26

### Maintenance
- Remove unused imports, declarations, and unreachable UI components; enable TypeScript unused-local and unused-parameter checks.

## [0.3.21] - 2026-10-25

### Fixed
- Vote across unique, attributable display listings before shortlisting a single Apple catalog model; require independent-source and rank-score margins, and abstain from a single-ID result when evidence conflicts.

## [0.3.20] - 2026-10-25

### Added
- Reuse independent operator-verified part numbers and angle-matched display photos as bounded feedback during later recognition, while withholding uncertain or conflicting results for review.
- Capture an optional flex-cable close-up and crop front-notch, back-flex, connector-marking, and label regions according to the selected photo angle.
- Record verified-example comparison inputs and outcomes for recognition audit.
- Add reduced-motion-aware blur-in animation to the login and main app page headings.

### Fixed
- Send up to four prioritized front, flex, back, and label photos through angle-aware OCR, and compare like-for-like display regions against verified references.
- Exclude all current target photo checksums from verified reference selection to prevent a display from matching against a duplicate of its own image.
- Upgrade vulnerable runtime dependencies and update the settings record schema for Zod 4.

## [0.3.19] - 2026-10-19

### Fixed
- Add a visible photo removal control to mobile and desktop camera intake, preserving saved photos when removal fails and allowing replacement on the same display.
- Remove stale recognition suggestions and evidence when an incorrect photo is removed, and queue remaining photos atomically without changing verified displays.
- Recover automatically from suspended mobile requests, refresh active results every second, and reconcile idle screens without manual refresh controls.
- Keep capture controls and live results within small phone and landscape viewports.

## [0.3.18] - 2026-10-19

### Fixed
- Ensure snapshot round-trip serialization and visual decision policy v7 are packaged into tagged release containers, invalidating stale v6 machine caches on deployed environments.

## [0.3.17] - 2026-10-19

### Fixed
- Preserve winning candidate model suggestions (`predictedModel` and `predictedDisplayAssembly`) with `[Suggestion]` badge and `review_required` status when visual evidence has variant competition, preventing valid evidence from degrading into `Unidentified Display`.
- Round-trip `suggestedModel` across stable visual decision snapshots and bump decision policy to v7 so prior inconclusive v6 machine caches are re-evaluated with candidate evidence.
- Expand recognition brand coverage to support Nokia (including Nokia G10 / G20), Sony, LG, Realme, and Vivo displays.
- Add docker-compose healthcheck for pg-boss queue worker service to ensure container status and heartbeat monitors reflect worker liveness.
- Refine text match assertions in full browser end-to-end test suite.

## [0.3.16] - 2026-10-19

### Fixed
- Target accessible mobile navigation controls during the complete browser workflow so hidden retained route trees do not cause an ambiguous test selector. All workflow assertions and release gates remain enabled.

## [0.3.15] - 2026-10-19

### Fixed
- Preserve the normalized candidate titles, source links, and ranks when saving and reusing a recognition result.
- Keep manual confirmations and conflict flags during result persistence; refresh machine evidence saved by the incomplete snapshot policy.

## [0.3.14] - 2026-10-19

### Fixed

- Require review when attributable listings disagree on exact variants, even if a large majority favors one model. The live Pro/Pro Max photo reproduced an incorrect Pro decision despite contrary Max listings.
- Preserve conflicting variant evidence before publisher deduplication so repeated cards cannot hide a disagreement.
- Fetch the result behind a succeeded asynchronous cache receipt, and keep polling pending receipts even when they include an empty placeholder match array.
- Honor the configured recognition deadline instead of forcing an eight-second timeout in the application provider factory.
- Invalidate older machine decisions under policy v5 while preserving operator corrections.

## [0.3.13] - 2026-10-18

### Fixed

- Removed internal SKU badges from RMA item list view, mobile drawer, and inspection UI as requested.
- Removed filename metadata, forced confidence instructions, and unsupported visual rules from recognition. Image corroboration cannot override conflicting source evidence or assign a supplier quality/SKU from marketplace text.
- Removed permissive catalog containment matching and confidence floors that promoted weak suggestions.
- Invalidated older machine recognition policies while preserving operator corrections.
- Replaced the filename-leaking benchmark and substring scorer with external, checksum-verified exact-model evaluation; archived downloaded test assets outside the repository.
- Restored the full desktop/mobile release gate and added a no-store public version endpoint for deployment readback.
- Increased video element polling timeout in camera intake Playwright tests to eliminate WebKit flakes on CI.
- Optimized live RMA page polling to 2500ms continuous refresh while items are processing or receiving.

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
