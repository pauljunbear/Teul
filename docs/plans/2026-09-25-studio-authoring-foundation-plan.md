# Teul Studio authoring foundation — Plan of Action

## Plan Control

| Field                    | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Canonical PRD            | docs/prds/2026-09-25-studio-authoring-foundation.md                                               |
| Plan status              | Complete                                                                                          |
| Last updated             | 2026-09-25                                                                                        |
| Current release state    | Pushed                                                                                            |
| Integration receipt      | Fast-forwarded main and verified private main at 8689261c62875da9b5b7b72ed715d3c11915f883    |
| Commit receipt           | 8689261c62875da9b5b7b72ed715d3c11915f883                                                          |
| Deploy receipt           | Existing hosted access/settings decision unresolved                                               |
| Live observation receipt | 2026-09-25 local Studio 127.0.0.1:5179 product and Agentation observed healthy; no browser errors |
| Critical path            | TASK-001 → TASK-003 → TASK-004                                                                    |
| Highest uncertainty      | RISK-001                                                                                          |

## Strategy

Deliver OUT-001 and OUT-002 using existing complete-application primitives. A bridge specialist proves the highest-uncertainty seam; separate owners harden the catalog and storage. Root owns UI, verification tooling, integration and closure. No shared-file edits overlap. If a proposed shortcut bypasses recipe/application assessment, reject it and resolve the existing API boundary.

## Milestones and Tasks

### TASK-001 — Prove a complete selected product system

- **Purpose:** Retire adapter and delivery uncertainty.
- **Maps to:** REQ-005, REQ-006, NFR-001, AC-005, AC-006
- **Scope:** New web/src/lib/authoring.ts and tests; relevant existing core APIs; minimal teul.ts adapter helpers.
- **Dependencies:** EVID-005, DEC-001.
- **Implementation result:** Simple controls compile through core complete-application assessment; feasible directions carry canonical recipes and actual paints with semantic exports.
- **Verification:** Real core tests for fixed corpus, both modes, distinct directions and source retention; first production timing proof.
- **Expected evidence:** Adapter/corpus assertions and timing receipt.
- **Recovery path:** Retain legacy scale path and last successful selection; no irreversible state.
- **Authority:** Autonomous within approved workstreams.
- **Status:** complete

### TASK-002 — Harden persistence, retrieval and verification

- **Purpose:** Remove confirmed data-loss/selection/layout defects and prevent recurrence.
- **Maps to:** REQ-001, REQ-002, REQ-003, REQ-004, NFR-003, AC-001, AC-002, AC-003, AC-004
- **Scope:** Browser saved-store adapter/tests; optional catalog eligibility and callers/tests; App/CSS cleanup; entry-aware report and local verification scripts.
- **Dependencies:** Audit evidence; independent of TASK-001 except full recipe validation shape.
- **Implementation result:** Atomic cross-tab mutations and preserved migration; eligible suggestions; text/layout fixes; only proven dead code removed; Studio included in local verification.
- **Verification:** Concurrent native browser storage tests, catalog backward-compatible receipt fixture, gray/name/mobile regression, tooling fixtures and gate.
- **Expected evidence:** Tests and production browser receipt.
- **Recovery path:** Keep v1 raw snapshot and new database; optional catalog behavior allows old callers; revert isolated UI changes.
- **Authority:** Autonomous; no dataset/global configuration changes.
- **Status:** complete

### TASK-003 — Integrate one recipe across preview, save and export

- **Purpose:** Make the existing authoring foundation usable through simple controls.
- **Maps to:** REQ-005, REQ-006, REQ-007, NFR-001, NFR-002, NFR-003, AC-005, AC-006, AC-007
- **Scope:** Studio App and dedicated product-system controls/preview, lazy bridge, storage integration and browser scenarios.
- **Dependencies:** TASK-001, TASK-002.
- **Implementation result:** Designer can compare complete directions, select a recipe, inspect actual states and both modes, save/reopen/export the same application. Existing scale workflow remains explicit.
- **Verification:** Computed browser colors equal selected recipe and semantic exports; cancellation and stale input; keyboard/mobile; recipe reload and legacy saves.
- **Expected evidence:** Contract comparisons, corpus report, screenshots, browser results.
- **Recovery path:** Fail visibly and retain last completed selection; saved data never migrated destructively.
- **Authority:** Autonomous.
- **Status:** complete

