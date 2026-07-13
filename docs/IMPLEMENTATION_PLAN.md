# Teul End-To-End Implementation Plan

Status: Current automated remediation recorded; source-dependent and manual acceptance work remains
Date: 2026-07-12

This plan is governed by `docs/PRD.md` and `docs/SOURCE_PROVENANCE.md`.
Correctness and source truth come before visual refactoring.

## Current Automated Evidence

- Exact Radix Colors pins `@radix-ui/colors@3.0.0` and exactly matches all 31
  light/dark solid-color families, 62 scales, and 744 values.
- The generated-scale matrix covers 269 historical source colors in both modes:
  536 of 538 outputs validate and build successfully. Wada `White` returns the
  two explicit failures, one per mode.
- The grid-fit matrix covers 65 presets across 12 required frame sizes: 555 of
  780 cases fit, 22 warn, and 203 intentional canonical/width-contract failures
  with actionable recommendations.
- These are automated results only. Manual Figma acceptance is not recorded as
  passing. Werner's bundled data is now independently derived from a pinned
  public-domain Getty scan.

## Completed In This Audit

- Corrected Wada, Syme/Werner, Radix, accessibility, and Swiss-grid product
  claims.
- Added source-integrity tests and pinned semantic hashes for the Wada, Werner,
  and Radix corpora.
- Added machine-readable historical-source and per-preset grid provenance,
  including uncertainty, evidence strength, derivation, and credits.
- Expanded the bundled grid catalog with 31 directly sourced historical,
  editorial, poster, and product-system constructions. Every bundled preset now
  declares reference dimensions and an application mode; source-faithful
  reconstructions block noncanonical frames instead of distorting them.
- Fixed grid `sectionSize`, fixed-guide sizing, saved-grid application,
  multi-selection reporting, and per-target percentage conversion. Fit analysis
  and backend application now use the same target resolver.
- Added fit analysis and actionable recommendations across the complete preset
  and frame-size matrix. Analysis uses the production resolver after integer
  quantization, and apply is blocked when any eligible target fails. Current
  totals are 555 fit, 22 warning, and 203 actionable canonical/width-contract
  failures.
- Hardened saved-grid import/storage validation and surfaced persistence
  failures.
- Rejected invalid hex input instead of silently coercing it to black.
- Replaced the generated-scale engine with gamut-mapped OKLCH generation,
  explicit success/failure results, source-anchor preservation, final-output
  validation, and exact WCAG pairing reports. Current bundled-source results
  are 536 valid outputs and two explicit Wada `White` failures.
- Added explicit Exact Radix Colors, Teul Generated, and WCAG-Constrained Tokens
  modes. The constrained mode derives semantic tokens and blocks creation and
  export unless every declared WCAG 2.2 color pairing passes.
- Preserved dynamic numbered color roles across exports, styles, and generated
  Figma frames.
- Preserved the established export and Figma-style step-name contracts
  separately; a shared `1000` suffix would otherwise change from step 11 in
  existing Figma styles to step 12.
- Added runtime validation for every active UI-to-plugin message.
- Added Figma document-profile detection and explicit Display P3 disclosure;
  generated and bundled numeric values remain labeled sRGB.
- Added modal focus trapping, Escape/focus restoration, stacked-dialog
  isolation, tab semantics, visible keyboard focus, and keyboard-accessible
  card actions.
- Removed unreachable UI, backend routes, duplicate conversion code, stale
  types, unused dependencies, network permissions, and secret injection.
- Removed the emitted duplicate UI JavaScript artifact and added an inline
  Figma UI bundle budget.
- Added compact runtime projections for the two large source datasets while
  preserving their reviewed JSON files and runtime object shapes unchanged.
- Moved CI to supported Node versions.
- Replaced the Werner modern-recreation dependency with an independent
  public-domain transcription and reproducible scan-sampling workflow; removed
  unsupported aliases and inferred related-color relationships.

## Remaining Product Work

- Verify the Wada `Dull Violet Black` CMYK exception and add stable
  primary-source card/page identifiers.
- Implement actual profile conversion only if Teul intends to transform values
  for Display P3 documents; current behavior intentionally discloses and
  preserves sRGB values.
- Continue splitting the largest presentation/backend modules; color-system
  submission now reuses the canonical export-scale model instead of rebuilding
  a second payload.
- Complete the manual Figma acceptance matrix for profiles, mixed selections,
  locks, rotations, existing guides/styles, and resize behavior.

## Delivery Rules

- Do not change source datasets without a provenance record, exception log, and
  integrity test.
- Do not add product claims that are not covered by an acceptance test or
  documented source.
- Each phase must leave the repository buildable and testable.
- UI success states must reflect confirmed backend/storage results.
- Remove obsolete behavior only after confirming that no active user workflow
  depends on it.

