# Reconcile Teul's current shipping line without bypassing V2 qualification

## Document Control

| Field               | Value                                                       |
| ------------------- | ----------------------------------------------------------- |
| Status              | Verified                                                    |
| Depth               | Standard                                                    |
| Extensions          | Refactor                                                    |
| Authoring agent     | Codex `create-prd-and-build` with `workstream-steward`      |
| Accountable decider | Paul Jun                                                    |
| Audience            | Teul maintainers and release reviewers                      |
| Last updated        | 2026-09-02                                                  |
| Canonical PRD       | `docs/prds/2026-09-02-teul-current-reconciliation.md`       |
| Derived plan        | `docs/plans/2026-09-02-teul-current-reconciliation-plan.md` |
| Release state       | Locally verified                                            |

### Skill Stack

| Concern                             | Selected skill         | Why it applies                                                                                      | Expected artifact or gate                                                  |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Product contract and implementation | `create-prd-and-build` | This is a cross-branch refactor and dependency/security refresh where a blind merge would be unsafe | Requirement-linked PRD, plan, implementation, and verification ledger      |
| Workstream recovery and lifecycle   | `workstream-steward`   | The work continues a pushed but divergent release stream with an explicit production gate           | Canonical branch identity, preserved dirty work, and precise release state |

## One-Page Summary

**What:** Reconcile Teul's public shipping branch with the source-safe September correctness fixes, current compatible dependencies, and the latest V2 candidate evidence while preserving the release gate.

**Problem:** Teul currently has two divergent lines. Public `origin/main@aadccee` contains the sanitized generic candidate, separate candidate packaging, a partial Figma-host receipt, cross-runtime hashing, and bounded journal persistence. Private `codex/color-system-audit-extension@44e6a15` contains broader donor/private material plus later fixes for direct sRGB mutations, hue normalization, and audit-policy validation. A blind merge would reintroduce private fixtures, inflate the product by roughly 121,000 lines, and erase the public branch's intentional sanitization boundary.

**Why now:** The production build's `disabled` channel is being interpreted as a stale or broken feature flag. The repository and dependency state must be made current before deciding whether V2 can be promoted.

**Audience:** Teul users need a stable released plugin; maintainers need one unambiguous shipping line and a separate, testable candidate.

**Success:** OUT-900 through OUT-903: public-main behavior remains intact, applicable correctness and deterministic-color fixes are ported, current compatible dependencies and both audit scopes are clean, current Figma metadata types are transported exactly, and the V2 release state is documented without claiming qualification.

**Approach:** Use `origin/main@aadccee` as the shipping baseline; selectively reimplement source-safe fixes; update only compatible dependency lines; keep major migrations and V2 activation out of scope; run production and candidate validation under supported Node runtimes.

**Non-goals:** No wholesale private-branch merge, no private fixture import, no React/ESLint/TypeScript/jsdom/webpack-cli major migration, no qualified-channel command, no publication, and no conversion of historical approximations into exact claims.

**Appetite:** One contained reconciliation branch with reversible commits and a full local release chain. Stop if the candidate isolation, source-provenance hashes, or production behavior cannot be preserved.

## Problem and Evidence

### Problem statement

The current checkout previously tracked a private PR that was current only within its own fork. Public `origin/main` is the product-facing line and intentionally rebuilt the donor work into a sanitized candidate. September fixes and current dependency information must be reconciled onto that line rather than merging histories or enabling V2 by changing one flag.

### Diagnosis and crux

The crux is source authority, not a feature toggle: two branches contain different valid improvements and different privacy/release assumptions. Preserve the public branch's sanitized architecture and port only independently justified behavior.

### Evidence ledger

