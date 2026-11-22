# Authoring performance measurements

This ledger reports the unchanged [frozen workload](2026-09-24-authoring-performance-workload.md). Measurements are local Node source runs, not observed Figma-host performance. The candidate remains unqualified.

Reproduce with Node 22 and a new receipt path. The command refuses to overwrite prior measurements:

```sh
TEUL_AUTHORING_BENCHMARK_RECEIPT_PATH=/absolute/path/to/new-receipt.json npm run verify:authoring-performance
```

## Attempt 1: target missed

The first complete measurement ran on an Apple M4 Pro, 48 GiB memory, macOS kernel 25.6.0, Node 22.13.1. It used the real three-direction authoring runner, the default timer scheduler, three warm-ups and 30 measured warm runs. Every completed run returned the same receipt and passed the frozen output assertions.

| Measurement                                        |      Result |            Required |
| -------------------------------------------------- | ----------: | ------------------: |
| Warm median                                        | 3,568.45 ms |            Reported |
| Warm p95, nearest-rank sample 29                   | 3,609.01 ms |           ≤2,000 ms |
| Largest observed cancellation latency, five stages |   230.62 ms |             ≤250 ms |
| Cold module load                                   |     7.47 ms | Reported separately |
| Cold validated-input setup                         |    46.74 ms | Reported separately |
| Cold first analysis                                | 3,639.29 ms | Reported separately |

The warm target failed. These cancellation observations passed for construction, interaction selection, complete-application assessment, final ranking and catalog enumeration. They were individual probes, not a distribution or a Figma responsiveness claim. Initial-validation and fallback-enumeration probes were absent from attempt 1. Existing production/candidate artifact sizes were not captured in this first timing receipt; the integrated build budget remains a separate required check.

The timed interval includes internal parsing, generation, state selection, composition, source and working-model assessment, final diversity ranking, and returned receipts. Post-timing assertions verify the same three directions, six applications each, all 50 applicable rules, exact source values, generated values actually painted, and the frozen search work. No gates or failed profiles were removed.

| Identity                            | Value                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Workload SHA-256                    | `79eceacdb22a1e8c3c349cf358996227a8cab47607f4b15c2467440df47cba58`                                                  |
| Fixture SHA-256                     | `7bcaae82d79697a548f0c78ba40b70eb1cb80415c44c240bb630b1b07f22c172`                                                  |
| Run receipt, all 34 successful runs | `sha256:14eae517cd2fec111190ffb00a0581b83f86434119bc3073ac747acbad1475e6`                                           |
| Code baseline                       | `f68a26f`, with the TASK-005 working diff recorded in the raw receipt                                               |
| Raw retained record                 | `implementation-baseline/task005/performance-v1/node22-attempt01.json` in the private task evidence                 |
| Independently inspected             | `/root/task002_efficiency/rule_matrix_audit`; arithmetic, identities, stage stacks and measurement boundary checked |

The exact measured bundle and input were retained for diagnosis. A separate CPU-profile run returned the identical result receipt. It attributed about 1.75 seconds of self CPU time to SHA-256 and 1.62 seconds inclusive to repeated model parsing; these categories overlap and cannot be summed. DEC-019 authorizes repair without changing the workload, colors, rules, acceptance thresholds, or output identity.

## Repair and attempt 2

The SHA-256 implementation now uses signed 32-bit round storage. Its serialization, numeric policy, UTF-8 handling and padding are unchanged. Independent review compared the old implementation, the revised implementation and Node's cryptographic oracle on 1,176 raw strings and 533 canonical inputs per supported runtime. Node 22 and 24 both passed, including retained legacy and model-interaction output parity. This verifies identity preservation, not the latency target.

Repeat model validation now uses an explicit internally owned immutable snapshot. Mutable and untrusted inputs still receive every schema, hash, rule-dependency and adoption check. Parsing an owned snapshot returns a detached mutable copy; it does not grant source freshness or approval. Independent replay checked identical complete outputs for ordinary and captured inputs on Node 22 and 24.

The second measurement used the same machine, runtime, frozen workload and thresholds. All 34 complete runs returned the same result receipt as attempt 1.

| Measurement                                       |      Result |            Required |
| ------------------------------------------------- | ----------: | ------------------: |
| Warm median                                       | 1,887.64 ms |            Reported |
| Warm p95, nearest-rank sample 29                  | 1,997.31 ms |           ≤2,000 ms |
| Largest observed cancellation latency, six stages |   144.81 ms |             ≤250 ms |
| Cold module load                                  |     6.88 ms | Reported separately |
| Cold validated-input setup                        |    33.64 ms | Reported separately |
| Cold first analysis                               | 2,085.93 ms | Reported separately |