## Phase 0: Lock Source Truth And Claims

Goal: align product language and machine-readable provenance before changing
core behavior.

### Work

- Add machine-readable source metadata for Wada, Werner, Radix, grid presets,
  and generated scales.
- Correct Wada counts in README and product copy.
- Replace "exact/accessibile/classic/foundational/standard" claims where evidence
  does not support them.
- Label APCA experimental and WCAG 2.2 normative.
- Label generated scales as Teul Generated; reserve Exact Radix Colors for exact package
  data.
- Relabel current historical grid claims as Swiss-inspired modern adaptations.
- Add source/license/derivation documentation to the repository.

### Exit criteria

- Every bundled source collection and grid preset has a classification.
- No user-visible claim contradicts the provenance ledger.
- Dataset-integrity tests cover counts, IDs, relationships, and documented
  exceptions.

## Phase 1: Correctness Hotfixes

Goal: remove silent wrong-output paths before deeper refactoring.

### Grid hotfixes

- Fix native uniform-grid `sectionSize` loss.
- Stop saved-grid application from using `800x600`.
- Wait for backend confirmation before showing success.
- Reject invalid grid geometry before mutation.
- Revalidate eligible selected nodes immediately before apply.
- Report partial success across selection.

### Color hotfixes

- Reject invalid hex instead of coercing to black.
- Pin Exact Radix Colors values to the reviewed package and integrity-test the
  complete payload.
- Preserve existing style/export token meanings; require a versioned migration
  before adopting a unified naming scheme.
- Remove or clearly disable multi-select until dynamic output is complete.
- Correct APCA/WCAG labels.

### Storage hotfixes

- Validate imported grid records.
- Invalidate cache on clear.
- Surface storage failure.

### Exit criteria

- No hard-coded target dimensions in apply flows.
- No silent fallback to black.
- No known native uniform-grid interval loss.
- Malformed import fixtures are rejected.
- Regression tests reproduce and prove each hotfix.

## Phase 2: Shared Contracts And Domain Models

Goal: establish one typed boundary before expanding behavior.

### Message contract

- Replace raw router messages with one discriminated union.
- Add runtime payload validation at `figma.ui.onmessage`.
- Return structured operation results:
  - success
  - partial success
  - failure
  - applied/skipped/failed node details

### Color domain

- Define `SourceColor`, `ColorValue`, `Provenance`, `ColorScale`, `ScaleRole`,
  `ContrastResult`, and `ColorProfile`.
- Store dynamic scales as arrays with stable IDs.
- Centralize parsing, step naming, and export serialization.

### Grid domain

- Separate Teul domain inputs from Figma `LayoutGrid`.
- Model row/column/uniform guides as distinct discriminated types.
- Add explicit construction mode and native-approximation metadata.
- Add serializable Auto count representation.
- Model independent margins and grouped/nested structures.

### Exit criteria

- Frontend and backend compile against the same messages and domain types.
- Active raw `parent.postMessage` calls route through one helper.
- One canonical grid converter is used in production and tests.
- Stale message/type files and unreachable router branches are removed.

## Phase 3: Grid Engine And Workflow

Goal: produce predictable guides for arbitrary target frames.

### Construction engine

- Implement fixed, responsive stretch, proportional, typographic baseline,
  modular, and native-approximation modes.
- Resolve each target independently from its actual dimensions.
- Keep baseline rhythm fixed across frame resizing.
- Add fit analysis and recommendations when sections become unusable.
- Support multiple native guides for grouped columns or unequal constructions.
- Display construction math and approximation notes.

### Figma operations

- Apply/create/append/replace/clear across all eligible selected nodes.
- Support frames, components, component sets, and instances where the API
  permits.
- Preserve or explicitly replace existing guide styles/variables.
- Handle locks, rotations, hidden guides, stale selection, and mixed selection.

### Preset catalog

- Add provenance/classification to all presets.
- Remove impossible claims from existing presets.
- Separate named modern systems from Teul adaptations.
- Add breakpoint or fit guidance for desktop-oriented presets.
- Decide whether to ship the custom-grid editor; otherwise remove unreachable
  editor code and claims.

### Required frame test matrix

| Name                        | Dimensions |
| --------------------------- | ---------: |
| Small mobile                |    320x568 |
| Modern phone                |    390x844 |
| Tablet portrait             |   768x1024 |
| Tablet landscape / 4:3      |   1024x768 |
| 16:9                        |   1280x720 |
| Desktop                     |   1440x900 |
| Full HD                     |  1920x1080 |
| Square                      |  1080x1080 |
| Portrait social             |  1080x1350 |
| Story/video portrait        |  1080x1920 |
| A-series approximation      |   794x1123 |
| Arbitrary/tiny invalid case |    100x100 |

### Exit criteria

- Every bundled preset produces a valid result or an actionable fit failure for
  every test size.