| ID       | Claim                                                                                                                                                                                                                                                                 | Classification | Source and locator                                                                                                                | Freshness                                         | Implication                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| EVID-900 | Public `origin/main` and the private PR have diverged, with 5 and 14 unique commits respectively                                                                                                                                                                      | Verified       | `git rev-list --left-right --count origin/main...44e6a15` on 2026-09-02                                                           | Current                                           | A pull or wholesale merge is unsafe                                                                                                       |
| EVID-901 | Public main deliberately excludes private/client fixtures and isolates the candidate in `figma-candidate/dist`                                                                                                                                                        | Verified       | `docs/DONOR_RECONCILIATION_2026-08-23.md`; `webpack.config.js`; `figma-candidate/manifest.json`                                   | Current                                           | Public main is the correct baseline                                                                                                       |
| EVID-902 | The public candidate completed one Figma happy path and native Undo, but four host/accessibility cases remain                                                                                                                                                         | Verified       | `docs/GENERIC_COLOR_BUILDER_CANDIDATE_2026-08-23.md` lines 93-136                                                                 | Current record; not bound to post-receipt changes | V2 remains candidate-only                                                                                                                 |
| EVID-903 | Direct fill, stroke, style, and gradient mutations on public main do not verify the document color profile                                                                                                                                                            | Verified       | `src/backend/colorOperations.ts`; comparison with private commit `6c3c26b`                                                        | Current                                           | sRGB hex writes can be misinterpreted in P3/legacy/unknown documents                                                                      |
| EVID-904 | The double-modulo hue wrapper changes already-normalized fractional values, while V2 serializes transcendental color math that can vary below Teul's decision thresholds across JS runtimes; CSS Color 4 defines OKLCH hue as powerless at chroma `0.000004` or below | Verified       | `src/lib/colorScale.ts`; `src/lib/colorSystemSecondaryEngineV2.ts`; CSS Color 4; source-safe regression evidence in `6c3c26b`     | Current                                           | Port single-wrap hue normalization, an internal 12-significant-digit serialization policy, and the standards-based powerless-hue boundary |
| EVID-905 | Root dependencies have compatible patch/minor updates; the navigation prototype has 3 high and 1 moderate audit findings                                                                                                                                              | Verified       | `npm outdated --json`; `npm audit --prefix prototypes/navigation-study --json`, 2026-09-02                                        | Current                                           | Refresh both graphs and make prototype auditing durable                                                                                   |
| EVID-906 | Radix 3.0.0 and APCA 0.1.9 remain intentional exact pins; major toolchain upgrades require separate migrations                                                                                                                                                        | Verified       | package manifests and current upstream package metadata                                                                           | 2026-09-02                                        | Do not equate every latest major with a safe update                                                                                       |
| EVID-907 | The ignored `release/` directory contains stale/local packaging artifacts and is not current release evidence; the two user-owned files baseline-hashed before this work remain unchanged                                                                             | Verified       | `release/` inventory; preserved `SHA256SUMS.txt` hash `9adc5da9...` and `manifest.json` hash `d733d27b...`                        | Current                                           | Exclude the entire directory from staging and current-release claims; preserve the two known user-owned files                             |
| EVID-908 | Figma's current variable metadata contract has six resolved types, adding `EASING` and `TIMING` to the prior four                                                                                                                                                     | Verified       | `@figma/plugin-typings@1.135.0`; Figma Plugin API `VariableResolvedDataType`, reviewed 2026-09-02                                 | Current                                           | Keep TypeScript and runtime transport validation aligned with the host                                                                    |
| EVID-909 | npm's full and abbreviated registry metadata disagree on several advertised future versions                                                                                                                                                                           | Verified       | exact `npm view` returns `E404` for advertised Figma typings 1.137.0, TypeScript ESLint 8.69.0, and webpack 5.110.3 on 2026-09-02 | Current                                           | Define actionable currency by a consistent full registry record, not an inconsistent tag alone                                            |

### Baseline behavior or reproduction

1. `npm run build` emits `channel: disabled` and omits the candidate UI/backend runtime.
2. `npm run build:generic-candidate` emits a separate candidate bundle and manifest.
3. The candidate is functional for controlled testing but cannot produce `qualified: true`.
4. Root audit is clean; the nested navigation prototype is not included in the root audit and currently reports four findings.
5. Direct color mutations accept any Figma document profile, despite the product contract describing bundled hex as sRGB.

### Alternate framing and do-nothing case

- **Alternate framing:** Simply expose V2 in production. Rejected because it changes distribution before exact host and accessibility evidence exists.
- **Do nothing:** The public build remains safe, but September correctness fixes stay absent, prototype advisories persist, and maintainers continue to confuse the private donor line with the shipping line.

## Users and Journeys

| User or actor       | Job and context                                    | Current journey                                            | Desired journey                                                 | Important failure/recovery path                            |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Teul user           | Apply historical or generated sRGB colors in Figma | Direct writes can occur in an unsupported document profile | Unsupported profiles block before any write and explain why     | Existing node/style state remains untouched                |
| Candidate evaluator | Exercise V2 without affecting released Teul        | Candidate and production histories are easy to conflate    | Separate manifest, bundle, receipt, and warning remain explicit | Re-import candidate manifest; production remains unchanged |
| Maintainer          | Update dependencies and verify release safety      | Root audit omits the nested prototype                      | One root gate checks root and prototype graphs                  | Any advisory fails closed with no exception                |

### Experience states

Normal production continues to show the qualification-status surface. Candidate loading remains explicit. sRGB operations succeed only in a confirmed `SRGB` document; `DISPLAY_P3`, `LEGACY`, missing, unreadable, and future values return an actionable notification without mutation.

