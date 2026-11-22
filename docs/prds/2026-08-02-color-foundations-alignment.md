# Color Foundations Alignment 2026

## Document Control

| Field               | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| Status              | Verified                                                         |
| Depth               | Standard                                                         |
| Extensions          | Refactor                                                         |
| Authoring agent     | Codex create-prd-and-build workflow                              |
| Accountable decider | Paul Jun                                                         |
| Audience            | Teul maintainers, accessibility reviewers, and release reviewers |
| Last updated        | 2026-08-02                                                       |
| Canonical PRD       | docs/prds/2026-08-02-color-foundations-alignment.md              |
| Derived plan        | docs/plans/2026-08-02-color-foundations-alignment-plan.md        |
| Release state       | Locally verified                                                 |

### Skill Stack

| Concern           | Selected skill       | Why it applies                                                     | Expected artifact or gate                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Governed delivery | create-prd-and-build | This changes user-visible color judgments and generated output.    | Validated PRD, traced plan, implementation, verification, independent review. |
| Product audit     | app-assessment       | The request is an evidence-backed assessment of a working product. | Current-state verdict, prioritized findings, measurable recommendations.      |

## One Page Summary

**What:** Make Teul's color and accessibility claims correct at their color-space and rendering boundaries, modernize its generated sRGB gamut mapping, and add an expiring standards-evidence gate.

**Problem:** Teul's core sRGB WCAG math and bundled Radix data are current, but selected Display-P3 values can be interpreted as sRGB, selected layers can omit rendering context, generated scales use an older gamut boundary method, and some Radix/CVD labels promise more than the underlying evidence proves.

**Why now:** The concrete `[0,109,253]` on white fixture changes from `4.5594:1` in sRGB to `4.4936:1` under Display-P3 primaries. That is a pass/fail reversal at the WCAG AA boundary. The 28 July 2026 CSS Color 4 Candidate Recommendation Draft also defines named gamut-mapping algorithms that can preserve materially more chroma than Teul's current method.

**Audience:** Designers using Teul to inspect pairs or generate web-oriented Figma color systems, and maintainers responsible for source and accessibility claims.

**Success:** OUT-001 through OUT-005: zero profile-confused or context-ambiguous pass labels; named Local MINDE mapping with reviewed corpus evidence; exact Radix data with accurate Teul-authored matching and pair labels; honest advisory CVD/APCA wording; and a six-month standards review expiry.

**Approach:** Fail closed where Teul cannot prove rendered sRGB context, update deterministic sRGB internals behind versioned contracts, preserve final-pair WCAG gates, and document experimental or unsupported frontiers instead of simulating certainty.

**Non-goals:** Native Display-P3 WCAG certification, HDR generation, whole-site conformance certification, diagnostic CVD simulation, display calibration, or replacing Radix values.

**Appetite:** One bounded local release. No hosted service, network runtime, dataset rewrite, or migration of existing Figma documents.

## Problem and Evidence

### Problem statement

The user needs Teul's guidance to remain trustworthy as standards and display capabilities evolve. Today the plugin can produce a false WCAG pass when Figma numeric RGB channels belong to Display-P3, can call a selection exact without proving ancestor and stacking context, and can attach a text conformance label to a Radix step without a declared text role. Those are correctness defects, not opportunities to add novelty.

The desired state is a measurable contract: Teul computes normative WCAG 2.2 only for proven opaque sRGB pairs, blocks unsafe document mutations, versions generated output when the mapping algorithm changes, distinguishes source data from Teul-authored interpretation, and forces a dated evidence review before freshness silently expires.

### Diagnosis and crux

The crux is provenance across boundaries. A numeric triplet is not a complete color without a profile; a foreground/background pair is not exact without rendered context; an exact Radix swatch does not inherit WCAG conformance; and a simulation is not an individual's perception. The guiding policy is: **calculate only when the required context is proven, otherwise fail closed and explain the boundary.**

### Evidence ledger