### TASK-004 — Review, verify and deliver private main

- **Purpose:** Finish both workstreams with reproducible proof.
- **Maps to:** REQ-008, AC-008
- **Scope:** Exact task diff, README, evidence, PRD/plan, local release receipts, Git integration and static archive.
- **Dependencies:** TASK-001, TASK-002, TASK-003.
- **Implementation result:** Independent reuse/quality/efficiency and PRD reviews resolved; required gates pass on Node22/24; private main matches tested source; feedback server remains running.
- **Verification:** Combined local verification, artifact hashes, git ls-remote <private-remote> main, PRD complete validator.
- **Expected evidence:** docs/evidence/2026-09-25-studio-authoring-foundation.md and local gate receipts.
- **Recovery path:** Revert code with documented storage export/retention procedure; previous static archive preserved.
- **Authority:** End-to-end work and private main push authorized; hosted access choice remains separate.
- **Status:** complete

## Verification Ledger

| Acceptance ID | Task               | Proof method                    | Expected result                                                            | Actual receipt                                                                                                                                                                 | Status |
| ------------- | ------------------ | ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC-001        | TASK-002           | Browser transactions/migration  | No lost updates or resurrection; v1 preserved                              | Passed — node-24/storage-browser.json: 9 native storage scenarios, including full-capacity responsive validation. See docs/evidence/2026-09-25-studio-authoring-foundation.md. | Passed |
| AC-002        | TASK-002           | Catalog/unit tests              | Eligible companions and legacy identity parity                             | Passed — catalog/proposal/refinement tests and companions tests; complete legacy receipt hash preserved. See docs/evidence/2026-09-25-studio-authoring-foundation.md.          | Passed |
| AC-003        | TASK-002           | Unit/browser/consumer checks    | Passing gray foreground, contained names, reachable controls, safe cleanup | Passed — gray regression and node-24/authoring-browser.json: four widths, 44px targets and Custom picker. See docs/evidence/2026-09-25-studio-authoring-foundation.md.         | Passed |
| AC-004        | TASK-002           | Script tests/gates              | Entry-aware report and combined checks                                     | Passed — 58 script tests; both full local gate receipts and entry-aware report. See docs/evidence/2026-09-25-studio-authoring-foundation.md.                                   | Passed |
| AC-005        | TASK-001, TASK-003 | Real core corpus                | Complete useful systems, retained source, neutral handling                 | Passed — 36 Studio tests and node-24/performance.json: fixed corpus and bright chromatic regressions. See docs/evidence/2026-09-25-studio-authoring-foundation.md.             | Passed |
| AC-006        | TASK-001, TASK-003 | Integration/browser timing      | Bounded distinct results, deterministic and cancellable                    | Passed — deterministic timing corpus, active cancellation, stale-result and real interaction browser checks. See docs/evidence/2026-09-25-studio-authoring-foundation.md.      | Passed |
| AC-007        | TASK-003           | Recipe/reload/export comparison | Exact preview/save/export agreement                                        | Passed — node-24/authoring-browser.json: native paint, semantic alias, selected recipe and saved replay parity. See docs/evidence/2026-09-25-studio-authoring-foundation.md.   | Passed |
| AC-008        | TASK-004           | Gates/reviews/Git               | Verified private main and local feedback                                   | Passed — both full runtime gates, independent reviews and private main 8689261; local feedback observed. See docs/evidence/2026-09-25-studio-authoring-foundation.md.          | Passed |

## Decision and Scope Changes

Use the existing designer-scale and authoring pipeline. The fixed corpus is an engineering regression/evaluation set; human aesthetic acceptance remains separate. No new generator, cloud data service or public release is required.

## Release Checklist

- [x] All Must requirements have passing acceptance evidence.
- [x] Negative/recovery and source-fidelity cases pass.
- [x] Migration/rollback and concurrent saves are verified.
- [x] Browser, accessibility, performance, dependencies and both runtime gates pass.
- [x] Independent review findings are resolved.
- [x] Documentation, preservation/export recovery and static artifact receipts are complete.
- [x] Private main push verified and local/hosted state distinguished.
- [x] Paul can inspect the result through the existing local feedback surface.
