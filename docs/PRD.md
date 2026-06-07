# Teul Product Requirements Document

Status: Draft implementation contract
Date: 2026-06-06

## 1. Product Definition

Teul is a Figma Design plugin for exploring historically sourced color
relationships, translating them into clearly labeled digital color values, and
constructing layout guides for modern and print-like design work.

Teul must distinguish source material from interpretation:

| Classification        | Meaning                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Historical source     | Names, descriptions, palette membership, ordering, or numbering transcribed from a cited primary source |
| Publisher-derived     | Values added by a modern publisher, such as Seigensha CMYK recipes                                      |
| Digital approximation | RGB, hex, Lab, or OKLCH values derived through a documented conversion or scan-sampling process         |
| Exact library data    | Values copied from a versioned third-party library, such as Radix Colors                                |
| Historically informed | A modern construction based on documented historical principles                                         |
| Modern adaptation     | A system designed for current Figma, screen, video, social, or design-system use                        |
| Generated             | A new result created by Teul and validated against Teul's documented rules                              |

Teul must not describe digital approximations, generated scales, or unsourced
grid presets as historically exact.

## 2. Problem Statement

The current product combines useful source material with modern generated
outputs, but it does not consistently disclose where values came from or which
guarantees apply. Several active workflows also produce incorrect or incomplete
results:

- Saved percentage grids can be applied using hard-coded dimensions.
- Baseline presets become uniform square grids and can silently become 8px.
- Several grid descriptions promise geometry the data model cannot represent.
- Custom generated color scales do not reliably meet semantic or contrast goals.
- Multi-select color systems silently omit scales in exports and Figma output.
- Historical, publisher-derived, scan-sampled, converted, and generated values
  are presented without sufficient distinction.

## 3. Product Goals

1. Make source provenance and uncertainty visible without making exploration
   cumbersome.
2. Produce predictable layout guides for arbitrary Figma frame sizes.
3. Preserve historical palette relationships while clearly labeling digital
   interpretations.
4. Generate useful color systems whose semantic and accessibility guarantees
   are explicit and testable.
5. Make every mutation of the Figma document validated, typed, and reportable.
6. Simplify the codebase around one color model, one grid engine, and one
   message contract.

## 4. Non-Goals

- Claiming that screen colors exactly reproduce aged physical source material.
- Claiming print-ready CMYK without a named output profile and proofing workflow.
- Treating every geometric layout as a historical Swiss grid.
- Automatically making user content responsive; layout guides do not replace
  constraints or auto layout.
- Claiming full WCAG conformance for a product based only on color-pair checks.
- Treating APCA as a normative WCAG 3 conformance method.

## 5. Primary Users And Jobs

### Product and interface designers

- Apply responsive layout guides to desktop, tablet, mobile, component, and
  nested frames.
- Turn an inspiring historical color into usable semantic design tokens.
- Create or update local Figma styles without silently losing existing work.

### Editorial and graphic designers

- Explore historically sourced combinations and natural color references.
- Construct grids for portrait, landscape, square, poster, presentation, and
  print-like formats.
- Understand the construction math and adapt it intentionally.

### Design-system maintainers

- Export stable, consistently named tokens.
- Validate light/dark pairs and semantic use cases.
- Reuse, share, import, and version grid definitions safely.

## 6. Product Principles

1. **Provenance before precision:** a labeled approximation is better than an
   unexplained precise-looking number.
2. **Construction before preset:** a grid is a response to format, typography,
   content, and available space.
3. **Semantic before decorative:** a generated 12-step scale must define what
   each step is for.
4. **Validate final output:** contrast and gamut checks apply after conversion,
   mapping, compositing, and rounding.
5. **No silent coercion:** invalid colors, malformed grids, unsupported nodes,
   and partial failures must be reported.
6. **Figma-native truth:** distinguish layout guides from auto-layout grids and
   disclose native approximations.

## 7. Source And Data Requirements

### DATA-001: Provenance records

Every bundled dataset and preset must have a versioned provenance record with:

- Source title, creator, edition/year, and URL.
- Primary-source URL where available.
- Transcription or library repository, commit/version, and license.
- Field-level classification and derivation method.
- Color space, ICC profiles, rendering intent, and rounding rules where relevant.
- Known exceptions, corrections, and unresolved uncertainty.

### DATA-002: Wada corpus

- Present the corpus as **159 normalized colors used across 348 combinations**.
- Validate the distribution: 120 two-color, 120 three-color, and 108 four-color
  combinations.
- Preserve modern flattened IDs `1-348`, while supporting original-card IDs
  such as `A-2-001`, `A-3-001`, and `A-4-001`.
- Treat names, palette membership, ordering, and original numbering as
  historical-source fields.
- Treat Seigensha CMYK as publisher-derived.
- Label the bundled SWOP-to-sRGB hex/RGB/Lab values as digital approximations.
- Preserve the source exception `Dull Violet Black: M=106` in an exception log;
  do not silently clamp it.

### DATA-003: Werner corpus

- Define the bundled 110-color collection as Patrick Syme's 1821 second
  edition, adapted from Werner's nomenclature. Do not describe it as "110
  colors from 1814"; the 1814 first edition contains 108 colors.
- Preserve all 110 source colors, grouping, original nature references,
  characteristic-color markers, and component descriptions.
- Store independently reviewed source transcription separately from normalized
  display text.
- Preserve component relationships in the source prose; do not create an
  inferred relationship graph without a documented rule.
- Label bundled hex values as scan-sampled digital approximations.
- Pin the public-domain source archive, plate hashes, reviewed sample
  coordinates, and reproducible sample method.

### DATA-004: Radix data

- Exact Radix Match mode must use values from a pinned `@radix-ui/colors`
  version.
- The UI must show that version.
- Generated 12-step scales must be called "Radix-inspired" rather than Radix.
- A source-integrity test must compare bundled exact values with the pinned
  package.

### DATA-005: Dataset changes

- Dataset updates require a changelog entry and automated integrity tests.
- Normalization or editorial corrections must not overwrite the reviewed source
  transcription.
- Source assets or transcriptions with unclear redistribution rights require a
  legal review before bundling.

## 8. Color-System Requirements

### COLOR-001: Color identity

Each displayed color must show:

- Source collection and source classification.
- Primary source/publisher/transcription attribution.
- Hex/RGB profile assumption.
- CMYK profile or "unprofiled/publisher recipe" warning.
- Known uncertainty or exception.

### COLOR-002: Color profiles

- Detect `figma.root.documentColorProfile`.
- Label exported hex/RGB with the assumed profile.
- Default historical digital approximations and web exports to sRGB.
- Warn before applying sRGB approximations into Display P3 documents when exact
  numeric values are being preserved.

### COLOR-003: CMYK

- Do not describe CMYK as print-ready without a named profile.
- Preserve Wada publisher CMYK values as source data, including out-of-range
  exceptions.
- Any generated RGB-to-CMYK output must be omitted, profile-driven, or labeled
  as estimated/unprofiled.

### COLOR-004: Exact Radix Match

- Match a source color to an exact, pinned Radix family.
- Explain that the source color is an input to family selection, not necessarily
  present in the returned scale.
- Preserve Radix step semantics and exact light/dark values.

### COLOR-005: Generated semantic scales

Generated scales must:

- Preserve the selected source color as a documented anchor or explain why it
  moved.
- Define semantic roles for every generated step.
- Preserve finite values and intended lightness ordering.
- Use a standards-aligned gamut-mapping method rather than pre-clamping RGB.
- Avoid duplicate adjacent values after mapping and hex rounding.
- Validate intended contrast pairs after final conversion and rounding.
- Report passed, failed, and untested guarantees.

Generated scales must not inherit Radix guarantees.

### COLOR-006: Accessibility

- WCAG 2.2 is the normative contrast basis.
- Thresholds must not be rounded up.
- Test final composited foreground/background colors.
- Label APCA as an experimental supplemental metric, including version and
  signed `Lc` result.