| ID       | Claim                                                                                                                           | Classification | Source and locator                                                                                         | Freshness           | Implication                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| EVID-001 | WCAG 2.2 is the current W3C Recommendation; its normative relative-luminance formula is defined for sRGB.                       | Verified       | https://www.w3.org/TR/WCAG22/#dfn-relative-luminance                                                       | Reviewed 2026-08-02 | Blocking WCAG claims remain sRGB and use unrounded thresholds.                              |
| EVID-002 | WCAG 3 is an incomplete 3 March 2026 Working Draft and is not a conformance basis.                                              | Verified       | https://www.w3.org/TR/wcag-3.0/                                                                            | Reviewed 2026-08-02 | APCA remains supplemental, never labeled WCAG 3 compliance.                                 |
| EVID-003 | Display-P3 uses the sRGB transfer curve but different primaries and luminance coefficients.                                     | Verified       | https://www.w3.org/TR/css-color-4/#predefined-display-p3                                                   | Reviewed 2026-08-02 | Raw P3 channels must not enter sRGB WCAG or APCA math.                                      |
| EVID-004 | Figma numeric RGB values use the document color profile, and assigning versus converting profiles has different visual effects. | Verified       | https://help.figma.com/hc/en-us/articles/360039825114-Manage-color-profiles-in-design-files                | Reviewed 2026-08-02 | Backend document profile, not a UI assertion, is authoritative before analysis or mutation. |
| EVID-005 | CSS Color 4's current draft names Binary Search with Local MINDE, EdgeSeeker, and Ray Trace and gives Local MINDE constants.    | Verified       | https://www.w3.org/TR/css-color-4/#css-gamut-mapping                                                       | Reviewed 2026-08-02 | Teul can adopt a named deterministic algorithm and test its boundary behavior.              |
| EVID-006 | Radix Colors 3.0.0 remains latest; Teul's 744 sRGB solid values match the official payload.                                     | Verified       | https://www.npmjs.com/package/@radix-ui/colors and `src/lib/__tests__/sourceIntegrityRadix.test.ts`        | Reviewed 2026-08-02 | Preserve the data; improve source comparison and Teul-authored interpretation.              |
| EVID-007 | Radix documents APCA-based step guidance, not blanket WCAG conformance for a scale or swatch.                                   | Verified       | https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale                           | Reviewed 2026-08-02 | Every Teul WCAG label must name its tested pair and role.                                   |
| EVID-008 | Teul evaluates selected profile-tagged hex values with sRGB math and does not prove all rendering ancestors.                    | Verified       | `src/backend/accessibilitySelection.ts`, `src/components/AccessibilityTab.tsx`, `src/lib/accessibility.ts` | Current checkout    | Selection analysis must reject unsupported profiles and ambiguous rendering context.        |
| EVID-009 | Machado 2009 remains a useful advisory model, but the paper says the model is not intended to handle tritanopia.                | Verified       | https://doi.org/10.1109/TVCG.2009.113                                                                      | Reviewed 2026-08-02 | Preserve the engine and qualify the tritan endpoint and all simulation claims.              |
| EVID-010 | Users may prefer native P3 analysis instead of a fail-closed boundary.                                                          | Assumption     | No current user study                                                                                      | Unknown             | Do not create a non-normative conformance metric in this release.                           |
| EVID-011 | Identical appearance across monitors is achievable through plugin math alone.                                                   | Contradicted   | CSS color-management and Figma profile sources; calibration and viewing conditions remain external.        | Reviewed 2026-08-02 | Promise tagged-space correctness and test coverage, never universal perception.             |
| EVID-012 | The exact operational prevalence of P3 Teul files is known.                                                                     | Unknown        | No telemetry exists                                                                                        | Unknown             | Treat one false pass as release-relevant without inventing usage frequency.                 |

### Current behavior or reproduction

1. In a Display-P3 Figma file, create an opaque text/background pair with numeric channels `#006DFD` and `#FFFFFF`.
2. Use **Accessibility → Use Selection**.
3. The current path serializes the channels to hex and analyzes them as sRGB, yielding approximately `4.5594:1` and AA pass.
4. Profile-aware Display-P3 Y yields approximately `4.4936:1`; native-P3 WCAG conformance is not normatively specified, so the current pass is both numerically and semantically unsafe.
5. Separately, place black text in a 50%-opacity group over white. The current selection path can report `21:1` even though the rendered result is approximately `3.95:1`.

The generated scale corpus currently contains 538 light/dark outputs over 269 historical source colors. Existing tests report 536 valid outputs and two documented white-anchor constraint failures.

### Alternate framing and do-nothing case

An alternate framing is “add every modern color space and metric.” That increases surface area without making the blocking claim safer. The smaller and selected framing is “make every existing claim carry enough provenance to be true.”

Do nothing leaves at least one reproducible false AA pass, allows profile information supplied by the UI to authorize an unsafe Figma mutation, retains ambiguous Radix badges, and provides no mechanism to notice future standards drift.

## Users and Journeys

| User or actor           | Job and context                                                | Current journey                                                       | Desired journey                                                                                        | Important failure/recovery path                                                        |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Product designer        | Check an opaque text pair in the current Figma file.           | A pair may be analyzed without a proven sRGB/rendering context.       | Proven sRGB pairs receive a ratio; every unsupported context receives a specific blocking explanation. | Manual hex entry remains available and explicitly sRGB.                                |
| Design-system owner     | Generate exact, brand-derived, or constrained color variables. | P3 warning is visible but backend mutation can proceed and reinterpret sRGB channels. | Every sRGB-described on-canvas method requires a freshly read and mutation-locked sRGB root profile. | Exact exports remain available; unsupported mutation returns zero retained changes. |
| Color-system maintainer | Review generated scales and Radix choices.                     | Gamut and family matching are under-specified.                        | Output names the algorithm/version, preserves invariants, and has golden evidence.                     | Roll back the versioned deterministic implementation without altering source datasets. |
| Accessibility reviewer  | Interpret WCAG, APCA, and CVD output.                          | Some labels omit pair/use boundaries or overstate modeled tritanopia. | Normative, supplemental, and advisory claims are visibly distinct.                                     | Unsupported or ambiguous cases remain unresolved rather than passing.                  |

### Experience states

- Entry: manual hex input is labeled sRGB; selection analysis starts pending with a request ID.
- Success: proven opaque sRGB foreground/background returns pair-specific WCAG and supplemental APCA results.
- Error: P3, legacy, unknown profile, ambiguous ancestry, non-overlap, or wrong stacking returns a specific alert and no new analysis.
- Recovery: the user can enter known sRGB fallback values manually or move to an sRGB Figma file.
- Generation: every sRGB-described Figma creation method preflights the live root profile after host awaits and before mutation; a mismatch or mid-operation profile change returns a failure receipt with zero retained mutation.
- Offline: all release behavior remains deterministic and network-free; only explicit source-currentness research is online.

## Goals and Non Goals

### Outcomes

