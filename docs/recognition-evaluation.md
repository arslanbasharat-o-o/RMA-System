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