- Never label APCA as "WCAG 3 compliance."
- Do not mark palettes globally compliant; report specific tested pairings and
  use cases.

### COLOR-007: Dynamic role model

- Store scales as an ordered dynamic collection with stable IDs.
- Multiple scales assigned to one role must survive preview, export, style
  creation, and frame generation.
- Usage proportions must validate to exactly 100% or clearly use an automatic
  normalization mode.
- The user must be able to reset multi-select state.

### COLOR-008: Export and styles

- Preserve the established export and Figma-style naming maps. Never reuse an
  existing suffix for a different logical step; any unified replacement must be
  explicitly versioned and migrated.
- Export steps 1-10 use `50` through `900`; steps 11/12 use `950`/`1000`.
- Figma-style steps 1-10 use `50` through `900`; steps 11/12 use
  `1000`/`1100`.
- Define collision behavior: update local style, create renamed copy, skip, or
  cancel.
- Never modify remote styles.
- Report partial success and skipped styles.
- Prefer variables for aliases and light/dark semantic modes where supported.

### COLOR-009: Figma mutations

- Invalid hex input must produce a validation error, never black.
- Fill/stroke operations must distinguish replace-all, replace-one, and apply
  style.
- Warn before removing style links or variable bindings.
- Handle `figma.mixed` and report unsupported selected nodes.

## 9. Grid-System Requirements

### GRID-001: Preset classification

Every preset must be one of:

- Historical reconstruction
- Historically informed construction
- Modern named system
- Teul modern adaptation
- User-created

Each bundled preset must include provenance and adaptation notes. Existing
unsourced "classic Swiss" presets must be relabeled Swiss-inspired until they
have artifact-level evidence.

### GRID-002: Construction modes

Teul must support distinct construction modes:

| Mode                 | Required behavior                                                                  |
| -------------------- | ---------------------------------------------------------------------------------- |
| Responsive stretch   | Fixed pixel margins/gutters per target frame or breakpoint; section size stretches |
| Proportional         | Relative inputs resolve independently against each target frame                    |
| Fixed                | Section size, offset, and count remain fixed                                       |
| Typographic baseline | Horizontal rhythm derived from leading; never automatically scaled                 |
| Modular              | Columns and rows derived from content and baseline rhythm                          |
| Native approximation | Explicitly documents geometry Figma cannot represent directly                      |

### GRID-003: Arbitrary dimensions

- Apply calculations from each target node's current width and height.
- Do not use hard-coded fallback dimensions when applying to a selection.
- Support portrait, landscape, square, 16:9, 4:3, social, presentation, print-like,
  component, and arbitrary frames.
- Use available space and constraints, not aspect-ratio labels alone, to decide
  whether a construction still fits.
- When a construction fails, recommend a smaller column count or changed
  measurements rather than silently producing unusable sections.

### GRID-004: Geometry validation

Before applying, validate:

- Finite positive frame dimensions and counts.
- Non-negative offsets, margins, gutters, and section sizes where required.
- Positive available width/height after margins and gutters.
- Minimum usable section width/height.
- Unsupported or ignored properties for the selected Figma alignment.
- Existing guides, linked styles, variables, rotation, hidden guides, and locks.

### GRID-005: Native Figma representation

- Model Figma `GRID` separately from row/column guides.
- Do not describe uniform square `GRID` as a baseline grid.
- Fixed row/column guides must provide `sectionSize`.
- `STRETCH` ignores `sectionSize`; `CENTER` ignores offset.
- Support Figma Auto count using an explicit serializable representation rather
  than JSON `Infinity`.
- Treat percentages as Teul inputs resolved to Figma pixel values per target.

### GRID-006: Baseline grids

- Derive the default baseline from body-text leading or a documented fraction.
- Keep baseline intervals fixed when frame dimensions change.
- Support frame-top and inset/top-margin anchors.
- Implement horizontal baseline guides using an appropriate row-guide
  construction or disclose a uniform-grid approximation.
