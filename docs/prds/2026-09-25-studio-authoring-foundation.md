# Teul Studio: reliable saved work and complete product color systems

## Document Control

| Field               | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Status              | Released                                                  |
| Depth               | Standard                                                  |
| Extensions          | Refactor                                                  |
| Accountable decider | Paul Jun                                                  |
| Audience            | Designers and implementation agents                       |
| Last updated        | 2026-09-25                                                |
| Canonical PRD       | docs/prds/2026-09-25-studio-authoring-foundation.md       |
| Derived plan        | docs/plans/2026-09-25-studio-authoring-foundation-plan.md |
| Release state       | Pushed                                                    |

### Skill Stack

| Concern                     | Selected skill               | Application                                                             |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| Contract and implementation | create-prd-and-build         | Two approved workstreams, linked acceptance and proof                   |
| Scope and uncertainty       | derisk-the-plan              | Existing authoring precedent, thin adapter, early complete-system proof |
| Interface                   | product-craft                | Simple controls, complete states, real component comparisons            |
| Review and release          | simplify; workstream-steward | Independent exact-diff review, local gates, private main                |

## One-Page Summary

Paul approved two next pieces after the Studio audit: harden the existing tool, then connect it to the full authoring foundation. The current interface can lose saved work across tabs and miss useful suggestions. Its component preview, saved inputs, and scale exports also represent different things. Deliver a reliable Studio in which a selected product direction is one durable recipe: its actual color roles and states drive preview, reopen, and exports.

Reuse the existing construction, complete-application assessment, comparison, recipe, and delivery APIs. Preserve the scale exploration and exact library workflows. No new generator, model service, account system, or brand-policy inference. Success means the reproduced defects are covered and a designer can enter a palette, compare feasible directions, select one, save it, and recover/export the same system. Appetite is two bounded engineering workstreams with one thin authoring adapter and a small transactional browser store.

## Problem and Evidence

| ID       | Claim                                                                                                                      | Classification | Source and implication                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| EVID-001 | A second tab's save overwrites another tab's palette.                                                                      | Verified       | Production browser repro at ab53978; App.tsx rewrites a stale array. Replace whole-array writes with atomic intent-based mutations. |
| EVID-002 | Pink/orange inputs #F27291/#F37420 return no companions despite eligible Wada combinations.                                | Verified       | companions.ts limits to eight before checking every anchor; Wada 248 satisfies both references. Gate before limiting.               |
| EVID-003 | #777777 chooses white at 4.478:1 even though black passes; long names overflow desktop and 320px scale targets are narrow. | Verified       | Adapter and production browser audit at ab53978. Add targeted regressions.                                                          |
| EVID-004 | Preview choices, saved inputs and exported scales are separate contracts.                                                  | Verified       | App.tsx ComponentPreview, lib/saved.ts and lib/teul.ts exportScales. One selected application must drive all three.                 |
| EVID-005 | Existing core provides complete applications, bounded comparison, recipes and semantic delivery.                           | Verified       | colorSystemDesignerScaleV1, AuthoringRunV1, RecipeV1 and AuthoringDeliveryV1. Integrate these, preserving their gates.              |
| EVID-006 | Dead-export reporting excludes Studio and misses build aliases; specific obsolete picker/CSS branches are removable.       | Verified       | report-dead-exports.js and audit at ab53978; review 39 candidates rather than deleting blindly.                                     |
| EVID-007 | Paul authorized both workstreams end-to-end.                                                                               | Verified       | Task message 2026-09-25; implement and push private main without repeated continuation prompts.                                     |

The crux is incomplete integration, not a missing generation algorithm. Alternate framing: a styling-only repair leaves preview/export divergence. The do-nothing option leaves proven data loss and missing results. Assumption: product UI is the first complete-system purpose; arbitrary artwork/chart authoring and brand-guideline ingestion remain separate. Unknown: human preference among generated directions; numerical feasibility does not establish taste.

## Users and Journeys