## Goals and Non-Goals

### Outcomes

| ID      | Outcome                             | Baseline                                                  | Target                                                                                                                      | Time horizon | Measurement source                                       | Confidence |
| ------- | ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------- | ---------- |
| OUT-900 | One authoritative shipping baseline | Divergent public/private histories                        | Reconciliation branch derives linearly from exact public main and imports no rejected private operational source or history | This change  | Git ancestry, changed-file review, and sanitization gate | High       |
| OUT-901 | Correct color/profile behavior      | Four direct sRGB write paths do not check profile         | All block unsupported profiles before the first write                                                                       | This change  | Focused negative tests                                   | High       |
| OUT-902 | Current secure dependency graphs    | Compatible updates pending; prototype has four advisories | Root and prototype audits report zero advisories                                                                            | This change  | npm audit receipts                                       | High       |
| OUT-903 | Honest V2 lifecycle                 | Partial live evidence is easy to overstate                | Exact current artifact remains candidate-only with superseded evidence labeled                                              | This change  | Build receipts and documentation                         | High       |

### Guardrails and counter-metrics

| ID        | Guardrail                   | Baseline                                           | Maximum regression                            | Measurement                            |
| --------- | --------------------------- | -------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| GUARD-900 | Production isolation        | Candidate runtime absent from normal bundle        | Zero candidate route/runtime exposure         | Artifact and smoke assertions          |
| GUARD-901 | Historical/source integrity | Pinned Wada, Werner, Radix, and provenance records | Zero unreviewed dataset or claim change       | Integrity scripts and diff             |
| GUARD-902 | UI bundle safety            | Enforced repository budget                         | Zero budget breach                            | Production and candidate bundle checks |
| GUARD-903 | Supported runtimes          | Node 22 and 24, npm 10                             | Both supported lines pass deterministic tests | Full matrix                            |

### Non-goals

- Enable or publish V2.
- Import Paul Lab, client-specific, or private Figma evidence.
- Merge private PR #9 into public main.
- Upgrade major framework/toolchain versions.
- Change historical datasets, source claims, or exact Radix values.

### Future considerations

- Complete the remaining exact-bundle Figma failure/replay/accessibility checks.
- Define a separate qualification contract and add a qualified channel only after the exact artifact passes the host/accessibility matrix and receives designated product/domain-owner acceptance.
- Evaluate major dependency migrations independently with compatibility baselines.

## Current System and Constraints

### Relevant system map

`webpack.config.js` selects production-disabled versus candidate UI and backend modules at build time. `manifest.json` points released development loading at `dist`; `figma-candidate/manifest.json` points qualification at `figma-candidate/dist`. `src/code.ts` validates and routes messages. `src/backend/colorOperations.ts` owns direct document color writes. Root and prototype package locks are separate dependency graphs.

### Constraints and appetite

- Product: preserve existing released experience; no V2 activation by inference.
- Technical: use public main as baseline and keep candidate modules tree-shaken from production.
- Legal/security/privacy: reject private donor material and fail closed on dependency findings.
- Design/accessibility: do not transfer an old Figma receipt to changed bytes.
- Operations: use supported Node 22/24 and npm 10; preserve unrelated ignored files.

### Dependencies

| Dependency               | Owner or system | Needed by                | Failure impact                      | Contingency                                       |
| ------------------------ | --------------- | ------------------------ | ----------------------------------- | ------------------------------------------------- |
| npm registry             | npm             | dependency refresh/audit | Currency cannot be proven           | Retain prior lock and report unavailable evidence |
| Figma Plugin API typings | Figma/npm       | Type compatibility       | New API contract may fail typecheck | Retain previous exact pin                         |
| Figma Desktop            | External host   | Final V2 promotion       | Qualification remains blocked       | Candidate stays disabled                          |

## Options and Decision

| Option                                  | User value                  | Feasibility | Risks                                                        | Reversibility | Cost/appetite | Evidence needed                   |
| --------------------------------------- | --------------------------- | ----------- | ------------------------------------------------------------ | ------------- | ------------- | --------------------------------- |
| Do nothing                              | Preserves current release   | High        | Known correctness/dependency drift remains                   | Immediate     | Low           | None                              |
| Merge private branch wholesale          | Combines history quickly    | Low         | Private material, conflicts, large bundle, lost sanitization | Poor          | High          | Not acceptable                    |
| Selective reconciliation on public main | Current, safe shipping line | High        | Requires explicit proof per carried fix                      | High          | Medium        | Full local matrix and source diff |