- Percentage/proportional inputs resolve from each target node.
- Native Figma square `GRID` output is labeled Uniform Grid rather than
  Baseline.
- Multi-selection integration tests report correct result counts.

## Phase 4: Color Engine And Workflow

Goal: make generated output semantically useful, profile-aware, and testable.

### Exact source and library modes

- Add source/profile disclosure to Wada and Werner detail views.
- Preserve Wada source CMYK and derived sRGB/Lab separately.
- Keep Werner source transcription separate from normalized display text.
- Pin and integrity-test Radix Colors.
- Detect and display the Figma document color profile.

### Generated scales

- Replace pre-clamped gamut checks with standards-aligned gamut mapping.
- Define semantic targets before generating steps.
- Preserve or disclose source-anchor movement.
- Validate monotonicity, duplicates, final contrast, and finite output.
- Report exact tested pairings and failures in the UI.
- Treat light and dark scales as separately validated outputs.

### Dynamic roles and output

- Replace fixed role-key iteration with a dynamic scale collection.
- Make preview, CSS, Tailwind, JSON, Figma styles/variables, and generated frames
  consume the same model.
- Normalize or validate usage proportions.
- Define style collision/update policy.

### Exit criteria

- All 269 bundled source colors pass defined generation invariants or return a
  clear generation failure.
- Exact Radix mode matches the pinned package.
- Dynamic role counts survive every output path.
- No generated output is labeled accessible without a passing specific test.

## Phase 5: UI And Codebase Simplification

Goal: reduce maintenance cost after contracts and behavior are stable.

### Remove

- Unreachable `GridControls` if the custom editor is not shipped.
- Unused `components/ui/` branch, duplicate tooltip/theme components, stale CSS,
  stale message types, dormant accessibility code, and dead router branches.
- Unused Radix UI, Tailwind, PostCSS, Lucide, loader, and lint dependencies.
- Unused `ANTHROPIC_API_KEY` injection and unused manifest network access.
- Extraneous Framer Motion lockfile entries.

### Consolidate

- Extract hooks/controllers from large view components.
- Create a small active component kit for modal, button, field, tabs, card,
  status/result, and provenance disclosure.
- Use theme context/CSS variables rather than repeated inline style maps.
- Use one modal accessibility pattern with roles, focus trap, Escape, and focus
  restoration.

### Exit criteria

- No product-unreachable source files except intentional ambient/build files.
- No unused direct dependencies.
- No duplicated production grid converters or token maps.
- Largest modules have clear domain/view boundaries.

## Phase 6: Verification, Security, And Release

Goal: prove the complete product contract.

### Automated tests

- Source provenance and integrity tests.
- Color conversion, gamut, contrast, and property-based scale tests.
- Grid property tests over every preset and frame size.
- Figma backend mocks for selections, mixed values, styles, variables, and
  partial failures.
- Message contract and runtime-validation tests.
- Import/export schema and migration tests.
- Component/integration tests for active workflows.

### Tooling

Completed in this audit:

- CI uses supported Node 22 and 24 with npm 10.9.8.
- Lint warnings fail CI.
- Coverage includes library, backend, component, and UI surfaces with enforced
  aggregate thresholds.
- Unused PostCSS/Tailwind tooling and the associated advisory surface were
  removed.
- Development tooling was updated and `npm audit` is enforced in CI.
- Production artifacts enforce the Figma UI bundle budget and legal/provenance
  documents.

### Manual Figma acceptance

Not recorded as passing. Required checks:

- sRGB and Display P3 files.
- Empty, single, and mixed multi-selection.
- Frames, components, instances, component sets, locked and rotated nodes.
- Existing guide styles, paint styles, and variables.
- Resize after applying fixed and stretch guides.
- Create, update, append, replace, and clear operations.
- Export/import round trip.

### Release gate

Run:

```sh
npm run lint
npm run typecheck
npm run test:run
npm run test:coverage
npm run build
npm run assert:artifacts
npm run audit
```

Release only when the PRD acceptance criteria and manual Figma matrix are
recorded as passing.

## Recommended Pull Request Sequence

1. `docs: add product contract and provenance ledger`
2. `fix: make grid application dimension-safe and result-driven`
3. `fix: validate colors, imports, and exact Radix data`
4. `refactor: unify plugin message and operation result contracts`
5. `refactor: introduce canonical grid domain and converter`
6. `feat: add responsive, fixed, uniform-grid, and fit-aware grid modes`
7. `refactor: introduce provenance-aware color domain`
8. `fix: replace custom scale gamut and validation pipeline`
9. `feat: make color-system scales and outputs fully dynamic`
10. `refactor: remove dead code and dependencies`
11. `test: add end-to-end Figma workflow and source-integrity gates`
12. `docs: align user-facing claims and release evidence`
