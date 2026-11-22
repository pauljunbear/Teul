# Teul Studio — Plan of Action

## Plan Control

| Field                    | Value                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Canonical PRD            | docs/prds/2026-09-25-teul-web-studio.md                                                          |
| Plan status              | Blocked                                                                                          |
| Last updated             | 2026-09-25                                                                                       |
| Current release state    | Pushed                                                                                           |
| Integration receipt      | Fast-forward integrated into private main; `git ls-remote <private-remote> refs/heads/main` confirms b371253 |
| Commit receipt           | b371253afc64896866b71c116445e6e0ee6e6a31                                                         |
| Deploy receipt           | Pending web deployment                                                                           |
| Live observation receipt | Pending                                                                                          |
| Critical path            | TASK-001 → TASK-002 → TASK-003                                                                   |
| Highest uncertainty      | RISK-001                                                                                         |

## Strategy

Deliver OUT-001 through a thin browser interface over existing engines. Build one complete input-to-export path before adding library browsing. Keep this work isolated from plugin behavior. Stop and fix the adapter if it cannot preserve sources; never silently substitute an older engine.

## Milestones and Tasks

### TASK-001 — Prove the browser engine seam

- **Purpose:** Expose the new foundation with an inspectable contract.
- **Maps to:** REQ-001, REQ-002, AC-001, AC-002
- **Scope:** web/src/lib/teul.ts and its tests; web build scaffold.
- **Dependencies:** DEC-001; existing pure core APIs.
- **Implementation result:** Typed generation, library, contrast and export adapter.
- **Verification:** npm --prefix web test; npm --prefix web run build.
- **Expected evidence:** Exact-source and exact-Radix assertions; valid production bundle.
- **Recovery path:** Revert web-only adapter; existing plugin unchanged.
- **Authority:** Autonomous within requested build.
- **Status:** complete

### TASK-002 — Complete the designer workflow

- **Purpose:** Let a designer create, inspect, save and export a system.
- **Maps to:** REQ-003, REQ-004, REQ-005, AC-003, AC-004, AC-005
- **Scope:** web React UI, shadcn components, styles and browser smoke checks.
- **Dependencies:** TASK-001 contract (scaffolding may run in parallel).
- **Implementation result:** Create, Library and Contrast views with responsive controls and honest states.
- **Verification:** Production browser at desktop and 390px; invalid-input, keyboard, save/reload, download and mode scenarios.
- **Expected evidence:** Screenshots and focused smoke report.
- **Recovery path:** Fix/revert web-only UI; stored inputs are versioned and bounded.
- **Authority:** Autonomous.
- **Status:** complete

### TASK-003 — Review, integrate and deploy

- **Purpose:** Put the usable interface on private main and a hosted URL.
- **Maps to:** REQ-006, AC-006
- **Scope:** Exact web diff, documentation, local verification, Git and static private-host release.
- **Dependencies:** TASK-001, TASK-002; OPEN-001 only for app creation.
- **Implementation result:** Simplify findings resolved, reproducible build, private main pushed, deployed app observed.
- **Verification:** npm --prefix web test; npm --prefix web run build; npm --prefix web audit; git ls-remote <private-remote> main; the private host and live browser.
- **Expected evidence:** docs/evidence/2026-09-25-teul-web-studio.md with checks and release locators.
- **Recovery path:** Revert web commit/redeploy previous ZIP; no plugin changes.
- **Authority:** Git release authorized by user; create-app settings need final confirmation per tool.
- **Status:** blocked

### TASK-004 — Enable concrete design feedback

- **Purpose:** Capture Paul's feedback against the actual element and page.
- **Maps to:** REQ-007, AC-007
- **Scope:** web/src/main.tsx, project-local dependencies, scripts/feedback.mjs, scripts/feedback-read.mjs, README.
- **Dependencies:** TASK-002; DEC-004. Independent of hosted deployment.
- **Implementation result:** Development toolbar with local persistent receiver and readable pending annotations.
- **Verification:** Create one synthetic note through the browser toolbar; read exact text/page/selector through HTTP and the reader, reload, delete only that test note. Run web lint/build/audit and verify production excludes Agentation and both listeners bind loopback.
- **Expected evidence:** docs/evidence/2026-09-25-teul-agentation.md.
- **Recovery path:** Stop feedback command and use ordinary preview; revert only this integration.
- **Authority:** User explicitly requested Agentation. No global rules/configuration changes.
- **Status:** complete

## Verification Ledger

| Acceptance ID | Task     | Proof method                                  | Expected result                                       | Actual receipt                              | Status  |
| ------------- | -------- | --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | ------- |
| AC-001        | TASK-001 | Adapter tests/browser                         | Sources retained; invalid input rejected              | docs/evidence/2026-09-25-teul-web-studio.md | Passed  |
| AC-002        | TASK-001 | Adapter tests/browser                         | Source libraries accurate                             | docs/evidence/2026-09-25-teul-web-studio.md | Passed  |
| AC-003        | TASK-002 | Pair checks/browser                           | WCAG results match actual pairs                       | docs/evidence/2026-09-25-teul-web-studio.md | Passed  |
| AC-004        | TASK-002 | Export/storage tests/browser                  | Valid files and recoverable saved inputs              | docs/evidence/2026-09-25-teul-web-studio.md | Passed  |
| AC-005        | TASK-002 | Browser                                       | Responsive, labeled, recoverable                      | docs/evidence/2026-09-25-teul-web-studio.md | Passed  |
| AC-006        | TASK-003 | Review/build/Git/deploy/browser               | Integrated, pushed, deployed, observed                | Pending                                     | Planned |
| AC-007        | TASK-004 | Browser, HTTP, listener and production checks | Exact annotation reaches agent; production unaffected | docs/evidence/2026-09-25-teul-agentation.md | Passed  |

## Decision and Scope Changes

2026-09-25: Bound scope to a static standalone studio; plugin release completed before web work. No new engine, database or evaluation program.

## Release Checklist

- [ ] Must requirements and negative/recovery cases pass.
- [x] Dependency, accessibility and performance checks pass.
- [x] Documentation and rollback instructions are complete.
- [x] Simplify findings are resolved.
- [ ] Deployment settings confirmed.
- [ ] Private main and deployed build agree; lifecycle state is precise.

Only hosted app creation is blocked, pending OPEN-001. All source and verification documents are integrated and pushed. Do not repeat source implementation or the plugin release; continue from the prepared static ZIP after the access choice arrives.