**Decision:** DEC-900 — Use selective reconciliation on `origin/main@aadccee`; preserve candidate isolation and port only independently justified source-safe changes.

**Cheapest falsification:** Build both channels after the smallest profile/hue slice. Stop if normal production exposes candidate code or current deterministic hashes become unstable.

## Requirements

### Functional and behavioral requirements

| ID      | Priority | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rationale/provenance        | Acceptance IDs |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------- |
| REQ-900 | Must     | The branch must descend linearly from `origin/main@aadccee`, contain no donor/private history, and import no rejected private operational source, fixtures, or paths; governance docs may name rejected refs only to record their exclusion                                                                                                                                                                                                              | EVID-900, EVID-901, DEC-900 | AC-900         |
| REQ-901 | Must     | Fill, stroke, style, and gradient writes must require a live `SRGB` Figma document immediately before mutation                                                                                                                                                                                                                                                                                                                                           | EVID-903                    | AC-901, AC-909 |
| REQ-902 | Must     | Hue normalization must preserve already-normalized fractional values and normalize negative zero; V2 decision inputs, measurements, and serialized OKLCH evidence must use Teul's internal 12-significant-digit canonicalization policy; at the CSS Color 4 powerless-hue threshold of chroma `0.000004` or below, Teul's numeric receipt schema must store the deterministic sentinel `{ c: 0, h: 0 }` rather than claim CSS specifies numeric hue zero | EVID-904                    | AC-902         |
| REQ-903 | Must     | Root and navigation-prototype dependency graphs must be current within compatible versions and report zero audit findings                                                                                                                                                                                                                                                                                                                                | EVID-905, EVID-906          | AC-903         |
| REQ-904 | Must     | The root audit command must include the nested prototype audit so future drift fails the local release gate (`npm run release-gate`)                                                                                                                                                                                                                                                                                                                     | EVID-905                    | AC-904         |
| REQ-905 | Must     | Normal and candidate builds must retain separate output paths, manifests, routes, and unqualified channel receipts                                                                                                                                                                                                                                                                                                                                       | EVID-901, EVID-902          | AC-905         |
| REQ-906 | Must     | Documentation must distinguish the historical August live receipt from verification of the exact reconciled artifact                                                                                                                                                                                                                                                                                                                                     | EVID-902                    | AC-906         |
| REQ-907 | Must     | Enabled-library metadata transport and its active runtime validator must accept exactly Figma's six current resolved variable types and reject unknown or malformed descriptor shapes                                                                                                                                                                                                                                                                    | EVID-908                    | AC-908         |

### Non-functional requirements

| ID      | Category          | Requirement and threshold                                                       | Acceptance IDs |
| ------- | ----------------- | ------------------------------------------------------------------------------- | -------------- |
| NFR-900 | Privacy           | Sanitization scan reports zero rejected private identifiers                     | AC-900, AC-905 |
| NFR-901 | Reliability       | Every unsupported profile case performs zero writes                             | AC-901         |
| NFR-902 | Determinism       | Supported Node 22 and Node 24 produce passing fixed/golden results              | AC-902, AC-907 |
| NFR-903 | Security          | Production, development, and prototype audits report zero vulnerabilities       | AC-903, AC-904 |
| NFR-904 | Maintainability   | Major migrations and intentional visual pins remain unchanged                   | AC-903         |
| NFR-905 | Release integrity | No deployed, qualified, published, or current-live claim without exact evidence | AC-906, AC-907 |

### Business rules and invariants

The canonical refactor invariants and their acceptance proofs are defined in the Behavior Baseline and Invariants section below.

### Explicit implementation freedom

- Compatible package versions may advance when audit, tests, bundles, and notices remain valid.
- Tests may use spies or throwing getters to prove zero-write behavior.
- Documentation wording may be condensed if it preserves the lifecycle distinction.

## Acceptance and Verification