| Actor              | Current journey                                              | Desired journey                                                                                                  | Recovery                                                                                                 |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Designer           | Enter colors, inspect scales, separately infer product usage | Choose primary anchor and supporting neutral direction, compare complete light/dark examples, select/save/export | Invalid or infeasible input preserves the last selection; show reason and editable controls              |
| Returning designer | Save swatches and regenerate later                           | Reopen the exact chosen recipe and roles, retaining originals                                                    | Existing v1 saves remain readable; unavailable/unknown data is preserved; storage conflicts are explicit |

Loading, cancellation, no feasible direction, one direction only, storage unavailable/full/conflict, invalid imports, and no-close catalog results must have explicit states. Candidate results arrive as a complete run; stale results cannot replace newer input. Browsing and standalone contrast remain available.

## Goals and Non-Goals

- OUT-001: No silent loss across tabs; the reported input/layout defects pass regressions, and safe cleanup has consumer evidence.
- OUT-002: One selected recipe drives complete product preview, saved work, and semantic export in both modes; useful directions are compared when available.
- Guardrails: source values, exact Radix libraries and historical provenance remain intact; no false aesthetic/brand approval, no partial application labeled complete, no public-mirror publication.
- Non-goals: new color algorithm, hosted data service, accounts, arbitrary guideline ingestion, every design-system role, Figma mutation/qualification, new hosted CI, or global skill changes.

## Current System and Constraints

The canonical checkout is Teul on private main at ab53978051b32b21e74d4104e05a247aa6fba133. Studio is a static React/shadcn package importing pure core APIs. Its local feedback URL is 127.0.0.1:5179 with Agentation at 4747. Browser production checks use a separate preview. The Figma plugin uses its own production and candidate builds and remains a separate exposure boundary.

Shared catalog changes require the repository's dual-runtime local release gates. Web changes require lint, typecheck/build, unit and browser tests, dependency audit, and visual inspection. No external runtime dependencies or network requests are needed for color generation. Hosted app creation still has the existing access/settings decision; completion here means verified local operation and private main unless that decision arrives.

## Requirements

| ID      | Priority | Requirement                                                                                                                                                                                                    | Provenance         | Acceptance     |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| REQ-001 | Must     | Saves/deletes across tabs preserve unrelated work, detect stale updates, and enforce capacity atomically; existing saved palettes migrate without deleting their source data.                                  | EVID-001           | AC-001         |
| REQ-002 | Must     | Apply all-reference and remaining-companion eligibility before limiting Wada results; keep source identities and legacy query behavior unchanged when the option is absent.                                    | EVID-002           | AC-002         |
| REQ-003 | Must     | Select a passing text foreground when available, contain valid long names, provide reachable narrow-screen scale controls, and remove only proven obsolete code.                                               | EVID-003, EVID-006 | AC-003         |
| REQ-004 | Must     | Provide entry-aware dead-code reporting and a reproducible local verification path covering Studio and plugin; enable available unused-code compiler guards.                                                   | EVID-006           | AC-004         |
| REQ-005 | Must     | Build product systems through existing authoring/assessment APIs with simple primary/support controls; retain every entered source, handling neutral/end-point colors without forcing them into accent step 9. | EVID-004, EVID-005 | AC-005         |
| REQ-006 | Must     | Offer up to three materially different feasible directions, with complete declared interaction states and both modes; report infeasibility, cancellation or limited choices honestly.                          | EVID-005           | AC-005, AC-006 |
| REQ-007 | Must     | Use the selected canonical recipe for actual component paints, saved/reopened selections, and semantic CSS/token exports; preserve recipe identity and selected roles.                                         | EVID-004, EVID-005 | AC-007         |
| REQ-008 | Must     | Retain exact Radix, historical browsing, companions, standalone contrast, existing scale exports and local Agentation; deliver docs and tested source on private main.                                         | EVID-007           | AC-008         |

| ID      | Category       | Requirement                                                                                                                                                                                     | Acceptance     |
| ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| NFR-001 | Responsiveness | For the fixed 1–6-color corpus, record production timings; common full runs target under 2s, no synchronous task above 200ms, cancellation settles within 500ms. Lazy-load the authoring graph. | AC-006         |
| NFR-002 | Accessibility  | Keyboard reachability/focus, 320/390/1024/1440px containment, 44px mobile scale targets, actual-pair contrast and no false whole-product certification.                                         | AC-003, AC-007 |
| NFR-003 | Data integrity | Validate persisted/imported recipes, bound active count and bytes, preserve legacy/unsupported data, fail visibly on quota/conflicts, and never evict silently.                                 | AC-001, AC-007 |

