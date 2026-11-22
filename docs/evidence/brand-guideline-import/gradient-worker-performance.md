# Gradient arithmetic and browser-worker feasibility

This slice advances TASK-008 / REQ-009 / NFR-002 under DEC-015. It improves the existing independent gradient checker and measures a separate browser worker before Studio integration. The standalone Studio workflow and SVG/CSS/JSON handoff remain the product direction; native Figma execution is optional.

## Changes and correctness

Adjacent floating-point values now use exact 32-bit carry/borrow operations instead of allocating BigInts. Interval validation no longer allocates a discarded pair. Certified rational-power residuals use outward-rounded exponentiation by squaring, specialized to the nonnegative point inputs they actually receive. This reduces repeated arithmetic without changing the exact 1/200 OKLab tolerance, source anchors, 64-stop ceiling, work budgets or unsupported-domain refusals.

An independent BigInt oracle checks 1,056 signed neighbor cases, including subnormal values, word boundaries and signed zero. Exact integer residuals check every supported exponent pair from 1/1 through 12/12 across 13 point/interval inputs. Existing reference, mapper, between-sample failure, bad-seed, underflow and compatibility tests remain in the suite. All 43 experiment tests pass on Node 22.13.1 and Node 24.19.0; experiment TypeScript and zero-warning ESLint pass.

The isolated worker compiles a candidate at the 0.0025 construction target, then assesses it against the V2 mathematical reference. It never serializes that experimental object as a valid V1 design. A shared in-memory compiler variant serves both Node and browser measurements; the production compiler is unchanged. Each request owns a fresh worker, and completion, cancellation, dispatch failure, decode failure, runtime failure or timeout terminates it and removes handlers.

Independent reuse, quality/correctness and efficiency review found issues that were fixed: structured-clone dispatch could leave a worker running until timeout; repeated benchmark failures could consume the entire workload; recovery and built-artifact checks omitted the passing assessment and HTML hash. The focused power-arithmetic review found no remaining correctness issue. Browser checks exercise an actual uncloneable input and fresh generation after active cancellation.

## Repeated browser measurement

The 210-generation run passed on an Apple M4 Pro, macOS arm64, headless Chromium 153.0.8010.12. Each of the seven fixtures ran 30 times in a fresh worker. The nearest-rank p95 is the 29th sorted observation for each fixture. Request time includes worker startup, baseline/candidate compilation, assessment and delivery; assets were served from a local preview and cached. No concurrent benchmark or test suite was launched during this measurement.

| Frozen input                             | Request p95 | Maximum request |
| ---------------------------------------- | ----------: | --------------: |
| Restrained                               |     65.4 ms |         69.7 ms |
| Black–white                              |    102.5 ms |        103.6 ms |
| Shorter hue                              |     67.7 ms |         68.3 ms |
| Longer hue                               |  1,828.2 ms |      1,896.6 ms |
| Neutral                                  |     66.5 ms |         68.9 ms |
| Five anchors                             |    171.9 ms |        174.4 ms |
| Recompiled between-sample counterexample |    700.5 ms |        704.7 ms |

Every attempt passed the continuous V2 bound with at most 35 compiled stops; candidate hashes were stable across all repeats. The original saved counterexample still fails in the test suite. PerformanceObserver recorded no main-thread long tasks during generation. Active cancellation acknowledged in 0.5 ms after the start message. Fresh recovery reproduced the expected passing paint; malformed input, structured-clone failure, unavailable-worker and pre-aborted cases passed. The minified worker is 36,156 bytes and its client is 2,028 bytes.

The [verification receipt](gradient-worker-performance-checks.json) retains every attempt, exact inputs, assessment/work counts, browser and machine versions, measured faults, source hashes and built-artifact hashes. The observed times do not promise the same performance on another device.

The separate Node benchmark also passes all 14 input/margin combinations on both supported runtimes. At the 0.0025 construction target, the longer route decreased from 4,988.5 to 2,324.3 ms on Node 22 and from 5,583.2 to 2,299.3 ms on Node 24 versus the preceding recorded reference experiment. These are single observations in Node's SSR harness, excluding worker startup and compatibility-baseline compilation. They are not comparable to browser p95 and remain above two seconds; no server-generation latency claim is made. The browser result measures the intended worker execution approach separately.

## Scope and remaining work

These checks cover the frozen synthetic corpus and an isolated minified worker. They do not establish Studio integration, slow-device performance, network download latency, rendered CSS/SVG/Figma fidelity, broad source coverage or human visual acceptance. No product module imports the experiment, and no saved format, current export, dependency or service changed. Full product release gates were not rerun for this isolated slice.

The next gate is shared-core and Studio integration: a separately versioned compiler/selection, strict recovery of existing V1 data, cancellation through Studio's current operation guard, and revalidation of selected output before export. Preserve source permissions and final-paint accessibility checks. Test the integrated UI and actual renderers before claiming the feature locally verified. The experiment's repeated measurements are evidence for proceeding to that work, not completion of AC-017 or the full PRD.
