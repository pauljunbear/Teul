# Gradient fidelity experiment

This directory retains the bounded baseline, construction-margin and isolated-worker harnesses. The reviewed interval arithmetic, mathematical reference and fidelity checker now live in `src/lib/`; the harnesses import those shared implementations directly. Studio and the Figma plugin do not import the harnesses. A passing benchmark is **not production export authorization**.

Run from the repository root with Node 22 or 24:

```sh
npm run test:gradient-fidelity-experiment
npm run experiment:gradient-fidelity
npm run experiment:gradient-margin
npm run experiment:gradient-worker
./node_modules/.bin/tsc --project scripts/experiments/gradient-fidelity/tsconfig.json
./node_modules/.bin/eslint scripts/experiments/gradient-fidelity --ext .ts,.mjs --max-warnings=0
```

The numerical tests moved to `src/lib/__tests__/colorSystemGradient{IntervalsV1,KernelV1,DualIntervalsV1,ReferenceRouteV2,FidelityV2}.test.ts`. The named experiment test command runs those five files in Node; the root test and coverage commands discover the same files through their normal source glob. There is no second implementation or duplicated numerical test suite in this directory.

The baseline benchmark writes `release/gradient-fidelity/node22.json` or `node24.json`. The margin benchmark writes `margin-node22.json` or `margin-node24.json` in that directory. These Node reports include source hashes, exact inputs, work counts and single-run elapsed times, not percentile measurements or browser performance guarantees.

The worker benchmark builds a separate minified browser harness and writes `release/gradient-fidelity/worker/receipt.json`. It requires the existing `web` Playwright installation and Chromium runtime. It runs seven frozen inputs 30 times each, creating a fresh worker for every request. Timing includes worker startup, baseline and candidate compilation, checking, and result delivery, with cached local assets. Each fixture must meet a 2,000 ms nearest-rank p95, with no observed main-thread task of 50 ms or more. Cancellation after the worker's start message must settle within 250 ms; recovery must reproduce passing paint. Invalid input, structured-clone failure, worker construction failure and pre-aborted requests exercise cleanup paths. A hard assessment failure stops repeated timing and preserves partial results.

For a short smoke run, set `GRADIENT_WORKER_REPETITIONS=2`. Only the default 30-repetition run satisfies this harness's declared workload. Neither mode establishes Studio performance, slower-device behavior, real network download latency, or rendering quality. Receipts bind source hashes, built HTML and worker/client bundle hashes.

## V2 mathematical reference

The saved V1 compiler compares canonical sRGB paint with 4,096 native mapped samples per authored segment. The shared V2 checker instead compares that paint with a separately defined mathematical route over the entire path. It does not make a stronger claim about native V1 arithmetic.

The reference interprets stored binary64 RGB channels, matrix coefficients, transfer coefficients and policy literals as exact inputs. Gamma exponents are the exact rational values `12/5` and `5/12`; angles use mathematical pi. Roots and powers use native `Math` only to propose endpoints, then certify algebraic residual inequalities. Atan uses certified half-angle reduction and an alternating-series remainder; atan2 chooses a continuous quadrant representation excluding the origin. Sin and cos use certified range reduction and Taylor remainders. No fixed error allowance around native coordinates remains.

The reference retains OKLab and shorter/longer OKLCH paths. Chroma below the binary64 literal `1e-6` borrows the other source's hue; two neutral sources use zero hue. Borrowed or identical hues have zero angular change. The longer-path deadband is the binary64 literal `1e-9` degrees converted with a bounded mathematical pi. Unresolved neutral, half-turn or deadband decisions return unassessed rather than choosing a potentially different route. Exact authored RGB anchors remain binding.

The mapper follows the existing [CSS Color 4 Local MINDE algorithm](https://drafts.csswg.org/css-color-4/#binsearch), including every possible uncertain branch and its retained previous clipped value. JND and chroma epsilon are the binary64 literals `0.02` and `0.0001`; comparisons use interval arithmetic, including normalization of the raw-channel gamut epsilon by 255. This mathematical interpretation is versioned separately from the native implementation in `src/lib/colorScale.ts`.

Compilation error must be at most exact decimal `1/200` Euclidean OKLab. A complete upper error bound below the lower endpoint of that tolerance enclosure can pass. A witnessed lower error bound above its upper endpoint can fail. The rounding band authorizes neither result. Unsupported arithmetic, underflowed residuals, ambiguous source coordinates and exhausted budgets remain unassessed.

## Continuous bounds

Arithmetic rounds outward. When direct value boxes are too broad, the verifier bounds the error as `E(midpoint) + (interval - midpoint) * E'(interval)`. Certified source coordinates are fixed parameters across that family of curves; their uncertainty is carried in both values and slopes. Each possible mapper return factor is enclosed separately, then unioned. The verifier never differentiates branch selection.

The same centered construction narrows ambiguous clipping-distance comparisons inside the mapper. Derivative cells crossing rounded transfer-function discontinuities or unbounded root slopes fall back to direct boxes. Tests assert that centered clipping-distance bounds actually tightened before comparing native interior samples. Native samples are regression checks, not the proof of continuous coverage.

Default limits are 8,192 intervals, depth 24, 256 mapping states per interval and 65,536 mapping states overall. The margin benchmark uses 32 states per interval to subdivide broad cells earlier. Partial factor sets cannot authorize success. Reports bind `teul.gradient-reference-route.v2`, the original design and separate candidate paint; rendering remains explicitly unqualified.

## Candidate construction and compatibility

The margin benchmark calls the shared `compileGradientSampledPaintV1` construction helper with stopping thresholds of 0.0025 and 0.001. The isolated worker uses 0.0025. Construction returns separate candidate stops and a sampled maximum; it never exports an altered object as a valid V1 serialization. The old compiler-text replacement plugin and query-string imports have been removed. Native calculations propose paint; the independent reference decides whether it is within tolerance. Candidate hashes bind the reference version, original V1 design hash and every candidate stop. Source anchors must remain exact, and the stop count cannot exceed 64. The original between-sample failure remains a negative regression.

All three benchmark source manifests include the shared construction, reference, arithmetic, design parsing, serialization and hashing dependencies listed in `source-files.mjs`. Historical evidence files retain their original implementation paths, hashes and measured results; new receipts describe the promoted code.

The older experimental V1 reports remain historical evidence with their recorded native-error assumption and hashes. The new V2 report is a different mathematical claim. No existing saved design is rewritten, reclassified as a V2 design or granted a new export guarantee.

## Production boundary

The shared core now has a distinct V2 design/compiler contract and a structural reader; structural admission carries no saved success. Studio integration must perform current source binding, cancellable worker verification and final-paint checks before authorizing previews or exports. Integrated workload and rendered-output evidence remain separate from this isolated harness. Numerical fidelity does not establish smooth appearance or a useful color system. Strict V1 recovery and historical receipts remain intact.