| ID     | Covers                    | Preconditions                                        | Action or stimulus                                                                                             | Observable pass condition                                                                                                                                                      | Proof method                                                                      | Status/evidence                                                                                                                                  |
| ------ | ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-900 | REQ-900, NFR-900          | Reconciliation branch                                | Inspect ancestry, merge parents, complete changed-file set/diff, and operational sanitization                  | Branch descends linearly from `aadccee`, excludes donor ancestors, and contains no rejected private operational path/content; governance-only exclusion references are allowed | Git ancestry/merge audit, full diff review, `npm run verify:generic-sanitization` | Passed locally: public ancestor, no donor ancestor/merge, full change-set review, zero sanitization findings, protected ignored hashes unchanged |
| AC-901 | REQ-901, NFR-901          | Mock Figma profiles                                  | Run all four mutation handlers for SRGB and five unsupported cases                                             | SRGB succeeds; unsupported cases perform zero writes; style rechecks after await                                                                                               | Focused Vitest suite                                                              | Passed on Node 22.13.1 and 24.0.0                                                                                                                |
| AC-902 | REQ-902, NFR-902          | Fractional/negative hue and fixed V2 seed inputs     | Generate scales and Secondary candidates under Node 22/24                                                      | Fractional hue identity, canonical precision, powerless hue, and the exact strategy golden hash match on both runtimes                                                         | Focused semantic assertions and full tests                                        | Passed on both runtimes; golden `31463566...`                                                                                                    |
| AC-903 | REQ-903, NFR-903, NFR-904 | Updated compatible locks                             | Query consistent full registry metadata and audit both graphs                                                  | Zero audit findings; newest consistently resolvable compatible versions are installed except documented intentional pins; majors remain deferred                               | `npm view`, `npm outdated`, audit receipts, diff                                  | Passed: no consistent compatible drift; zero root/production/prototype vulnerabilities                                                           |
| AC-904 | REQ-904, NFR-903          | Root command                                         | Run `npm run audit`                                                                                            | Root policy and nested prototype both pass                                                                                                                                     | Command receipt                                                                   | Passed on both runtimes: 7/7 policy tests and nested low-severity audit                                                                          |
| AC-905 | REQ-905, NFR-900          | Clean builds                                         | Build/assert/smoke normal and candidate channels                                                               | Separate outputs, IDs, names, manifests, artifact paths, and correct receipts; production excludes candidate runtime                                                           | Artifact/manifest checks and search                                               | Passed on both runtimes; Webpack module isolation plus production `192625/326108` and candidate `885316/377683` byte receipts                    |
| AC-906 | REQ-906, NFR-905          | Updated docs                                         | Inspect release record                                                                                         | August observation labeled historical; exact current artifact remains not live-qualified                                                                                       | Review                                                                            | Passed; September receipt is explicitly local-only                                                                                               |
| AC-907 | NFR-902, NFR-905          | Exact final diff                                     | Run complete Node 22/24 gates                                                                                  | Both supported runtimes pass; release state remains local/source-ready only                                                                                                    | Full validation ledger                                                            | Passed locally: 96 files/1,416 tests; coverage `78.07/72.30/82.64/79.59`; full gates green; final review/validator recorded at closure           |
| AC-908 | REQ-907                   | Current and future-type library descriptor fixtures  | Inventory and validate all six current types plus an unknown type                                              | Six current types remain metadata-only and validate; unknown/malformed values fail closed                                                                                      | Inventory and active transport-validator tests                                    | Passed: all six current types accepted; unknown/extra/malformed descriptors rejected                                                             |
| AC-909 | REQ-901, NFR-901, NFR-905 | Exact reconciled production artifact loaded in Figma | Exercise fill, stroke, style, and gradient operations in SRGB plus P3, Legacy, and unreadable/unknown profiles | SRGB succeeds; every unsupported live profile blocks before the first write and preserves prior state                                                                          | Artifact-bound Figma-host acceptance receipt                                      | External/pending; required before publication                                                                                                    |

### Negative and recovery cases

- Remove the profile check or set `DISPLAY_P3`; the zero-write suite must fail.
- Reintroduce a rejected private identifier; sanitization must fail.
- Change candidate channel assertion to qualified; artifact verification must fail.
- Introduce any prototype advisory; the root audit gate must fail.
- Run the exact production artifact in P3, Legacy, or an unreadable/unknown profile; every direct color path must fail before mutation.

## Technical Design

### Proposed architecture and boundaries

Keep public main's three-way boundary: production manifest/output, candidate manifest/output, and a future qualified path that does not yet exist. Port correctness into shared modules only. Extend the dependency gate to evaluate the nested prototype without combining its runtime with the plugin.

### Interfaces, schemas, and data flow

`hasUnsupportedDocumentColorProfile(operation)` reads `figma.root.documentColorProfile`; only exact `SRGB` returns false. All other values notify and return before mutation. Secondary color evidence is canonicalized at 12 significant digits, with near-achromatic hue normalized to zero below the explicit chroma epsilon; final six-digit sRGB remains authoritative. Enabled-library descriptors carry all six current Figma resolved types but remain metadata-only. The dependency ledger remains an empty, versioned JSON record; both root and prototype audit processes must return zero vulnerability entries.

### Instrumentation

Build-channel JSON receipts, artifact hashes, test counts, coverage, audit output, and exact Git revision form the local evidence. No new user telemetry is introduced.

