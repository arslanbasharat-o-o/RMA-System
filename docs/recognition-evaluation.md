# Recognition verification

Model identity and supplier assembly quality are separate decisions. Lens source
titles and image inspection provide evidence; they do not provide ground truth.
Contradictory or insufficient evidence requires operator review. Stored scores
are policy evidence scores, not calibrated probabilities or measured accuracy.
Source-independent corroboration is required; multiple listings from subdomains
of one publisher are not independent publishers. Image inspection can veto a
source-based suggestion but cannot convert conflicting evidence into a verified
model. A failed Lens search remains a failed search, with photos retained.

Earlier 30/50/100-image reports used model-bearing filenames and permissive
substring scoring. Their reported accuracy and confidence cannot establish
production correctness. Downloaded assets and those reports are no longer
distributed in this repository or runtime images.

## Reproducible evaluation

Keep datasets and reports outside the source checkout. Prepare a JSON manifest
with unique `id`, `filename`, `sha256`, `expectedManufacturer`, and `expectedModel`
for every photo. Verify labels against the original catalog/source and freeze
the manifest before evaluating. Separate tuning photos and their near duplicates
from an independently labeled holdout. Preserve exact model variants and tablet
generations; compatibility is not identity. Include ambiguity and non-display
cases in a separately identified negative set rather than relabeling them.

With private provider configuration in a protected external environment file:

```sh
node --env-file=/private/evaluation.env --import tsx scripts/evaluate-recognition.ts /external/manifest.json /external/report.json
```

The runner sends only image bytes with a neutral filename. Expected labels and
source filenames remain in the scorer. It checks file hashes, includes missing
files/timeouts/errors in the denominator and measured durations, and reports
exact-model accuracy, accepted precision, coverage, false confident predictions,
and p50/p95 latency. A nonzero exit indicates failed accuracy, error, or false
confident prediction gates. Empty acceptance coverage is not a successful test.

This is a provider-level evaluation. It does not replace authenticated Chrome
testing of upload, queue processing, persistence and automatic result delivery.
Offline CI uses synthetic fixtures and a mock provider; those results must never
be described as real Lens accuracy or production load measurements.

## Verified-example feedback

Operator-verified items with a catalog model and saved OCR part numbers are
reused as feedback for later items. A flex part number is added to the runtime
lookup only after it appears on two distinct verified items with the same model.
If verified items associate one code with different models, the code is ignored
and model identification is withheld for review. Learned part-number matches
remain suggestions; they never mark a new display as verified.

For visual matching without an exact part-number match, the worker compares the
upload with the active verified library independently of Lens. Search candidates
prioritize the library order but cannot exclude verified models. When there are at most eight catalog candidates, the implementation runs the final comparison directly. For larger libraries, it uses a compact discovery pass up to `VERIFIED_DISCOVERY_MAX_MODELS` (default 32), then bounded batches of up to eight with concurrency controlled by `OPENAI_CONCURRENCY` (default 2). A sole finalist is checked against nearby search-ranked alternatives. See `src/lib/recognition/openai/verified-library.ts` for the current behavior.
Any failed discovery batch prevents acceptance of the library comparison.
This full-library strategy suits the current small catalog; measured growth or
unacceptable latency requires image-embedding retrieval before comparison.

References are grouped by **device model**, not by catalog SKU. Assemblies such
as iPhone XR `AM` and `COF` are commercial variants of one phone model, so two
verified items on those SKUs count as two independent model-level references.
The shortlist prefers the exact SKU proposed by search when that SKU has its own
verified photo, and otherwise uses a verified sibling assembly of the same model.
The comparison still cites the specific reference items it used; the policy
separately counts distinct verified items for the selected model. The recognition
run records that model-level count for audit.

Full comparison photos use high detail. Back photos also expose a top-region
crop for rear sensor cutouts, in addition to the flex crop. Front photos get a top-edge camera-notch crop;
back photos get flex and connector-marking crops; flex close-ups get a focused
crop. OCR transcribes visible text, while visual comparison uses the notch,
bezel, relative sensor spacing, flex exit height, connector layout, and code
placement as physical cues. Rear sensor cutouts are compared with back views;
front notches only with front-view references, and flex crops only with back/flex
references. The comparator sees catalog labels and chooses among supplied
catalog models; it returns `none` only when no supplied model is a credible
match. A lower-ranked search label without a verified reference is recorded as a
caveat, not treated as a veto. A single reference normally needs search
agreement, but a decisive comparison (at least 0.97, at least three concrete
matching cues, and no unresolved alternative) may set the suggested model even
when search prefers a near-identical sibling. That suggestion stays in human
review; it does not create a verified label. A high-confidence disagreement or
contradictory visual cues also requires human confirmation.

When a reference-backed comparison selects a model but is not strong enough to
meet the acceptance policy, the model remains visible as a review-only
suggestion instead of being discarded as unidentified. The item is forced to
`review_required` and the evidence notes state that human confirmation is
required. The review thresholds are 0.85 with one reference and no unresolved
alternative, 0.90 with one reference and an unresolved alternative, and 0.80
with two or more model-level references; at least two concrete matching cues are
always required. Unresolved alternatives are shown to the operator rather than
hidden. This is a presentation policy, not a weaker acceptance threshold, and it
never marks an item verified.

The decision, input image checksums, candidate models, and reference item IDs
are recorded with recognition runs for audit. Target photos are excluded from
the reference set by checksum, even if the same photo was previously attached
to a verified item. This is retrieval-time example learning, not an update to
model weights. OpenAI API image processing still depends on the configured
vision model and does not guarantee any fixed accuracy.

`OPENAI_REFERENCE_MODEL` optionally assigns a separate model to this comparison
role without changing `OPENAI_VISION_MODEL` for OCR. Discovery uses a 3,000-token
completion budget, low reasoning effort, and a minimal selection schema; the
final comparison receives an 8,000-token budget and medium effort. Comparison
requests have a 120-second timeout and retry one transient provider failure.
Model access is checked against the server account before deployment. GPT-6.1
Sol supports image inputs and structured outputs through Chat Completions
without tools; see the
[official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

### Read-only feedback benchmark

`scripts/evaluate-verified-library.ts` uses a database connection with
`default_transaction_read_only=on` and can run with the production storage volume
mounted read-only. `freeze` writes a manifest outside the checkout with one test
photo per verified catalog label that has at least two independent item IDs and
different photo checksums. `run` excludes the source item and all target-checksum
items from reference lookup. Only target bytes and angle enter the comparison;
expected labels stay in the scorer. Results include errors, durations, selected
catalog labels, discovery batches, exact-model accuracy, accepted
coverage/precision, review-suggestion coverage/precision, and false accepted
matches. Optional `EVALUATION_SHARD=0/2` splits the same frozen manifest without
changing its hash. Merge reports only after checking all expected IDs appear once.

`freeze-unknown` creates a separate missing-reference manifest with one
single-example catalog label per manufacturer. Its source item is removed at
evaluation time and the reference comparison should abstain. These cases measure
false acceptance outside the reference library; they do not measure recognition
accuracy for those manufacturers. A `probe` image is a tuning case, not a holdout.

These benchmarks evaluate the verified-feedback stage. An actual authenticated
upload, queue completion, and persisted catalog suggestion are checked separately.

Evaluate this feedback loop on a frozen holdout that was not used as verified
examples. Report exact-model accuracy, accepted precision, coverage, false
confident predictions, and latency separately before changing confidence or
review thresholds. More submitted examples alone do not establish accuracy.