| ID      | Outcome                                                                           | Baseline                                                                                            | Target                                                                                                                          | Time horizon | Measurement source                              | Confidence |
| ------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------- | ---------- |
| OUT-001 | Eliminate false contrast or color-identity claims caused by profile or rendering-context confusion. | Reproducible unsafe analysis and mutation paths. | Zero accepted unsupported-profile or ambiguous-context selection fixtures; zero retained non-sRGB on-canvas color-system mutations. | This release | Backend, validator, transaction, and UI tests. | High |
| OUT-002 | Use a current named generated-scale gamut mapper.                                 | Boundary-only chroma bisection.                                                                     | Local MINDE reference properties pass; all 538 corpus outputs retain anchor/finite/sRGB guarantees, 536 eligible outputs pass ordering/contrast invariants, and the two mathematically impossible Wada White anchors remain explicit failures. | This release | Independent vectors, corpus report, and checksum. | High       |
| OUT-003 | Make exact Radix source and Teul-authored interpretation independently auditable. | Local self-hash; CIE76 light-step-9 family match; context-free labels.                              | Direct package parity for all 744 values; documented Delta E OK match fixtures; zero unbound WCAG labels.                       | This release | Package parity, matcher goldens, layout tests.  | Medium     |
| OUT-004 | Remove accessibility overclaims without inventing new metrics.                    | Tritanopia label exceeds source scope; APCA is supplemental but reference wording can be tightened. | Zero audited WCAG/APCA/CVD/P3/HDR claim violations in release surfaces.                                                         | This release | Claim audit and UI/backend snapshot assertions. | High       |
| OUT-005 | Make standards freshness expire rather than silently age.                         | No dated machine gate.                                                                              | A checked-in ledger identifies reviewed version/status/source and fails after 2027-02-02.                                       | Six months   | `npm run verify:color-foundations`.             | High       |

### Guardrails and counter-metrics

| ID        | Guardrail                                              | Baseline                                | Maximum regression                           | Measurement                                         |
| --------- | ------------------------------------------------------ | --------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| GUARD-001 | Historical source datasets remain byte-identical.      | Current tracked hashes.                 | Zero changed historical data files.          | Git diff plus existing source integrity tests.      |
| GUARD-002 | Required semantic pairs remain blocking and unrounded. | 13 pair definitions per generated mode. | Zero removed pairings or lowered thresholds. | Semantic policy tests and direct boundary fixtures. |
| GUARD-003 | Exact Radix sRGB solid values remain exact.            | 744 values at 3.0.0.                    | Zero value differences.                      | Direct imported-package parity.                     |
| GUARD-004 | Runtime remains network-free.                          | Manifest has no allowed domains.        | Zero new runtime network domains or calls.   | Manifest/diff audit.                                |

### Non-goals

- Native Display-P3 WCAG certification: WCAG 2.2 does not normatively define it.
- P3 or alpha Radix product modes: exact sRGB solid coverage is already disclosed and adding modes is a separate product outcome.
- HDR or CSS Color 5 generation: current HDR work remains a Working Draft and Figma plugin output is SDR.
- Whole-page/site accessibility certification: Teul proves declared pairs, not use in every state and rendered context.
- Automated display calibration or identical perception across monitors.
- Replacing Machado with an unvalidated CVD system.
- Broad design-system auditing or new AI behavior.

### Future considerations

- A tagged sRGB-fallback plus Display-P3 progressive-enhancement export mode with separate colorimetric evidence.
- A rendered-compositing analyzer for known alpha stacks and gradients.
- Browser automation for forced-colors and preference media features if Teul gains a web runtime outside Figma.
- Native Radix P3 and alpha modes after a user outcome and compatibility contract are defined.

## Current System and Constraints

### Relevant system map

The React iframe sends validated messages through `src/types/messages.ts`. `src/code.ts` routes them to `src/backend/`, where document mutation occurs. Selection contrast enters through `src/backend/accessibilitySelection.ts` and is calculated in `src/lib/accessibility.ts`. Generated scales originate in `src/lib/colorScale.ts`; semantic pair policy in `src/lib/semanticColorPolicy.ts` is recomputed during backend generation. Exact Radix values live in `src/lib/radixColors.ts`. CVD simulation lives in `src/lib/colorBlindness.ts`. Public claim authority is `docs/SOURCE_PROVENANCE.md`.

The repository release gate includes lint, typecheck, tests, coverage, build, artifact assertions, Wada parity, UI bundle checks, and dependency audit. Runtime Figma acceptance is recorded separately.

### Constraints and appetite

- Product: preserve existing modes and manual sRGB checker; block only claims or mutations whose prerequisites are unproven.
- Technical: Figma RGB channels are profile-relative; the plugin has a two-process boundary; all UI messages require runtime validation.
- Legal/security/privacy: APCA port remains under its existing license; no new network runtime or user data collection.
- Design/accessibility: thresholds remain WCAG 2.2; color alone is never sufficient; CVD simulation remains advisory.
- Time/team/operations: local implementation and automated evidence only; a human Figma reload remains an explicit operational gate, not a fabricated receipt.

### Dependencies

| Dependency                 | Owner or system | Needed by        | Failure impact                                 | Contingency                                               |
| -------------------------- | --------------- | ---------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Figma document profile API | Figma           | REQ-001, REQ-002 | Cannot prove profile before analysis/mutation. | Fail closed; retain manual sRGB input/export.             |
| CSS Color 4 algorithm text | W3C CSS WG      | REQ-004          | Algorithm or constants drift.                  | Pin review date/source and expire ledger.                 |
| `@radix-ui/colors@3.0.0`   | Radix           | REQ-005          | Exact source comparison unavailable.           | Keep vendored payload but block source-currentness claim. |
| Existing Teul tests        | Repository      | All requirements | Regression cannot be bounded.                  | Stop release and revert the affected slice.               |

