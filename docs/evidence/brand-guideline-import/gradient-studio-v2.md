# Shared gradient V2 and Studio verification

This slice connects the continuously checked gradient compiler to standalone Studio. PDF, Figma-capture and website reviews use the same editor, source restrictions, catalog permissions and portable output. Figma plugin execution is not required. It advances TASK-008 and TASK-009; it does not close the full import PRD or establish visual acceptance.

## What changed

New authored gradients use `teul.gradient-design.v2`, authored selection V4, Workspace V7 and refresh lineage V6. Exact source channels and authored anchors remain unchanged. The compiler constructs a candidate at a 0.0025 target with at most 64 compiled stops. A separate outward-interval calculation must bound the entire canonical paint within exactly 1/200 OKLab of the versioned mathematical route. Exhausting its budget returns unassessed. Final-paint color limits and the declared text foreground have a separate gate; a fidelity pass cannot override their failure or a source prohibition.

The production shared core owns construction, serialization, interval arithmetic and reference evaluation. Experiment harnesses import those modules; duplicate math files and the in-memory source-replacement plugin are removed. Seven frozen V1 JSON/CSS/SVG fixtures verify that extracting common construction and serialization preserves old output exactly. Old source-project, workspace and lineage readers remain strict. New formats cannot be smuggled into older envelopes.

The new saved design contains its exact paint and reference identity, not a cached success. Structural parsing checks values, shape, anchors and hashes without running the expensive numerical check. A source refresh preserves the selected paint only when source, foreground and catalog correspondence still hold. Reopening rechecks the current paint before enabling SVG/CSS. Failed or unassessed work stays saveable for correction.

## Worker and editor behavior

Each request owns a browser worker. Generation, final verification and bounded catalog suggestions execute there; the React render path no longer performs the expensive check. Responses bind the request, current source and review, exact design and paint, policy and mathematical-reference version. Only the current client can admit a completed verification object. Copied JSON, a matching frozen object and a forged saved success cannot restore its in-memory admission.

Completion, cancellation, timeout, dispatch failure and worker failure terminate the worker and remove handlers. Captured late callbacks cannot publish after settlement. Regeneration preserves the current selected paint until a replacement succeeds. The worker is bundled inline so a project can be rechecked after Guidelines has loaded and the browser goes offline; this does not make the entire app an offline-installable application.

Pending jobs and completed verification use different lifetimes. A newer storage operation cancels pending generation under the existing operation ordering. A completed check remains valid across save/update/download because those actions do not change the open design. Source edits, project replacement and unmount invalidate it. Local open and revision-open invalidate dependent work before their asynchronous reads finish.

## Verification

The focused core suites cover independent arithmetic oracles, exact old-format recovery, strict V2 parsing, altered but hash-valid paint, the frozen between-sample counterexample, work budgets and separate final-paint checks. Studio's worker-client tests exercise request/source/design/paint/policy binding, cancellation, late replies, malformed results, worker failures and recovery. Storage tests cover V7 recovery, old-envelope rejection, exact refresh and changed-foreground invalidation.

Production browser checks exercise actual PDF review, Figma and website retained sources, source restrictions, explicitly permitted catalog stops, editing, failed and unresolved assessments, narrow-screen controls, keyboard focus, offline recovery and stale worker replies. They serve the built Studio bundle, with Guidelines explicitly enabled for private proof. Fixture construction and independent Node comparison use a separate SSR instance; browser pages do not import development modules.

Saved source values, authored controls, selected paint, hashes and CSS/SVG remain exact across browser and Node replay. Independently recomputed interval and contrast bounds may differ by a few floating-point units. The checks require exact remaining JSON, at most 1e-11 difference in the identified recomputed numeric fields, and an independent pass against the unchanged fidelity/contrast thresholds in both runtimes. This tolerance belongs only to receipt comparison; it never loosens an export threshold or a saved color. One five-stop browser render compares CSS with SVG at 800 by 480 pixels with at most 2/255 per channel difference. The [CSS render](gradient-studio-v2-css.png) and [SVG render](gradient-studio-v2-svg.png) retain that observation. [Desktop](gradient-studio-v2-desktop.png) and [mobile](gradient-studio-v2-mobile.png) screenshots document the exercised controls. This is a bounded Chromium observation, not general Figma or display-profile qualification.

The [source-bound receipt](gradient-studio-v2-checks.json) records the exact changed files, test outputs, production asset hashes, local release gates and browser observations. The seven-input production workload measures 30 real UI generations per fixture, including worker startup, client validation and display. Its status and timing remain separate from functional correctness.

## Recorded result

Both full local release gates pass: 3,090 tests in 165 files on Node 22.13.1 and Node 24.19.0, coverage thresholds, audit, lint/typecheck, production/candidate builds, bundle budgets, UI smoke, source integrity and artifact checks. Studio passes 546 tests in 46 files on both runtimes, lint and the enabled production build. Its four production browser suites pass on both runtimes. The focused worker-client suite contributes 42 tests; the new storage migration suite contributes six. Independent reuse, quality and efficiency reviews are resolved, including the additional save-versus-pending-generation regression.

The production workload passes on Apple M4 Pro / macOS arm64 / headless Chromium 153.0.8010.12, served locally with already loaded assets. Each of the seven frozen inputs runs 30 times in a fresh real worker. Timing includes the button click, source validation, construction, both numerical checks, client admission and two animation frames after display. No other benchmark, test suite or build ran concurrently. This is a device-specific result and excludes initial page download/source import.

| Input                                    | UI result p95 |    Maximum |
| ---------------------------------------- | ------------: | ---------: |
| Restrained                               |       99.6 ms |    99.8 ms |
| Black–white                              |      132.0 ms |   132.1 ms |
| Shorter hue                              |       99.3 ms |   100.0 ms |
| Longer hue                               |    1,914.3 ms | 1,916.4 ms |
| Neutral                                  |       98.9 ms |    99.2 ms |
| Five anchors                             |      148.6 ms |   148.7 ms |
| Recompiled between-sample counterexample |      746.7 ms |   748.0 ms |

All 210 generations have deterministic paint, at most 35 compiled stops and independently passing fidelity/final-paint receipts. No generation produced a main-thread long task of 50 ms or more. The separate lifecycle checks cancelled an unfinished worker in 0.7 ms on each runtime, preserved exact unsaved work after cancellation/failure, recovered with a fresh worker, and proved that a newer save persists while a delayed older result is discarded. This closes the local declared gradient workload, not the full PRD performance, visual or release acceptance.

## Remaining boundaries

The feature remains in the private, explicitly enabled Guidelines proof. Live Figma connection/host qualification, approved provider comparison, full source corpus evaluation, broader selective refresh, independent designer acceptance and destination-specific Figma checks remain open. A mathematical pass establishes neither beautiful colors nor approved brand use. The separate full PRD acceptance gates remain active; this implementation is not a deployment or a completed product release.