## Acceptance and Verification

| ID     | Covers                    | Preconditions and action                                                                                                           | Observable result                                                                                                                                               | Proof method                                                 | Status/evidence                                                                                                                                                                      |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-001 | REQ-001, NFR-003          | Two tabs save concurrently, update/delete stale records; load legacy and malformed/future data; exercise capacity/storage failure  | Unrelated records survive, stale writes conflict, deletes do not resurrect, migration retains original bytes, errors do not claim success                       | Store tests and real IndexedDB browser scenarios             | Passed — node-24/storage-browser.json: 9 native storage scenarios, including full-capacity responsive validation. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md. |
| AC-002 | REQ-002                   | Query reported pink/orange pair and distant RGB trio; compare absent-option legacy receipts                                        | Eligible companions returned for first, honest empty second, deterministic bounded output and unchanged legacy identities                                       | Shared catalog and Studio tests                              | Passed — catalog/proposal/refinement tests and companions tests; complete legacy receipt hash preserved. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.          |
| AC-003 | REQ-003, NFR-002          | Gray text case; 80-character unbroken name; narrow controls; inspect cleanup diff                                                  | Passing foreground, no page overflow, mobile targets at least 44px, existing Custom picker retained                                                             | Unit tests, browser geometry and consumer checks             | Passed — gray regression and node-24/authoring-browser.json: four widths, 44px targets and Custom picker. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.         |
| AC-004 | REQ-004                   | Run reporting across web and both plugin aliases; execute combined local verification path                                         | Required entrypoints recognized, no bulk false deletion, unused guards pass, checks fail on subprocess errors                                                   | Script tests and gate receipts                               | Passed — 58 script tests; both full local gate receipts and entry-aware report. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.                                   |
| AC-005 | REQ-005, REQ-006          | Generate fixed corpus: blue/orange, recorded private brand, yellow, gray, white/black plus chromatic seed, neighboring colors, neutral-only | Exact sources retained; neutral roles available; complete feasible applications when possible; explicit blocked reason otherwise                                | Real core integration/corpus tests                           | Passed — 36 Studio tests and node-24/performance.json: fixed corpus and bright chromatic regressions. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.             |
| AC-006 | REQ-006, NFR-001          | Compare alternatives, rerun same inputs, cancel/change inputs; measure production run                                              | Distinct gated directions, deterministic identity, no stale adoption or partial run, timings satisfy stated bounds or resolve a measured failure before release | Integration and browser timing                               | Passed — deterministic timing corpus, active cancellation, stale-result and real interaction browser checks. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.      |
| AC-007 | REQ-007, NFR-002, NFR-003 | Select a direction/mode, inspect every declared state, save/reload, export CSS/JSON                                                | Preview paints equal stored selected application and exported semantic aliases in both modes; untrusted/corrupt recipe rejected without destroying valid work   | Contract tests and browser computed-style/export comparisons | Passed — node-24/authoring-browser.json: native paint, semantic alias, selected recipe and saved replay parity. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.   |
| AC-008 | REQ-008                   | Run old/new browser paths, full relevant gates, independent review, integrate/push                                                 | Libraries/source data and scale exports preserved, feedback mode works only locally, private main matches tested implementation                                 | Release receipt and Git                                      | Passed — both full runtime gates, independent reviews and private main 8689261; local feedback observed. Evidence: docs/evidence/2026-09-25-studio-authoring-foundation.md.          |

Negative cases must fail if conflict checks, source identity, complete-state assessment, or recipe/export parity are removed. The corpus is an engineering usefulness check; Paul's visual approval remains a separate observation.

## Technical Design

Keep one thin lazy Studio authoring adapter. It compiles simple controls through the existing designer-scale/application builder, runs the existing authoring comparison, and returns only complete feasible selections. Support colors have explicit provenance; source originals remain separate. The selected core recipe is the authority for resolved preview paints and delivery exports. UI mode/inspection state never invents a different exported application.