## Options and Decision

| Option                                        | User value                                                             | Feasibility | Risks                                                    | Reversibility | Cost/appetite    | Evidence needed                                          |
| --------------------------------------------- | ---------------------------------------------------------------------- | ----------- | -------------------------------------------------------- | ------------- | ---------------- | -------------------------------------------------------- |
| Do nothing                                    | None; preserves UI availability.                                       | Immediate.  | Known false pass and stale claims remain.                | N/A           | Lowest           | Existing reproduction already rejects it.                |
| Add native P3/APCA/HDR systems                | Broad feature surface.                                                 | Partial.    | Non-normative claims, larger migration, false certainty. | Medium        | Outside appetite | EVID-010 requires user validation that is not available. |
| Fail closed plus versioned sRGB modernization | Corrects known defects and improves fidelity without expanding claims. | High.       | Generated hex changes require explicit versioning.       | High          | Selected         | Corpus, negative tests, independent review.              |

**Decision:** DEC-001 — Choose fail-closed correctness plus versioned sRGB modernization. Exact source values remain untouched; calculations and labels change only where evidence identifies a defect or measurable fidelity gap.

**Cheapest falsification:** Run the P3 threshold-reversal fixture, ancestor-opacity fixture, very-light-yellow Local MINDE fixture, and Radix package parity before broader implementation. Any failure to reproduce reshapes the corresponding slice.

## Requirements

### Functional and behavioral requirements

| ID      | Priority | Requirement                                                                                                                                                                                                                                                                    | Rationale/provenance                   | Acceptance IDs |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | -------------- |
| REQ-001 | Must     | Selection contrast must accept only a freshly reported sRGB document profile; P3, legacy, and unknown profiles must return an explanatory failure without changing the current result.                                                                                         | EVID-001, EVID-003, EVID-004, DEC-001  | AC-001, AC-003 |
| REQ-002 | Must     | Selection contrast must reject non-opaque or stroked ancestors, unsupported blending/effects/masks, irregular/rounded/rotated background geometry, render-bound or overflowing-descendant overlap, non-overlap, and a selected background not provably behind the text.            | EVID-008, DEC-001                      | AC-002         |
| REQ-003 | Must     | The accessibility result message must be discriminated: success requires exact hex pair data and forbids an error; failure requires an error and forbids pair data; the UI must use the shared validator and request correlation.                                              | EVID-008, INV-002                      | AC-003         |
| REQ-004 | Must     | Generated sRGB scales must use CSS Color 4 Binary Search with Local MINDE constants `JND=0.02` and `epsilon=0.0001`, identify the method as `Teul OKLCH v3`, preserve every satisfiable scale invariant, and return explicit failures for impossible exact anchors.                 | EVID-005, DEC-001                      | AC-004         |
| REQ-005 | Must     | Exact Radix mode must compare all 744 bundled sRGB solid values directly with exact `@radix-ui/colors@3.0.0`; Teul family matching must use documented Delta E OK evidence; WCAG labels must identify a valid pair/use rather than classify a swatch alone.                    | EVID-006, EVID-007, DEC-001            | AC-005         |
| REQ-006 | Must     | Every sRGB-described Figma color-system mutation must re-read the backend root profile after host awaits, perform zero retained mutation unless it is and remains sRGB, and lock that profile across frame/variable/style phases; exported and policy reports must identify sRGB evaluation space. | EVID-001, EVID-004, BASE-004 | AC-006 |
| REQ-007 | Must     | Public and in-product claims must distinguish WCAG 2.2 normative sRGB results, APCA supplemental guidance, CVD advisory approximations, exact Radix sRGB solid values, and unsupported P3/HDR guarantees; the Machado tritan endpoint must not be called validated tritanopia. | EVID-002, EVID-007, EVID-009, EVID-011 | AC-007         |
| REQ-008 | Must     | A machine-readable standards ledger must name each reviewed source/status/version, review date, and review-by date and fail the release gate after 2027-02-02.                                                                                                                 | EVID-001 through EVID-009, DEC-001     | AC-008         |

### Non-functional requirements

| ID      | Category        | Requirement and threshold                                                                                                                                         | Acceptance IDs         |
| ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| NFR-001 | Reliability     | Every unsupported selection/generation preflight must finish before the first Figma document mutation and return one terminal result.                             | AC-001, AC-002, AC-006 |
| NFR-002 | Determinism     | Repeated scale generation and Radix matching for the same input must return byte-identical output; one reviewed corpus checksum must detect drift.                | AC-004, AC-005         |
| NFR-003 | Accessibility   | WCAG thresholds must remain unrounded `3`, `4.5`, and `7`; every mode accepted for WCAG-constrained generation must pass all 13 declared semantic pairings. | AC-004, AC-006         |
| NFR-004 | Maintainability | Lint, typecheck, coverage thresholds, production build, artifact checks, source parity, and dependency audit must all pass on Node 22.                            | AC-009                 |

### Business rules and invariants

- A color profile is part of the color value.
- “Exact” applies to source values, not Teul-authored matching, roles, or conformance.
- A WCAG result belongs to a declared foreground/background/use/profile tuple.
- Unsupported context produces no pass label.
- Final serialized sRGB values, not unconstrained OKLCH candidates, are the semantic-policy inputs.
- Historical Wada and Werner source data must not change.

### Explicit implementation freedom

- Internal helper names and test organization may change.
- The exact UI wording may change if it preserves the normative/supplemental/advisory distinctions.
- A stricter fail-closed selection preflight is acceptable when exact stacking cannot be proven.