### Alternatives and rejected complexity

No runtime remote feature flag, no donor-history merge, no synthetic qualified receipt, and no dependency major-upgrade bundle are needed for this reconciliation.

## Security Privacy and Compliance

| Concern                | Threat or obligation                | Control                                           | Verification   | Residual risk                               |
| ---------------------- | ----------------------------------- | ------------------------------------------------- | -------------- | ------------------------------------------- |
| Private donor evidence | Public disclosure                   | Public-main baseline plus sanitization scan       | AC-900         | Unknown identifiers outside scan vocabulary |
| Dependency advisories  | Compromised tooling/build           | Zero-exception root and prototype audits          | AC-903, AC-904 | Future registry advisories                  |
| Wrong color profile    | Silent reinterpretation of sRGB hex | Live profile gate before writes                   | AC-901         | Figma host semantics may evolve             |
| Candidate publication  | Unqualified document mutation       | Separate build, warning, and no qualified command | AC-905, AC-906 | Human release error                         |

## Performance Reliability and Observability

| Dimension           | Baseline                    | Target/SLO                         | Load or failure scenario          | Measurement and alert  |
| ------------------- | --------------------------- | ---------------------------------- | --------------------------------- | ---------------------- |
| UI bundle           | Repository-enforced budget  | Both channels remain within budget | Dependency/compiler output growth | Bundle command fails   |
| Create journal      | Bounded/cached on `aadccee` | No regression                      | Repeated assertion/replay         | Existing journal tests |
| Determinism         | Node 22/24 golden tests     | Identical accepted hashes          | Runtime math variation            | Local Node 22/24 gate  |
| Dependency security | Prototype has four findings | Zero                               | New advisory                      | Root audit fails       |

## Behavior Baseline and Invariants

### Refactor outcome

**Product/operating problem:** Shipping truth is split between divergent public and private lines.

**Current measurable constraint:** A simulated merge reports dozens of conflicts and would carry roughly 121,000 private/donor lines.

**Target outcome:** One source-ready branch based on public main with only evidence-backed shared fixes.

**Why refactor instead of repair/no change:** The update must preserve privacy and candidate isolation across package, backend, UI, docs, and release-gate boundaries.

### Blast radius and consumers

| Component/contract       | Consumers        | Owner      | Current behavior         | Risk if changed                | Evidence             |
| ------------------------ | ---------------- | ---------- | ------------------------ | ------------------------------ | -------------------- |
| Production build aliases | Released Teul    | Maintainer | Candidate absent         | Accidental exposure            | Artifact smoke tests |
| Candidate build          | Evaluators       | Maintainer | Separate manifest/output | Wrong plugin or stale artifact | Candidate assertions |
| Direct color operations  | Figma documents  | Teul users | Profile-agnostic         | Color reinterpretation         | Focused tests        |
| Dependency policy        | Gate/maintainers | Maintainer | Root graph only          | Nested advisory blind spot     | Audit output         |

### Behavior baseline

| ID       | Scenario/contract                 | Baseline result                           | Characterization proof and AC        | Intentionally changing? |
| -------- | --------------------------------- | ----------------------------------------- | ------------------------------------ | ----------------------- |
| BASE-900 | Normal build excludes candidate   | Pass                                      | Existing artifact assertions, AC-905 | No                      |
| BASE-901 | Candidate performs Analyze→Create | Pass locally; partial August host receipt | Candidate smoke, AC-905/AC-906       | No                      |
| BASE-902 | Direct color write in P3          | Currently allowed                         | New negative test, AC-901            | Yes                     |
| BASE-903 | Nested prototype audit            | Four findings and not in root gate        | Audit, AC-903/AC-904                 | Yes                     |

### Invariants

| ID      | Invariant                                                                                                                                                   | Applies during | Verification                                               | Failure response                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| INV-900 | Candidate code stays out of production                                                                                                                      | All stages     | AC-905 — bundle scan/assertions                            | Stop and revert slice                                 |
| INV-901 | Candidate cannot claim qualified                                                                                                                            | All stages     | AC-905 — receipt assertion                                 | Stop release                                          |
| INV-902 | Unsupported profiles receive zero writes                                                                                                                    | Runtime        | AC-901 — negative tests                                    | Block merge                                           |
| INV-903 | Source datasets remain identical                                                                                                                            | Migration      | AC-900, AC-907 — integrity hashes                          | Revert source drift                                   |
| INV-904 | The two baseline-hashed user-owned release files remain unchanged; all ignored `release/` artifacts remain excluded from staging and current-release claims | Migration      | AC-900, AC-907 — SHA-256 comparison and staged-file review | Restore only task changes; preserve all ignored files |