Attempt 2 passes this local workload, narrowly: the p95 margin is 2.69 ms and the largest warm sample is 2,167.31 ms. The new from-start cancellation probe includes initial validation and completed in 65.60 ms. The other probes cover construction, selection, composition, ranking and catalog enumeration. Fallback-enumeration timing is not established by this receipt.

The raw receipt is `implementation-baseline/task005/performance-v1/node22-attempt02.json`, SHA-256 `f84bea2bed8c6151bfd685e326c63f93d0315042cc9379b5a74983b216aa8a05`. The independent efficiency reviewer checked its arithmetic, sample identities, timestamp differences, stage stacks and unchanged gates. Its exact measured bundle/input files were cleaned up before they could be retained. Their reported hashes are recorded, but cannot be independently compared to the missing bytes. Subsequent measurements must retain those files.

Fresh production and candidate builds separately passed their UI budgets, smoke tests and artifact checks. The candidate UI was 430,073 bytes against 430,080, leaving seven bytes before further authoring UI work. The measurement's existing-artifact inventory itself is explicitly not a rebuild claim. Final review then found a partial-scope exception bug and a signed-zero detachment issue; both were fixed and affected checks repeated before attempt 3. Attempt 2 remains evidence for its recorded source state, not the later integrated artifact or Figma-host behavior.

## Attempt 3: reviewed source passes

The final TASK-005 source includes the review repairs and skips redundant draft/adoption work for unchanged proposal preflights. All authority checks remain. This measurement retains its exact executable, input, dependency manifest and separate fallback-cancellation input. The frozen workload, source values, reviews, search work, thresholds and completed output are unchanged.

| Measurement                                         |      Result |            Required |
| --------------------------------------------------- | ----------: | ------------------: |
| Warm median                                         | 1,770.77 ms |            Reported |
| Warm p95, nearest-rank sample 29                    | 1,885.33 ms |           ≤2,000 ms |
| Largest observed cancellation latency, seven stages |   139.04 ms |             ≤250 ms |
| From-start cancellation including validation        |    40.06 ms |             ≤250 ms |
| Actual fallback-enumeration cancellation            |    28.35 ms |             ≤250 ms |
| Cold module load                                    |     6.91 ms | Reported separately |
| Cold validated-input setup                          |    33.13 ms | Reported separately |
| Cold first analysis                                 | 1,841.63 ms | Reported separately |

All 34 completed runs retain receipt `sha256:14eae517cd2fec111190ffb00a0581b83f86434119bc3073ac747acbad1475e6`. Their raw output SHA-256 is `ff5b18e264e6070c2f71781193287fbbe41047f22a5fd242ffa2cd82fdcfd175`, also matching the earlier Node 22 snapshot replay. The extra cancellation input is derived after the measured runs and cannot alter warm samples. Every cancellation returns no partial output.

| Retained evidence                       | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `performance-v1/node22-attempt03.json`  | `fa3c6f54186a9a0b4bbde39fdd19b30ef1f4ab059b486c188ef68b2ea1745361` |
| Measured `benchmark.cjs`, 663,312 bytes | `c3e420021005e793da4fab2293198f44917db538d2dea9c8fa1abb553d3a402f` |
| Measured `input.json`, 537,050 bytes    | `9321ccda6f49ea354dabfa4685a7219b2835f85c0905023bda7f10bb7ae8c107` |
| Source dependency manifest              | `64a5f647decfb6b22916a1aba4f99e35d92d1ac2f06e15ab6007c0df26c0cb0a` |
| Separate fallback input                 | `1c97ae29e20adc3e29a258e1d86c09c666a144d4e1fe10646cafdf16fa34f6cc` |

These paths are under the private TASK-005 evidence directory. An independent reviewer recomputed the sample arithmetic, checked all 34 output identities, verified the retained bytes and all 38 source-dependency hashes, and inspected the real fallback stack and variant. No material issue was found. The seven probes cover initial validation, construction, initial interaction selection, complete composition, final ranking, catalog enumeration and fallback enumeration. They are individual local observations. TASK-008 must repeat the workload for the integrated candidate; no Figma-host or universal input-size timing claim is made.