## Acceptance and Verification

| ID     | Covers                    | Preconditions                                                                    | Action or stimulus                                   | Observable pass condition                                                                                                                                                       | Proof method                                                   | Status/evidence |
| ------ | ------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| AC-001 | REQ-001, NFR-001          | Selection fixtures for sRGB, P3, legacy, unknown.                                | Read the same opaque pair.                           | Only sRGB succeeds; other profiles return specific failures and no pair.                                                                                                        | Backend and UI tests including the `4.5594/4.4936` regression. | Passed: Node 22 focused foundation suite, 16 files and 284 tests. |
| AC-002 | REQ-002, NFR-001          | Fixtures for ancestor opacity/blend/effect/stroke/mask, irregular/rounded/rotated geometry, render/overflow overlap, ancestry, and z-order. | Read each selection.                                 | Every ambiguous fixture fails; an opaque axis-aligned square-cornered rectangular background behind text succeeds.                                                               | Backend unit tests with Figma node fakes.                      | Passed: Node 22 negative scene-graph fixtures. |
| AC-003 | REQ-001, REQ-003          | Malformed, stale, issued-before-unmount, success, and failure result messages.   | Validate and dispatch each message.                  | Malformed/stale messages do not alter UI state; valid messages owned by the current checker produce one terminal state.                                                          | Message validator and React component tests.                   | Passed: malformed, stale, unmount, success, and failure fixtures. |
| AC-004 | REQ-004, NFR-002, NFR-003 | Independent Local MINDE vectors and 538-output historical corpus.                | Generate twice and run validation.                   | Named constants/edge cases and independent vectors pass; checksum matches; all 538 preserve anchor/finite/sRGB guarantees; 536 eligible outputs pass all invariants; the two Wada White exact-anchor cases remain explicit failures; the reviewed light-yellow fixture retains more chroma than v2. | Independent-vector, property, and corpus tests.                | Passed: pinned Color.js oracle, 420-vector grid, 538-output corpus, checksum `68485d2c…9050`. |
| AC-005 | REQ-005, NFR-002          | Exact package import and perceptual matcher/layout fixtures.                     | Compare data, match boundary colors, render layouts. | 744 values equal upstream; pink/yellow/blue goldens select reviewed families; no context-free WCAG text badge exists.                                                           | Source-integrity, matcher, backend layout tests.               | Passed: direct 744-value parity, matcher goldens, layouts, and claim wording. |
| AC-006 | REQ-006, NFR-001, NFR-003 | Forged/stale UI sRGB request while backend root is P3; post-await and mid-phase profile changes; valid sRGB control. | Request each generation mode. | Every non-sRGB mode produces zero retained mutation and an error; sRGB constrained output runs all 13 pair gates; reports state sRGB evaluation space. | Transaction fault-injection, rollback, UI, and export/report tests. | Passed: all-mode non-sRGB zero-mutation, async-race rollback, and sRGB policy/export fixtures. |
| AC-007 | REQ-007                   | Release UI/docs/frames.                                                          | Run claim audit and inspect changed surfaces.        | Zero unqualified Radix/WCAG/APCA/CVD/P3/HDR claims; tritan endpoint is advisory severe tritanomaly/tritan-like wording.                                                         | Static search plus focused snapshots and independent review.   | Passed: automated claim search/tests and independent color-foundations review found no unresolved P1/P2 defect. |
| AC-008 | REQ-008                   | Current and post-expiry clock fixtures.                                          | Run standards verifier.                              | Current ledger passes; a date after 2027-02-02 fails with reviewed sources listed.                                                                                              | Script tests and `npm run verify:color-foundations`.           | Passed: 9 verifier tests plus current and post-expiry receipts. |
| AC-009 | NFR-004                   | Node 22 pinned environment.                                                      | Run the full repository release command chain.       | Every automated gate exits zero and production artifacts contain no stale v2 contract.                                                                                          | Command receipts in the derived plan.                          | Passed: the isolated Git-index candidate passes lint/typecheck, 55-file/752-test coverage, build, artifacts, production UI smoke, Wada parity, standards and dependency policy gates; `dist/ui.html` is 370,439/409,600 bytes. |

### Negative and recovery cases

- Removing the backend profile check must make the forged-P3 transaction test fail.
- Removing ancestor opacity inspection must make the 50%-opacity-group test fail.
- Applying sRGB coefficients to the P3 boundary fixture must make AC-001 fail.
- Restoring boundary-only gamut mapping must change the v3 corpus checksum or Local MINDE golden.
- A standards review date past 2027-02-02 must fail even when all unit tests pass.
- Recovery is local and reversible: restore the v2 mapping contract and block generation if v3 invariants fail; keep manual sRGB input and export available when selection/mutation preflight blocks.

## Technical Design

### Proposed architecture and boundaries

1. **Authoritative preflight:** backend selection and transaction code read the normalized root profile and rendered-node context before calculation or mutation.
2. **Validated protocol:** one shared discriminated validator protects accessibility selection responses at the UI boundary.
3. **Versioned math:** `colorScale.ts` implements named Local MINDE mapping; all message/export/type contracts move atomically to v3.
4. **Source versus interpretation:** exact Radix package data is imported only for development verification; Teul matcher uses Delta E OK and all labels state tested pairs.
5. **Evidence control:** a checked-in ledger and offline verifier encode claim status and review expiry; the audit document provides human rationale.

### Interfaces schemas and data flow

