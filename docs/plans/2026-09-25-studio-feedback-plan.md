# Teul recording feedback — Plan of Action

## Plan Control

| Field                    | Value                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| Canonical PRD            | docs/prds/2026-09-25-studio-feedback.md                                         |
| Plan status              | Complete                                                                        |
| Last updated             | 2026-09-25                                                                      |
| Current release state    | Pushed                                                                          |
| Integration receipt      | Fast-forwarded private main from db42dbd to 01ca094; remote verified 2026-09-25 |
| Commit receipt           | 01ca09453988a4352b18d9f0dca9b3d5c071a44c                                        |
| Deploy receipt           | Not in this pass; existing hosted access decision pending                       |
| Live observation receipt | 5179 and 5180 passed on 2026-09-25; see evidence receipt                        |
| Critical path            | TASK-001 → TASK-002 → TASK-003                                                  |
| Highest uncertainty      | RISK-001                                                                        |

## Strategy

Deliver OUT-001 using existing catalog/scale APIs. Source-backed companion adapter and exact Radix evidence can be implemented independently; one owner integrates UI and verification. Preserve the current valid output on generation failure. Avoid an engine rewrite.

## Milestones and Tasks

### TASK-001 — Expose the foundation accurately

- **Purpose:** Useful companions and inspectable Radix matches.
- **Maps to:** REQ-002, REQ-003, AC-002, AC-003
- **Scope:** web/src/lib/companions.ts and tests; web/src/lib/teul.ts and tests.
- **Dependencies:** EVID-005, EVID-006, DEC-002.
- **Implementation result:** Bounded Wada suggestions with source evidence; unchanged Radix scales plus actual match and correct neutral.
- **Verification:** npm --prefix web test; recorded gray-green and Gold/Amber fixtures.
- **Expected evidence:** Adapter assertions and exact published value parity.
- **Recovery path:** Revert web adapters; core untouched.
- **Authority:** Autonomous.
- **Status:** complete

### TASK-002 — Make the workflow clear

- **Purpose:** Turn the recording into usable UI behavior.
- **Maps to:** REQ-001, REQ-003, REQ-004, REQ-005, AC-001, AC-003, AC-004, AC-005
- **Scope:** web/src/App.tsx, App.css, new color picker component; browser smoke.
- **Dependencies:** TASK-001 API contract; independent layout work may proceed in parallel.
- **Implementation result:** Library picker, companions, match explanation, scrolling, obvious saves, current-pair contrast and restrained layout.
- **Verification:** Browser at 1440px and 390px; picker keyboard/cancel/capacity, scroll, save/reload and stale-draft protection.
- **Expected evidence:** Screenshots and browser report.
- **Recovery path:** Revert UI changes; saved schema unchanged.
- **Authority:** Autonomous.
- **Status:** complete

### TASK-003 — Verify and integrate

- **Purpose:** Return a working improvement on private main.
- **Maps to:** REQ-006, AC-006
- **Scope:** Exact diff, web checks, evidence, README, Git integration.
- **Dependencies:** TASK-001, TASK-002.
- **Implementation result:** Review findings resolved, tested studio running locally, changes integrated and pushed.
- **Verification:** Web lint, tests, build, audit, production browser, feedback toolbar, git ls-remote <private-remote> main.
- **Expected evidence:** docs/evidence/2026-09-25-studio-feedback.md.
- **Recovery path:** Revert web commit; local preview can serve prior build.
- **Authority:** User requested end-to-end; private main push previously authorized.
- **Status:** complete

## Verification Ledger

| Acceptance ID | Task               | Proof method          | Expected result                                       | Actual receipt                                                                                                 | Status |
| ------------- | ------------------ | --------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| AC-001        | TASK-002           | Browser               | Add/replace/cancel/capacity and keyboard pass         | Picker browser: exact selection, capacity, cancellation and focus; docs/evidence/2026-09-25-studio-feedback.md | Passed |
| AC-002        | TASK-001           | Tests/browser         | Factual bounded suggestions, truthful empty states    | Five companion tests and suggestion browser states; docs/evidence/2026-09-25-studio-feedback.md                | Passed |
| AC-003        | TASK-001, TASK-002 | Tests/browser         | Exact values and match evidence; no stale save/export | 744-value parity, match/neutral tests, recorded Gold browser case; docs/evidence/2026-09-25-studio-feedback.md | Passed |
| AC-004        | TASK-002           | Browser/storage tests | Automatic batches and discoverable persistent saves   | Automatic first-entry batches, search reset and saved reload; docs/evidence/2026-09-25-studio-feedback.md      | Passed |
| AC-005        | TASK-002           | Browser/screenshots   | Clear current-pair checks and responsive layout       | Actual preview pair; desktop/390px and picker320px screenshots; docs/evidence/2026-09-25-studio-feedback.md    | Passed |
| AC-006        | TASK-003           | Checks/review/Git     | Verified source on private main                       | 21 tests, 15 browser scenarios, review and remote main 01ca094; docs/evidence/2026-09-25-studio-feedback.md    | Passed |

## Decision and Scope Changes

The recording corrects “another pass with colors” to “with layout” at 2:15. Preserve source values, investigate matching, and refine layout; do not invent replacement historical/Radix colors.

## Release Checklist

- [x] Must requirements have passing acceptance evidence.
- [x] Negative/recovery, source-fidelity and keyboard/mobile checks pass.
- [x] Web build, lint, tests and audit pass.
- [x] Simplify and PRD/diff review findings resolved.
- [x] Documentation and rollback are complete.
- [x] Private main push verified; local/hosted state distinguished.