Use transactional browser storage for intent-based insert/update/delete rather than writing React snapshots. Each record has a storage ID and revision; mutations check expected revisions. Preserve the v1 localStorage key and mark one-time migration only after a successful transaction. Cross-tab notifications refresh views but do not provide transaction safety. Unknown payloads remain inspectable/preserved, not executed.

Add optional catalog eligibility before top-k selection; absent options preserve existing query and policy identity. Keep the exhaustive scan bounded and cancellable. Existing scale browsing remains an explicit workflow; complete product generation does not relabel legacy scale-only recipes as full systems.

## Security Privacy and Compliance

All computation/storage remains local to the browser origin. No credentials, uploads, telemetry or remote generation are added. Inputs and recipe JSON are bounded inert data; core parsers validate them before replay. Export names remain escaped. Agentation remains development-only on loopback. Browser-origin storage can be cleared by the user; export remains the portable backup.

## Performance Reliability and Observability

Record a fixed corpus run's elapsed time, longest browser task, cancellation time, source count, direction count and result status. Keep bounded search and expose limit/infeasible/cancelled distinctly. Production build size is recorded with the lazy authoring chunk separately. Storage errors retain the on-screen selection and permit export. No polling service or persistent agent watcher is needed.

## Behavior Baseline and Invariants

| ID       | Baseline/consumer                                                                                                    | Intended change                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| BASE-001 | Existing v1 saves contain swatches/method only; two tabs can overwrite them.                                         | Transactional records with preserved legacy migration and exact selected recipes; AC-001. |
| BASE-002 | Libraries, authored scales, exact Radix, CSS/JSON/Tailwind scale exports and Agentation pass existing browser tests. | Preserve these workflows while adding full product authoring; AC-008.                     |
| BASE-003 | Shared catalog callers have deterministic query/policy/candidate identities.                                         | New eligibility is opt-in; old callers retain results and receipts; AC-002.               |

| ID      | Invariant                                                                                              | Verification                                                             |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| INV-001 | Source colors and published datasets remain unchanged; generated support paints are identified.        | Corpus/source parity and existing provenance gates; AC-005, AC-008.      |
| INV-002 | Only complete assessed applications become selectable; saved data grants no execution/Figma authority. | Core negative/replay tests and Studio failure scenarios; AC-005, AC-006. |
| INV-003 | A selected recipe determines preview, save and semantic export.                                        | Exact paint and identity comparisons across reload/export; AC-007.       |
| INV-004 | No silent saved-data eviction, lost update or resurrection.                                            | Concurrent browser transactions, migration and failure cases; AC-001.    |

Characterization tests: the existing 21 Studio unit tests and 15 browser scenarios record source values, scale exports, saved v1 parsing and keyboard/library behavior. New regressions characterize the audit failures before their fixes. Blast radius: Studio storage/UI and the opt-in shared catalog query; plugin production/candidate import the catalog, so both channels require gates. Source datasets and Figma host mutation APIs are outside the change.

## Refactor Strategy and Migration

First prove one complete two-mode system through core recipe delivery; in parallel land independent hardening. Then add the lazy product workflow, integrate transactional storage, and bind preview/export to the selected recipe. Retain a distinct legacy scale path and the original v1 data. Remove only unreachable picker/CSS code once its consumers are verified. Do not remove core authoring modules because Studio previously omitted them.

## Risks and Mitigations

| ID       | Risk                                                             | Mitigation                                                                                         |
| -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| RISK-001 | Large core graph makes Studio slow or burdens simple use.        | Early browser proof, lazy loading, bounded defaults, measured corpus and cancellation.             |
| RISK-002 | Migration loses data or stale tabs resurrect deletions.          | Atomic revision checks, one-time committed migration, retained raw v1 bytes and concurrent tests.  |
| RISK-003 | Numerically valid alternatives are presented as approved design. | Show actual components and source differences, keep qualified false, distinguish human preference. |
| RISK-004 | A broad cleanup destabilizes the plugin.                         | Proven consumers, optional query semantics, both plugin channels and dual-runtime gates.           |

De-risk review: recent precedent is the existing designer-scale → authoring run → recipe → delivery path. Fewer moving parts means one adapter and one selected recipe rather than parallel preview/export logic. First prove the complete path, then build controls. Keep scale exploration and source data reversible. Defer arbitrary brand-rule editors, charts, cloud sync and general optimization until this workflow has direct usage evidence.