- Manual contrast input remains `#RRGGBB` and is explicitly sRGB.
- Selection result is a discriminated union keyed by `success`; valid success includes `profile: 'srgb'`, two exact hex values, and bounded source labels.
- Generated scales use `method: 'Teul OKLCH v3'`, `profile: 'sRGB'`, and deterministic final hex values.
- Semantic policy reports add `colorSpace: 'sRGB'` so exported evidence cannot lose the evaluation profile.
- The standards ledger is JSON with `schemaVersion`, `reviewedAt`, `reviewBy`, and a nonempty list of source records.

### Instrumentation

This local plugin adds no telemetry. Verification receipts are test output, the generated-scale checksum, and the standards verifier. User-facing failures name the rejected profile/context; no document contents are logged.

### Alternatives and rejected complexity

- Native P3 Y can be calculated colorimetrically, but WCAG 2.2 does not make that a normative P3 conformance formula. It is intentionally not labeled WCAG in this release.
- Full rendered compositing would require additional scene-graph and paint semantics. This release rejects ambiguity instead.
- EdgeSeeker and Ray Trace are not needed when Local MINDE has complete pseudocode and measurable corpus proof.
- No dependency update is made merely because a newer package exists; Radix remains 3.0.0 because it is current.

## Security Privacy and Compliance

| Concern            | Threat or obligation                                      | Control                                                                | Verification                              | Residual risk                                               |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Message trust      | Forged UI profile authorizes mutation.                    | Re-read root profile in backend; validate discriminated responses.     | Negative transaction and validator tests. | A future Figma API behavior change requires ledger review.  |
| Document integrity | Partial mutation before failed preflight.                 | Preflight all gates before transaction begins.                         | Mutation spy asserts zero calls.          | Runtime-only host differences need manual Figma acceptance. |
| User privacy       | Standards work introduces network calls on document data. | No runtime domains or calls; dev verifier is offline.                  | Manifest and diff audit.                  | None introduced.                                            |
| Licensing          | APCA implementation terms are lost during refactor.       | Preserve pinned port and `APCA_LICENSE.md`; APCA remains supplemental. | Artifact assertion and source review.     | Upstream license/version changes require review.            |

## Performance Reliability and Observability

| Dimension           | Baseline                                              | Target/SLO                                                             | Load or failure scenario        | Measurement and alert                  |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- | -------------------------------------- |
| Contrast analysis   | Synchronous pair math.                                | No extra async/network work; one result per request.                   | Malformed/stale result.         | Component and protocol tests.          |
| Scale generation    | 538 corpus outputs in the test suite.                 | Corpus completes within existing test timeout; deterministic checksum. | Extreme chroma and L endpoints. | Vitest duration and checksum failure.  |
| Figma mutation      | Transactional preflight exists for other constraints. | Profile failure occurs before first mutation.                          | Root P3 with forged UI sRGB.    | Mutation-spy failure.                  |
| Standards freshness | No expiry.                                            | Fail after 2027-02-02 until reviewed.                                  | Clock after review-by.          | Script exits nonzero with source list. |

No service SLO, retry, backpressure, capacity, or cost alert applies because the release adds no service or network runtime.

## Behavior Baseline and Invariants

### Refactor outcome

**Product/operating problem:** Teul can provide false or over-broad guidance at profile, rendering, gamut, and source-interpretation seams.

**Current measurable constraint:** Two concrete false-claim paths and no freshness expiry.

**Target outcome:** OUT-001 through OUT-005 with the existing release suite green.

**Why refactor instead of repair/no change:** Profile and method information crosses shared types, validators, UI, backend, export, and generated artifacts. A versioned cross-boundary change is safer than an isolated warning.

### Blast radius and consumers

| Component/contract              | Consumers                              | Owner      | Current behavior                                    | Risk if changed                                    | Evidence       |
| ------------------------------- | -------------------------------------- | ---------- | --------------------------------------------------- | -------------------------------------------------- | -------------- |
| Accessibility result message    | Backend and React UI                   | Teul       | Permissive success shape; profile is informational. | Lost or stale result state.                        | AC-001, AC-003 |
| Generated scale method          | UI, validators, backend, export, tests | Teul       | `Teul OKLCH v2`.                                    | Mixed v2/v3 contracts rejected.                    | AC-004, AC-009 |
| Semantic policy report          | UI, Figma layouts, export              | Teul       | Profile implied, not serialized.                    | Older forged reports rejected and recomputed.      | AC-006         |
| Exact Radix payload and matcher | Exact generation and recommendation UI | Teul/Radix | Exact payload; Teul CIE76 match.                    | Family suggestions change, source values must not. | AC-005         |

### Behavior baseline

| ID       | Scenario/contract                                       | Baseline result                                    | Characterization proof and AC     | Intentionally changing?    |
| -------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------- | -------------------------- |
| BASE-001 | WCAG sRGB luminance and threshold evaluation.           | Correct `0.04045`; unrounded 3/4.5/7.              | Existing vectors plus AC-006.     | No                         |
| BASE-002 | Generated step 9 anchor.                                | Normalized source hex preserved.                   | Corpus and AC-004.                | No                         |
| BASE-003 | Radix sRGB solid payload.                               | 31 families, light/dark, 744 exact values.         | Direct package parity and AC-005. | No                         |
| BASE-004 | WCAG-constrained mode blocks a failed required pairing. | Backend recomputes policy and fails before commit. | Fault injection and AC-006.       | No; add profile preflight. |
| BASE-005 | P3 selection is accepted and analyzed as sRGB.          | False AA pass is reproducible.                     | Boundary regression and AC-001.   | Yes                        |
| BASE-006 | Gamut map seeks maximum in-gamut chroma.                | Can over-desaturate shallow/concave boundaries.    | Local MINDE golden and AC-004.    | Yes                        |