## Refactor Strategy and Migration

### Target architecture and seam

Start from the sanitized public branch. Port shared correctness at narrow module seams, then update dependency manifests/locks, then re-seal both build channels. Do not combine Git histories.

### Migration stages

| Stage | Change                                               | Traffic/data state              | Entry criteria           | Exit criteria      | Rollback procedure               |
| ----- | ---------------------------------------------------- | ------------------------------- | ------------------------ | ------------------ | -------------------------------- |
| 1     | Add contract, profile, and deterministic-color fixes | Local only                      | Public baseline verified | AC-900–AC-902 pass | Revert focused source/test diff  |
| 2     | Refresh compatible dependencies and prototype audit  | Local only                      | Stage 1 green            | AC-903–AC-904 pass | Restore manifests/locks          |
| 3     | Rebuild and document exact artifacts                 | Candidate remains private/local | Stages 1–2 green         | AC-905–AC-908 pass | Restore prior source and rebuild |

### Compatibility and coexistence

Released production and candidate remain separate manifests. No data migration occurs. Existing Figma documents are untouched unless a user explicitly runs an operation; unsupported profiles now fail earlier.

### Performance and cost comparison

| Workload                | Old baseline                                 | New target             | Maximum regression | Measurement    |
| ----------------------- | -------------------------------------------- | ---------------------- | ------------------ | -------------- |
| Production/candidate UI | Current enforced limits                      | Both pass              | Zero budget breach | Bundle checks  |
| Full test suite         | 96 files/1,403 tests on prior public receipt | All current tests pass | Zero failure       | Node 22/24 run |

### Legacy cleanup

No legacy UI removal occurs. The private donor branch remains recoverable and is not rewritten or deleted.

## Risks and Mitigations

| ID       | Risk or pre-mortem failure                 | Likelihood | Impact   | Early signal                         | Mitigation                           | Contingency/kill criterion             |
| -------- | ------------------------------------------ | ---------- | -------- | ------------------------------------ | ------------------------------------ | -------------------------------------- |
| RISK-900 | Private material leaks into public line    | Low        | Critical | Sanitization finding or private path | Public baseline; explicit file scope | Stop immediately                       |
| RISK-901 | Dependency update changes generated output | Medium     | Medium   | Hash/bundle/test drift               | Compatible-only updates; full reseal | Revert offending package               |
| RISK-902 | Profile gate blocks legitimate usage       | Low        | Medium   | SRGB positive test fails             | Exact host enum and clear notice     | Revert and investigate Figma semantics |
| RISK-903 | Old live receipt is treated as current     | Medium     | High     | Docs omit exact revision boundary    | Mark it historical/superseded        | Block promotion                        |

## Migration Compatibility and Rollback

No persistent schema or user data migration. Each slice is source-revertible. Figma documents created by prior versions remain usable. The candidate channel and public build stay independently loadable.

## Rollout and Operations

### Milestones and exit criteria

| Stage                         | Audience/traffic           | Entry criteria                                                            | Exit criteria                                                                                                               | Owner                             | Rollback trigger                                 |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Reconciliation                | Maintainers only           | Public baseline                                                           | AC-900–AC-908 pass; source-ready branch                                                                                     | Paul Jun                          | Any privacy/isolation failure                    |
| Production profile acceptance | Authorized Figma evaluator | Exact sealed production artifact                                          | AC-909 passes against the exact bytes                                                                                       | Paul Jun/designated reviewer      | Any unsupported-profile mutation                 |
| Candidate requalification     | Authorized evaluators      | Exact sealed candidate                                                    | Remaining host/accessibility matrix, designated owner acceptance, and a separate artifact-bound qualification contract pass | Paul Jun and designated reviewers | Mutation/recovery/accessibility/approval failure |
| Publication                   | Users                      | Production AC-909 plus qualified candidate receipt and explicit authority | Figma publish succeeds and is observed                                                                                      | Paul Jun                          | Release regression                               |

### Operational readiness

- Feature flag or control plane: build-time disabled/candidate channel; no qualified path.
- Dashboards and alerts: not applicable; local classic plugin.
- Runbook and on-call: candidate release record documents import and remaining checks.
- Documentation and support: update candidate record with exact reconciliation receipt.
- Analytics and experiment plan: no telemetry; use authorized qualification worksheets.
- Sales/marketing/legal/partner impact: none in this local reconciliation.

## Decisions and Open Questions

### Decision log