- Display the relationship between leading, baseline interval, and modular rows.

### GRID-007: Complex constructions

- Support independent top, bottom, left, right, inside, and outside margins in
  Teul's domain model.
- Support grouped columns, unequal gutters, and nested subdivisions.
- When Figma cannot represent a construction as one native guide, generate
  multiple guides or mark it as a native approximation.
- Do not claim a wider center gutter or asymmetric margins when the emitted
  geometry is uniform.

### GRID-008: Selection behavior

- Revalidate selection immediately before mutation.
- Apply independently to every eligible selected node.
- Resolve relative geometry from each node's dimensions.
- Skip unsupported nodes and report applied/skipped/failed counts.
- Let users choose replace, append, or cancel when guides already exist.
- Clear must support the same multi-selection and result reporting rules.

### GRID-009: Custom grids and persistence

- Either ship a functional custom-grid editor or remove the claim.
- Validate imported files against a versioned schema before merging.
- Reject or quarantine malformed records.
- Define duplicate handling and import limits.
- Keep UI state and storage cache synchronized after every operation.
- Surface storage failures before showing success.

### GRID-010: Construction explanation

Preview and result views must show:

- Target dimensions and mode.
- Column/row count, margins, gutters, section sizes, baseline, and offset.
- Remaining/unused space and fit warnings.
- Provenance classification and adaptation notes.
- Native Figma representation and any approximation.

## 10. Messaging And Architecture Requirements

- Use one discriminated UI/backend message union.
- Validate untrusted/runtime payloads at the backend boundary.
- Use one canonical domain-grid-to-Figma-guide converter.
- Use one canonical color parser and explicit, compatibility-tested naming maps
  for each generated-output contract.
- Backend operations must return structured success, partial-success, or failure
  results.
- UI success messages must wait for backend confirmation.
- Remove router branches, components, types, dependencies, and configuration
  that have no active product path.

## 11. Edge-Case Matrix

| Area             | Required edge cases                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Selection        | Empty, stale, mixed types, unsupported node, component, instance, component set, locked, rotated, multi-select                      |
| Frame sizes      | Zero/negative, tiny, mobile 320px, tablet portrait/landscape, 4:3, 16:9, square, portrait social, large canvas                      |
| Grid math        | Margins consume frame, gutters consume sections, count Auto, fixed versus stretch, grouped/unequal geometry, existing guides/styles |
| Color input      | Invalid/short hex, alpha, out-of-gamut, near black/white, neutral chroma, Display P3 document, mixed paints                         |
| Scale generation | Duplicate rounded steps, non-monotonic output, inaccessible semantic pairs, source-anchor movement, light/dark parity               |
| Historical data  | Missing source, source disagreement, normalized spelling, transcription correction, out-of-range source value                       |
| Storage/import   | Invalid JSON, wrong version, partial record, huge file, duplicate IDs/names, quota failure, stale cache                             |
| Output           | Existing style collision, remote style, partial failure, dynamic role counts, export/profile labeling                               |

## 12. Success Metrics

- Zero silent fallback-to-black or fallback-to-800x600 paths.
- Every bundled dataset and preset has a provenance classification.
- All exact Radix values match the pinned package.
- Every generated scale reports its tested guarantees.
- Every grid application reports actual target dimensions and result counts.
- Grid property tests cover all bundled presets across the required frame matrix.
- No active product claim contradicts its implementation or source evidence.
- CI has zero lint warnings, supported Node versions, passing integrity/property/
  integration tests, and a successful production build.

## 13. Release Acceptance

Release is blocked unless:

1. Source/provenance integrity tests pass.
2. Grid apply/create/clear flows pass multi-size and multi-selection integration
   tests.
3. Generated color-scale invariants pass the complete bundled source corpus.
4. Exact Radix values pass pinned-package comparison.
5. Import validation rejects malformed data.
6. User-visible historical, accessibility, Radix, CMYK, and grid claims match this
   PRD.
7. Typecheck, lint, tests, dependency audit policy, and production build pass.