### Invariants

| ID      | Invariant                                                                       | Applies during           | Verification   | Failure response                                       |
| ------- | ------------------------------------------------------------------------------- | ------------------------ | -------------- | ------------------------------------------------------ |
| INV-001 | Historical source data and exact Radix source values remain unchanged.          | Normal and rollback      | AC-005, AC-009 | Stop release; restore changed source files.            |
| INV-002 | UI and backend message contracts remain aligned and malformed data is rejected. | Normal and mixed bundle  | AC-003, AC-009 | Revert atomic contract change; rebuild bundle.         |
| INV-003 | Final sRGB semantic pairs meet unchanged thresholds before mutation.            | Normal and rollback      | AC-004, AC-006 | Abort transaction and retain no partial artifact.      |
| INV-004 | Manual hex analysis remains available as explicitly sRGB.                       | Degraded profile/context | AC-001         | Keep selection error recoverable through manual input. |

## Refactor Strategy and Migration

### Target architecture and seam

The seam is the existing runtime validation boundary. Add profile/context preflight before selection serialization or transaction mutation, then update the deterministic mapping/matching internals behind atomic method/report versions. No persisted user data is rewritten.

### Migration stages

| Stage | Change                                                   | Traffic/data state                                 | Entry criteria           | Exit criteria                                        | Rollback procedure                                        |
| ----- | -------------------------------------------------------- | -------------------------------------------------- | ------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| 1     | Add negative characterization tests and evidence ledger. | No user behavior change.                           | Baseline suite green.    | Reproductions fail against old behavior as expected. | Remove new tests/docs.                                    |
| 2     | Enforce profile/context/message boundaries.              | Unsupported contexts now block.                    | Stage 1 evidence.        | AC-001, AC-002, AC-003, AC-006 pass.                 | Restore prior handlers; manual sRGB remains.              |
| 3     | Move mapping/matching/contracts to v3.                   | Newly generated output changes; sources unchanged. | Stage 2 green.           | AC-004, AC-005 pass with reviewed checksum.          | Restore v2 contract and block release of mixed artifacts. |
| 4     | Align claims, freshness, and release receipts.           | Local candidate only.                              | All focused tests green. | AC-007 through AC-009 and independent review pass.   | Keep branch unreleased and correct findings.              |

### Compatibility and coexistence

There is no persisted generated-scale schema. UI and backend ship as one Figma plugin bundle, so method strings change atomically. Runtime validation rejects mixed v2/v3 objects. Previously created Figma variables/styles remain ordinary document data and are not migrated.

### Performance and cost comparison

| Workload               | Old baseline                    | New target                                                    | Maximum regression                        | Measurement                |
| ---------------------- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | -------------------------- |
| One gamut map          | 24 simple bisection iterations. | Local MINDE finishes within existing synchronous test budget. | No corpus timeout; no network/cost.       | Focused test timing.       |
| Full 538-output corpus | Passing in current suite.       | Passing within configured Vitest timeout.                     | 2x focused-test wall time prompts review. | Before/after test receipt. |

### Legacy cleanup

- Remove every `Teul OKLCH v2` runtime contract only after all producer/consumer tests use v3.
- Remove context-free WCAG badge wording only after layout tests assert pair-bound replacement copy.
- Retain historical release documents; do not rewrite prior evidence.

## Risks and Mitigations

| ID       | Risk or pre-mortem failure                                 | Likelihood | Impact | Early signal                                           | Mitigation                                             | Contingency/kill criterion                                 |
| -------- | ---------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| RISK-001 | P3 fail-closed behavior surprises users.                   | Medium     | Medium | Selection error reports increase in manual acceptance. | Specific recovery copy and manual sRGB path.           | Defer native P3 analysis; do not restore false WCAG pass.  |
| RISK-002 | Local MINDE changes expected generated hues/chroma.        | High       | Medium | Corpus checksum and reviewed vectors differ.           | Version v3, preserve anchor and all policy invariants. | Kill v3 if any invariant or required pair regresses.       |
| RISK-003 | Stricter context proof rejects some visually simple pairs. | Medium     | Low    | Fixture or runtime selection blocks.                   | Fail with exact reason and allow manual sRGB input.    | Expand only with proven compositing semantics and tests.   |
| RISK-004 | Family matching change is perceived as source mutation.    | Low        | Medium | Review conflates suggestion and exact values.          | Label matching Teul-authored; direct payload parity.   | Remove “closest” suggestion if evidence remains ambiguous. |
| RISK-005 | Freshness ledger becomes ceremonial.                       | Medium     | Medium | Review-by date passes without owner action.            | Release command fails after review-by.                 | Block candidate until sources are re-reviewed.             |

## Migration Compatibility and Rollback

No database, remote service, user secret, or persisted plugin state changes. Compatibility risk is limited to the bundled UI/backend contract and new generation results. Build both processes together; reject mixed versions; preserve prior Figma artifacts. Rollback means shipping the prior complete bundle, never partially restoring a method string. A release is blocked if v3 corpus, semantic policy, package parity, or artifact assertions fail.

## Rollout and Operations

### Milestones and exit criteria

| Stage                    | Audience/traffic           | Entry criteria                          | Exit criteria                                           | Owner                | Rollback trigger                      |
| ------------------------ | -------------------------- | --------------------------------------- | ------------------------------------------------------- | -------------------- | ------------------------------------- |
| Local candidate          | Maintainer only            | Ready PRD and baseline green.           | AC-001 through AC-008 pass.                             | Codex/maintainer     | Any invariant failure.                |
| Figma development reload | Authorized local test file | Production bundle and artifacts pass.   | Core sRGB success and P3/context failures are observed. | Paul Jun or delegate | Mutation occurs in a blocked profile. |
| Release decision         | Existing Teul users        | AC-009 and independent review resolved. | Exact commit and runtime receipt recorded separately.   | Paul Jun             | Unresolved P1/P2 finding.             |

