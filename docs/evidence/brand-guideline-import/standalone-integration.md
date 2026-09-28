# Standalone guideline workflow: integration verification

Studio is the authoring surface. The local verification command now checks ordinary Studio and an explicitly enabled Guidelines build, then exercises intake, review, authoring, saving, refresh and portable output. Figma plugin execution is optional for the product workflow. Shared-core changes still require the plugin regression gate.

```sh
# Standalone product only
npm run verify:local -- --studio-only --guidelines

# Also verify the shared plugin core
npm run verify:local -- --guidelines
```

The runner owns its servers and records separate artifact manifests for the ordinary and enabled builds. It ignores inherited server URLs and feature flags, runs browser harnesses sequentially, and rejects artifacts that change during verification. The normal-build smoke test verifies that Guidelines stays disabled. The clean-checkout profile excludes the separate Katalon experiment, which requires an admitted external PDF. Individual harnesses retain their documented production or development boundaries; this is not a claim that every fixture is a production service test.

## Product fixes

A rejected import, reattaching the same PDF, or creating a separate scale could hide a completed gradient even though its source and paint were unchanged. The PDF and native-source editors now track source changes separately from operation cancellation. New operations still cancel pending work. Actual source edits invalidate completed proof; unchanged sources retain their current selection and exports. Reopening saved work still requires fresh verification.

The full-run preparation also exposed a timing failure in the longest hue path. Scalar interval multiplication now avoids the general interval path, and sine/cosine bounds share their identical first 26 remainder steps. Validation, arithmetic order, outward rounding, fidelity tolerances and execution budgets remain unchanged. Independent exact-rational tests cover signed zero, subnormals, interval signs and overflow. All seven diagnostic fidelity receipts are identical before and after the optimization. Browser timing is a separate acceptance result.

The [cross-format comparison](cross-format.md) uses actual PDF extraction, native Figma parsing and Chromium extraction with annotated synthetic inputs. Conflicting values require an explicit choice; selecting a value does not erase another source's restrictions.

## Verification state

Both complete 39-step runs pass: [Node 22.13.1](../local-gates/2026-09-26T11-54-24Z-a65894a/receipt.md) and [Node 24.19.0](../local-gates/2026-09-26T12-06-36Z-a65894a/receipt.md). Each includes 61 script tests, the full plugin gate with 3,091 tests and coverage thresholds, 613 Studio tests, intake checks, ordinary/enabled builds and every guideline harness. The [source-bound receipt](standalone-integration-checks.json) records the tested files and build manifests. Three independent reviews of the exact diff and incremental numerical changes are resolved.

The full gradient workload runs each of seven frozen inputs 30 times in a fresh real browser worker. The slowest case measures **1,614.3 ms p95 on Node 22's run** and **1,631.2 ms on Node 24's run**, below the unchanged 2,000 ms limit. All 420 generations have deterministic paint and passing fidelity/final-paint checks; none produces a main-thread task of 50 ms or more during generation. This is a local Apple M4 Pro / Chromium 153 observation with already loaded assets, excluding cold import and internet latency. The [Node 22](standalone-node22-performance.json) and [Node 24](standalone-node24-performance.json) receipts retain individual durations and their exact design hashes.

Earlier failures remain under `docs/evidence/local-gates/`; the two timing failures have [original](standalone-performance-failed.json) and [allocation-only](standalone-performance-failed-2.json) receipts. They explain the optimization and remain separate from the final passing candidate.

The acceptance inventory remains authoritative for open gates. Automated interface accessibility, real-source evaluation, independent designer acceptance and live host/provider qualification remain separate. Local verification does not establish deployment, public renderer isolation, Studio OAuth access or human approval.
