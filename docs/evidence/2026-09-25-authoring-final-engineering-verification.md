# Integrated authoring verification

The earlier product source `047c59b` passes the fixed performance workload and replays the four unchanged reference reconstructions on both supported runtimes. The [full repository gates](2026-09-25-authoring-dual-runtime-gates.md) also pass. These are local engineering checks; the current source/craft evaluation, owner review and native-host acceptance remain separate.

Current candidate `ecec5f1` has [separate final gate and dependency-parity evidence](2026-09-25-authoring-candidate-verification-ecec5f1.md). Measurements below remain historical observations; their original receipts are preserved.

## Performance

The unchanged 100-color, 50-rule, two-mode workload ran on an Apple M4 Pro with 48 GiB memory, macOS kernel 25.6.0 and Node 22.13.1. Thirty warm samples follow three warmups; cold startup is recorded separately.

| Measurement                                      |      Result |  Required |
| ------------------------------------------------ | ----------: | --------: |
| Warm median                                      | 1,699.15 ms |  Reported |
| Warm p95, nearest-rank sample 29                 | 1,752.44 ms | ≤2,000 ms |
| Largest cancellation latency across seven probes |   138.19 ms |   ≤250 ms |
| Cold module load                                 |     7.11 ms |  Reported |
| Cold validated-input setup                       |    31.61 ms |  Reported |
| Cold first analysis                              | 1,749.28 ms |  Reported |

All 34 complete outputs retain the same receipt and raw output identity as TASK-005. The workload and fixture hashes are unchanged. All 40 recorded dependency hashes match the current files. The driver retains the exact executable, input, dependency manifest and separate fallback-cancellation input. No workload or acceptance limit was reduced.

Independent review recomputed the sample arithmetic, compared the TASK-005 workload and input identities, checked all retained file hashes and inspected the seven cancellation stacks. It found no remaining issue. Its private report is `implementation-baseline/task008-final-performance/independent-review.json`, SHA-256 `284f9088bf09c9c1ac05f0d9a198b3fa934e85d590e08c2230ca01c20cd5646b`.

The complete private record is `implementation-baseline/task008-final-performance/receipt.json`, SHA-256 `396276aa3bd5c231dd7229f0bb364151f3caf1b9be6b6deef28759f42dd7a0bf`. The measured bundle is 707,528 bytes, SHA-256 `ad520fb1d6d9b44dab9cc0a33ce4fbe97622ebbf613b58712490a04cd148f3e6`. Cancellation probes cover initial validation, construction, interaction selection, composition, ranking, catalog enumeration and fallback enumeration. They are individual local observations, not a latency distribution or Figma-host measurement.

## Reference replay

Crane, Medium, Robinhood and Coinbase replay against the current source on Node 22.13.1 and Node 24.19.0. All ten deterministic output files match across runtimes. The replay binds 276 unchanged original files and 15 loaded modules; the 13 repository modules match product commit `047c59b`.

The proof retains four canonical models, seven explicit numeric-choice variants, 38 canonical assessments, 87 prior variant assessments, 118 expanded rule cases, 82 rules and 160 assertions. It checks the existing geometry and exact paints for 38 canonical applications and 83 expanded SVG boards. It does not rerender pixels or observe Figma.

All 107 printed numeric records, 641 claims, 20 conflicts and 33 unconverted source instructions remain visible. The 28 canonical missing numeric identities remain missing, including all 19 Coinbase identities. Successful replay therefore establishes compatibility with the represented source subset; it cannot establish whole-guideline compliance or missing numeric authority.

The complete private record is `implementation-baseline/task008-current-reconstruction-replay/receipt.json`, SHA-256 `21d2f17e8f20ddbc1fede2ab0ebdb5ba9f2d9a47e73bfa782b55fa9c375550fb`. Its manifest pins all 27 new files. Original models, variants, images and source packets were not changed.

## Generic constraint regression

Both full release gates rerun the actual constraint suites on the final code. `colorSystemGenericBrandConstraintsPipelineV1.test.ts` checks changed or stripped confirmations and handoffs, including rehashed outer receipts. `colorSystemSourceCompilerV2.brand-constraints.test.ts` checks actual generation, impossible exclusions, every generated member, installed source pins and legacy no-rule output parity. The brand-constraint, builder-integrity and authored-candidate suites cover supported scope and complete inventory gates. All pass as part of the recorded 2,829-test runs. This completes AC-018's required final repetition without inferring visual or host acceptance.

## Prospective evaluation infrastructure

All 120 private adapter, renderer, complete-output validation, source-ledger, result-transport and harness tests pass on Node 22 and Node 24. The candidate bundle and all 71 recorded dependencies match their identities. An independent metadata-only review cleared the third-round freeze after DEC-027 explicitly carried forward the unchanged ordered-Radix comparison policy.

Round 3 binds 1,098 files, including the two independently sealed fresh cases, before their substantive inputs or generated outputs are opened. Its freeze SHA-256 is `7295074363ed34e9cc9d188cefed82a2f525c68672e23984b69a789c63899d75`. All 24 declared invocations ran once: eight candidate and four baseline outputs pass complete mechanical assessment and rendering; two methods report infeasibility and ten report unsupported coverage. The independent source review then found conditional-permission failures in two candidates and a contradictory held-out count. Round 3 is retained as failed; both complete source-audit records remain in progress. Original rounds 1 and 2 remain failed and immutable. Passing infrastructure or mechanical tests does not establish source eligibility or visual quality.

The generated status previously named the public mirror as the shipping repository. Its generator now matches the repository operating contract: the owner’s private `main` is the shipping line and the public repository is the Community mirror. All six existing status-script checks pass on Node 22 and Node 24. This text-only generator correction does not change product artifacts.