### Operational readiness

- Feature flag or control plane: not applicable; behavior is a correctness boundary in one bundled plugin.
- Dashboards and alerts: no service exists; standards expiry is a build-time alert.
- Runbook and on-call: use repository commands and Figma development reload instructions.
- Documentation and support: update `docs/SOURCE_PROVENANCE.md`, README claim boundaries, and a dated audit report.
- Analytics and experiment plan: no telemetry is added; runtime feedback is manual.
- Sales/marketing/legal/partner impact: do not publish “world-class,” universal-monitor, native-P3-WCAG, or diagnostic-CVD claims.

## Decisions and Open Questions

### Decision log

| ID      | Date       | Decision                                                                                                                    | Alternatives                          | Rationale/evidence                                             | Decider                                                                        |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| DEC-001 | 2026-08-02 | Fail closed at unproven profile/rendering boundaries; modernize only deterministic sRGB internals with measurable evidence. | Do nothing; add broad P3/HDR metrics. | EVID-001 through EVID-012 and cheapest-falsification fixtures. | Paul Jun via the requested outcome; implementation details delegated to Codex. |

### Open questions

| ID     | Question                                                                      | Why it matters                                                              | Resolution method                                          | Owner/decider | Blocks                   |
| ------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------- | ------------------------ |
| OQ-001 | Should a later product show profile-aware P3 Y as a non-normative diagnostic? | It may help wide-gamut workflows but can be confused with WCAG conformance. | Separate PRD, user research, and standards review.         | Paul Jun      | Future P3 analysis only. |
| OQ-002 | Should exact Radix P3/alpha variants become product modes?                    | Current scope is exact sRGB solid and is honestly disclosed.                | Define user outcome and Figma/export compatibility matrix. | Paul Jun      | Future mode only.        |

## Plan of Action

**Canonical plan:** `docs/plans/2026-08-02-color-foundations-alignment-plan.md`

**Critical path:** TASK-001, TASK-002, TASK-003, TASK-004, TASK-005

**Highest-uncertainty proof:** TASK-003 must show Local MINDE improves the adversarial fixture without breaking any corpus invariant.

## Traceability

| Outcome                                     | Requirement               | Acceptance | Task     | Verification receipt                 | Release gate              |
| ------------------------------------------- | ------------------------- | ---------- | -------- | ------------------------------------ | ------------------------- |
| OUT-001                                     | REQ-001, NFR-001          | AC-001     | TASK-002 | Node 22 focused foundation suite: 16 files, 284 tests passed. | Selection safety          |
| OUT-001                                     | REQ-002, NFR-001          | AC-002     | TASK-002 | Negative rendered-context fixtures passed. | Selection safety          |
| OUT-001                                     | REQ-003                   | AC-003     | TASK-002 | Protocol and correlated UI fixtures passed. | Contract safety           |
| OUT-002                                     | REQ-004, NFR-002, NFR-003 | AC-004     | TASK-003 | Color.js oracle and corpus checksum passed. | Generated-scale fidelity  |
| OUT-003                                     | REQ-005, NFR-002          | AC-005     | TASK-003 | 744-value package parity and matcher/layout tests passed. | Source and interpretation |
| OUT-001                                     | REQ-006, NFR-001, NFR-003 | AC-006     | TASK-002 | Transaction zero-mutation and export tests passed. | Mutation safety           |
| OUT-004                                     | REQ-007                   | AC-007     | TASK-004 | Automated claim gates and independent scoped review passed with no unresolved P1/P2 finding. | Claim integrity           |
| OUT-005                                     | REQ-008                   | AC-008     | TASK-001 | Verifier 9/9 and post-expiry negative case passed. | Freshness                 |
| OUT-001, OUT-002, OUT-003, OUT-004, OUT-005 | NFR-004                   | AC-009     | TASK-005 | The isolated Git-index candidate passes every automated gate, including the 370,439/409,600-byte UI bundle budget. | Local release readiness   |

## Post Launch Learning

| Review date          | Outcome/guardrail | Baseline                     | Observed          | Decision                                                                  | Follow-up                                            |
| -------------------- | ----------------- | ---------------------------- | ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| 2027-02-02 or before | OUT-005           | Sources reviewed 2026-08-02. | Not yet observed. | Re-review standards and dependency status before release after this date. | Update ledger with evidence; do not auto-bump dates. |

## Changelog

| Date       | Change             | Reason/evidence                                        | Affected IDs |
| ---------- | ------------------ | ------------------------------------------------------ | ------------ |
| 2026-08-02 | Initial ready PRD. | Repository audit plus primary-source standards review. | All IDs      |
| 2026-08-02 | Added implementation receipts without inflating release state. | Focused and offline gates pass; registry audit, independent review, final integration rerun, and Figma runtime remain. | AC-001 through AC-009 |
| 2026-08-02 | Reconciled final scoped review and integration evidence. | Core release gates and independent review pass; the UI bundle improvement budget keeps AC-009 open. | AC-007, AC-009 |
| 2026-08-02 | Closed the scoped local-verification contract against the exact Git index. | All automated gates and independent review pass; the production Figma reload remains an explicit runtime-only acceptance step. | AC-001 through AC-009 |
