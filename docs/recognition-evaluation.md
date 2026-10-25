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

When visual matching is uncertain, the worker can compare the upload's front
and available flex/back photos with one verified display per plausible catalog
model, up to three models. Front photos get a top-edge camera-notch crop;
back photos get flex and connector-marking crops; flex close-ups get a focused
crop. OCR transcribes visible text, while visual comparison uses the notch,
bezel, connector layout, and code placement as physical cues. A notch crop is
only compared with front-view references, and flex crops only with back/flex
references. The comparator sees catalog labels and must choose among supplied
catalog models or abstain. A high-confidence disagreement or contradictory
visual cues requires human confirmation. It does not create a verified label.

The decision, input image checksums, candidate models, and reference item IDs
are recorded with recognition runs for audit. Target photos are excluded from
the reference set by checksum, even if the same photo was previously attached
to a verified item. This is retrieval-time example learning, not an update to
model weights. OpenAI API image processing still depends on the configured
vision model and does not guarantee any fixed accuracy.

Evaluate this feedback loop on a frozen holdout that was not used as verified
examples. Report exact-model accuracy, accepted precision, coverage, false
confident predictions, and latency separately before changing confidence or
review thresholds. More submitted examples alone do not establish accuracy.