| ID      | Date       | Decision                                                        | Alternatives                | Rationale/evidence                                 | Decider                            |
| ------- | ---------- | --------------------------------------------------------------- | --------------------------- | -------------------------------------------------- | ---------------------------------- |
| DEC-900 | 2026-09-02 | Use public main as shipping baseline and selectively port fixes | Do nothing; wholesale merge | Privacy, conflict, and release-boundary evidence   | Codex within Paul's update request |
| DEC-901 | 2026-09-02 | Keep V2 disabled during reconciliation                          | Enable candidate            | Exact artifact is not qualified                    | Existing release contract          |
| DEC-902 | 2026-09-02 | Update compatible versions only                                 | Latest majors               | Major upgrades have independent compatibility risk | Reversible scope                   |

### Open questions

| ID    | Question                                                                                                                                                                                                                                | Why it matters                                                                          | Resolution method                                                                                                        | Owner/decider                 | Blocks                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------- |
| Q-900 | Does the exact reconciled candidate pass the four remaining Figma-host/accessibility cases, receive designated product/domain-owner acceptance, and obtain an artifact-bound qualified receipt under a separate qualification contract? | All are required for promotion; this reconciliation cannot authorize it                 | Authorized Figma qualification and owner review against exact commit/artifact hashes                                     | Paul Jun/designated reviewers | Qualified channel/publication |
| Q-901 | Does the exact reconciled production artifact enforce the new profile guard in the Figma host for all four direct color operations?                                                                                                     | Mock tests make the source ready, but live host evidence is required before publication | Authorized disposable-file run in SRGB, P3, Legacy, and unreadable/unknown profiles, bound to commit and artifact hashes | Paul Jun/designated reviewer  | Publication                   |

## Plan of Action

**Canonical plan:** `docs/plans/2026-09-02-teul-current-reconciliation-plan.md`

**Critical path:** TASK-900 → TASK-901 → TASK-902 → TASK-903 → TASK-904

**Highest-uncertainty proof:** TASK-903 must prove both build channels retain their isolation after dependency/compiler changes.

**Publication follow-up:** TASK-905 transfers the exact production host matrix to an authorized Figma evaluator; it is outside this locally verified source-reconciliation boundary.

## Traceability

| Outcome          | Requirement      | Acceptance             | Task               | Verification receipt                  | Release gate                               |
| ---------------- | ---------------- | ---------------------- | ------------------ | ------------------------------------- | ------------------------------------------ |
| OUT-900          | REQ-900          | AC-900                 | TASK-900           | Passed locally                        | Baseline                                   |
| OUT-901          | REQ-901, REQ-902 | AC-901, AC-902, AC-909 | TASK-901, TASK-905 | Local proof passed; host gate pending | Correctness and production host acceptance |
| OUT-902          | REQ-903, REQ-904 | AC-903, AC-904         | TASK-902           | Passed locally                        | Security/currency                          |
| OUT-903          | REQ-905, REQ-906 | AC-905, AC-906, AC-907 | TASK-903, TASK-904 | Passed locally                        | Source-ready only                          |
| OUT-903          | REQ-907          | AC-908                 | TASK-902, TASK-903 | Passed locally                        | Host-contract compatibility                |
| OUT-900, OUT-903 | NFR-900          | AC-900, AC-905         | TASK-900, TASK-903 | Passed locally                        | Privacy/build isolation                    |
| OUT-901          | NFR-901, NFR-902 | AC-901, AC-902, AC-907 | TASK-901, TASK-903 | Passed locally                        | Runtime correctness                        |
| OUT-902          | NFR-903, NFR-904 | AC-903, AC-904         | TASK-902           | Passed locally                        | Dependency security                        |
| OUT-903          | NFR-905          | AC-906, AC-907         | TASK-903, TASK-904 | Passed locally                        | Honest lifecycle                           |

## Post-Launch Learning

| Review date                | Outcome/guardrail       | Baseline                   | Observed                            | Decision      | Follow-up     |
| -------------------------- | ----------------------- | -------------------------- | ----------------------------------- | ------------- | ------------- |
| After authorized Figma run | Candidate qualification | Historical partial receipt | Not yet observed for exact artifact | Keep disabled | Resolve Q-900 |

## Changelog

| Date       | Change                                                                                                                                                       | Reason/evidence              | Affected IDs                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------- |
| 2026-09-02 | Created reconciliation contract from live branch/dependency audit                                                                                            | EVID-900–EVID-907            | All                                                     |
| 2026-09-02 | Added Secondary canonical-math, current Figma metadata, registry-consistency, manifest-isolation, and explicit promotion boundaries after independent review | EVID-904, EVID-908, EVID-909 | REQ-902, REQ-907, AC-902, AC-903, AC-905, AC-908, Q-900 |