Old/new coexistence: upgraded tabs write only the transactional store; v1 localStorage is a retained migration snapshot and legacy cached tabs cannot write the new database. The product-system recipe and legacy scale-only recipe remain explicitly distinguished. No dual-write or silent conversion of scale-only output into qualified applications.

## Migration Compatibility and Rollback

Preserve the original v1 key unchanged. Migrate recognizable records atomically and keep unsupported raw data. Upgraded tabs share the new transaction store; old cached Studio builds are not allowed to overwrite new records. Rollback code can still read the untouched v1 snapshot; newly saved full recipes must be exported before reverting to an old UI, and the new database is retained. A failed migration never clears either source. Shared query extension is optional and old callers remain valid.

## Rollout and Operations

Deliver to local Studio and private main after meaningful checks and independent review. A combined local gate invokes Studio verification and the existing plugin gate on Node 22 and 24 when shared code changes. It writes auditable receipts, not hosted CI. Keep the feedback server running for Paul. Static hosting is a separate existing settings gate; no public mirror or Figma qualification is implied. README records migration, conflict recovery, recipe export and rollback.

## Decisions and Open Questions

- DEC-001: Reuse complete authoring APIs; no new generator or model service. Product UI is the first complete-system purpose alongside existing scale exploration.
- DEC-002: Use real transaction safety for storage; notification synchronization alone cannot prevent concurrent writes.
- DEC-003: Eligible Wada results are ranked after constraints, without broadening thresholds or inventing fallback colors.
- DEC-004: User authorization covers both workstreams, private main push and local verification. Existing hosted settings remain unresolved; do not infer an access choice.
- DEC-005: Resolve OPEN-001 through the existing recipe → geometry → authored-delivery path. The fixed production corpus completes common runs in roughly half a second; final gate receipts record exact measurements.
- DEC-006: The existing designer form pins an accent at step 9. Bright/dark corpus failures showed this is unsuitable for a general product palette. Studio uses the existing arbitrary-slot construction to place the exact source by measured lightness per mode, with a recorded placement policy; the shared engine still builds and assesses every state.
- DEC-007: Native fractional sRGB values, rather than rounded hex labels, drive both component CSS and semantic export. Hex remains a readable display/copy approximation.
- DEC-008: Create opens the complete Product system flow; the separate Color scales choice retains the prior authored/Radix exploration and exports.

## Plan of Action

Canonical plan: docs/plans/2026-09-25-studio-authoring-foundation-plan.md. Critical path: TASK-001 → TASK-003 → TASK-004. TASK-002 supplies independent hardening and storage. Highest uncertainty is RISK-001: proving a complete selected system through delivery without a new engine.

## Traceability

| Outcome          | Requirement                                 | Acceptance                     | Task               | Verification receipt                                               | Release gate               |
| ---------------- | ------------------------------------------- | ------------------------------ | ------------------ | ------------------------------------------------------------------ | -------------------------- |
| OUT-001          | REQ-001, REQ-002, REQ-003, REQ-004, NFR-003 | AC-001, AC-002, AC-003, AC-004 | TASK-002           | Verified — docs/evidence/2026-09-25-studio-authoring-foundation.md | Combined local gate        |
| OUT-002          | REQ-005, REQ-006, NFR-001                   | AC-005, AC-006                 | TASK-001, TASK-003 | Verified — docs/evidence/2026-09-25-studio-authoring-foundation.md | Integration/corpus/browser |
| OUT-002          | REQ-007, NFR-002, NFR-003                   | AC-007                         | TASK-003           | Verified — docs/evidence/2026-09-25-studio-authoring-foundation.md | Recipe parity              |
| OUT-001, OUT-002 | REQ-008                                     | AC-008                         | TASK-004           | Verified — docs/evidence/2026-09-25-studio-authoring-foundation.md | Reviewed private main      |

Post-release check: use the retained local Agentation workflow to review which complete direction is useful in a real product. Numerical acceptance does not establish aesthetic preference. Hosted access/settings and Figma runtime qualification remain separate boundaries.
