# Teul Product Improvement Program

Status: Implemented and release-verified
Date: 2026-07-13

## Objective

Make Teul the most trustworthy practical bridge between documented color and
grid sources and Figma-native output. Correctness and source truth remain the
first gate. New features must not outrun the evidence or the mutation safety of
the plugin.

This program turns the July 2026 audit into four focused product requirements
documents:

- `docs/PRD_COLOR_TRUTH_2026-07-13.md`
- `docs/PRD_FIGMA_NATIVE_OUTPUT_2026-07-13.md`
- `docs/PRD_GRID_AUTHORING_2026-07-13.md`
- `docs/PRD_PRODUCT_QUALITY_2026-07-13.md`

The canonical source claims remain governed by `docs/SOURCE_PROVENANCE.md`.

## Execution Order

| Phase | Outcome                                              | Exit gate                                                                                                                                 |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Lock the PRDs and implementation sequence            | Every finding has an owner document, acceptance criteria, and verification path                                                           |
| 1     | Remove the remaining inaccurate color presentation   | All 269 historical swatches use computed rendered contrast; generated advice contains no untested contrast, harmony, role, or usage claim |
| 2     | Make every document mutation safe and observable     | Every mutation returns one correlated terminal result, offers required destructive choices, and forms one deliberate undo boundary        |
| 3     | Add Figma-native variable output                     | Primitive and semantic variables round-trip through light/dark modes, aliases, collision handling, and rollback                           |
| 4     | Build Grid Construction v2 and real custom authoring | Users can capture, create, edit, validate, save, import, export, and apply supported custom constructions without geometry drift          |
| 5     | Connect the product workflow and simplify the code   | Selection-aware accessibility, a guided generator, shared controllers, smaller feature modules, and recovered bundle headroom             |
| 6     | Release acceptance                                   | Full automated gate passes; Figma desktop acceptance and provenance evidence are current; public claims match shipped behavior            |

## Current Checkpoint — 2026-07-14

- Phase 1 is complete in code: rendered swatch contrast uses the exact WCAG
  pair, all 269 historical colors are covered, and untested pairing, harmony,
  CTA, and usage-percentage claims are absent.
- Phases 2 and 3 are complete in code: mutations use validated correlated
  results; grid Apply and Clear share one controller; color collections,
  variables, aliases, styles, and frames support safe collision choices,
  ownership checks, rollback, and one deliberate undo boundary.
- Phase 4 is complete in code and current Figma acceptance: the Grid Construction v2 editor supports native
  and generated realizations, asymmetric and binding margins, unequal tracks
  and gutters, nested subdivisions, inset baselines, fit validation, geometry
  editing, capture, versioned storage, linked-resource policy, import/export,
  and reapply.
- Phase 5 product workflows are implemented: the generator uses the three-stage
  flow; selection-aware accessibility reads exact supported canvas pairs;
  workspace context persists through `figma.clientStorage`; shared operation
  controllers enforce request integrity; Saved Grid cards and dialogs are
  separated from screen orchestration; color-system document and layout code is
  split by responsibility; and grid storage is separated into codec,
  repository, migration, and import/export layers behind a stable facade.
- Both historical browsers now use one rendered-swatch primitive and one source
  disclosure primitive. This also removes the nonstandard Wada `A` label at the
  3:1 threshold; both browsers now use the WCAG `AA Large` name for the exact
  rendered pair.
- The current production UI artifact is 360,583 bytes against a 409,600-byte
  limit. Production uses Preact's React compatibility layer while development
  and tests retain the React toolchain. The production-reference report finds
  no dead exports.
- Final automated checkpoint: lint, typecheck, 53 test files and 676 tests,
  coverage, build, artifact assertions, bundle budget, production UI smoke,
  dead-export report, pinned Wada verification, dependency audit, and
  `git diff --check` pass. Current Figma desktop acceptance covers the guided
  generator, constrained semantic aliases, collision copies, one-step color
  undo, persisted workspace and saved grids, advanced grid authoring,
  Add/Replace/Cancel, Clear, and one-step grid undo. A final rebuilt-bundle run
  reconfirmed the shared historical swatch labels and WCAG-constrained output.
  All program implementation items and release gates are complete.

## Delivery Rules

- Complete each phase on a buildable branch with focused tests.
- Do not describe a suggestion as contrast-safe, harmonious, accessible, exact,
  or source-faithful unless the output carries the evidence that proves it.
- Do not mutate a Figma document before the full operation is preflighted.
- Do not show success until the backend confirms the terminal result.
- Do not add another historical library or preset family before Phases 1-5 are
  complete.
- Display P3 conversion remains a separate product decision. Until then, Teul
  preserves and discloses its sRGB numeric values.
- Resolving Wada `Dull Violet Black` M=106 requires the licensed Seigensha
  edition. Preserve it as unresolved until that source is reviewed.

## Verification Matrix

| Requirement class | Required evidence                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Historical data   | Pinned source, semantic hash, provenance record, integrity test                            |
| Color claims      | Exact rendered pair, unrounded WCAG result, named method and profile                       |
| Grid claims       | Cited artifact or standard, canonical dimensions, emitted-geometry test                    |
| Figma mutations   | Preflight, structured result, rollback fault injection, undo acceptance                    |
| Storage           | Versioned codec, import rejection tests, round trip, Figma clientStorage acceptance        |
| Product UI        | Component integration tests plus current Figma desktop keyboard and visual acceptance      |
| Release           | Lint, typecheck, tests, coverage, build, artifact assertions, dependency audit, clean diff |

## Completion Definition

This program is complete only when all four PRDs meet their acceptance criteria,
the release record is updated with current evidence, and the public repository
does not claim behavior that the shipped plugin cannot perform.
