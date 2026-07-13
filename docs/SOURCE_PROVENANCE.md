# Teul Source And Provenance Ledger

Status: Current automated and manual release evidence
Date: 2026-07-12

This ledger records what Teul can currently prove about its source material.
It is intentionally stricter than the product's previous wording.
Automated results below are supplemented by the manual Figma checks recorded in
`docs/RELEASE_ACCEPTANCE_2026-07-12.md`.

## 1. Sanzo Wada

### Primary and publisher sources

- National Diet Library/Wikimedia Commons scans:
  - https://commons.wikimedia.org/wiki/Category:%E9%85%8D%E8%89%B2%E7%B7%8F%E9%91%91
  - https://ndlsearch.ndl.go.jp/books/R100000002-I000001085468
- Seigensha modern edition:
  - https://en.seigensha.com/books/978-4-86152-247-5/

The original A-series contains **360 combinations**: 120 two-color, 120
three-color, and 120 four-color cards. The modern Seigensha edition is a
**348-combination selection** constructed from 159 normalized colors.
Primary A-series numbering restarts by palette size:

| Original series | Palette size | Original numbers | Included in modern edition | Modern flattened IDs |
| --------------- | -----------: | ---------------: | -------------------------: | -------------------: |
| A.I-A.IV        |            2 |            1-120 |                      1-120 |                1-120 |
| A.V-A.VIII      |            3 |            1-120 |                      1-120 |              121-240 |
| A.IX-A.XII      |            4 |            1-120 |                      1-108 |              241-348 |

The modern corpus omits original A.XII four-color Nos. 109-120. This omission
is a structural comparison, not a quoted publisher claim: the public-domain
A.XII scan contains cards through No. 120, while the pinned modern corpus ends
its four-color sequence at original No. 108. The omitted cards appear on PDF
pages 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, and 62 of the A.XII scan.
The public-domain A.IV and A.VIII scans likewise show two- and three-color No.
120 on PDF page 62, establishing all three original 120-card sequences.

### Bundled dataset

`src/colors.json` is JSON-equivalent to:

- Repository: https://github.com/mattdesl/dictionary-of-colour-combinations
- Current reviewed head: `c142bd0bc8049ea48db4da5eb397981f047e8ef4`
- Dataset path: `colors.json`
- License: MIT
- Original digital compilation credited by the upstream project: Dain M.
  Blodorn Kim (https://sanzo-wada.dmbk.io/)

That project documents the following conversion:

- Input CMYK: modern Seigensha recipes
- CMYK profile: U.S. Web Coated (SWOP) v2
- RGB profile: sRGB IEC61966-2.1
- Rendering intent: relative colorimetric
- Black-point compensation: enabled
- Derived fields: RGB, hex, and D50 Lab

The source project explicitly states that the conversion is not an exact match
to the printed book.

The local machine-readable comparison, reviewed name entries, unresolved
exceptions, upstream commit, and semantic hash are stored in
`src/wadaSourceAudit.json`. Run the opt-in network verification with:

```sh
npm run verify:wada
```

Normal tests use the pinned semantic hash and do not require network access.

### Local integrity findings

- 159 colors.
- 348 unique combination IDs.
- Distribution: 120 duo, 120 trio, 108 quad combinations.
- Local JSON is semantically identical to the reviewed upstream JSON.
- The current size of Dain M. Blodorn Kim's separate digital presentation is
  not used as a source-integrity claim; it is a credited predecessor whose
  contents can change independently of Teul's pinned upstream commit.
- Bundled names are modern upstream transcriptions and are not classified
  wholesale as verified primary-source text. Individually reviewed spellings
  and possible normalizations are recorded in `src/wadaSourceAudit.json`.
- The prior audit hypothesis that `Vandar Poel's Blue` should be rewritten as
  `Vander Poel's Blue` is not supported by the reviewed primary cards. A.I No. 5
  (PDF page 11) and A.XII No. 103 (PDF page 28) both print `Vandar Poel's Blue`,
  matching the bundle. `Vanderpoel's Blue` is separately recorded as an
  external reference spelling; neither variant is silently substituted.
- `Dull Violet Black` contains bundled CMYK `[95, 106, 38, 50]`. Magenta 106
  remains **unresolved** and must not be clamped or called publisher-verified
  until checked against the licensed Seigensha edition.

### Required product wording

Use:

> Digital sRGB approximation based on Seigensha CMYK, converted with U.S. Web
> Coated (SWOP) v2 to sRGB using relative colorimetric intent and black-point
> compensation.

Also disclose that this is the modern 348-of-360 selection and that names are
modern upstream transcriptions unless an individual ledger entry records a
primary-card review.

Do not use:

- Exact Wada hex
- Historically accurate RGB
- 348 Wada colors
- A claim that all bundled names are exact primary-source transcriptions

## 2. Werner's Nomenclature Of Colours

### Primary sources

- Smithsonian Libraries canonical public-domain 1821 second-edition scan:
  - https://library.si.edu/digital-library/book/wernersnomencla00wern
  - https://doi.org/10.5479/sla.131151.39088013479605
- Getty Research Institute public-domain 1821 scan and sampling master:
  - https://archive.org/details/gri_c00033125012743312
- Biodiversity Heritage Library public-domain record:
  - https://www.biodiversitylibrary.org/item/304442
- 1814 first-edition comparison:
  - https://darwin-online.org.uk/converted/pdf/1814_Syme_A935.pdf

The familiar 110-color collection is Patrick Syme's 1821 second edition,
adapted from Abraham Gottlob Werner's nomenclature. The 1814 first edition
contains 108 colors, and the nature references are principally Syme's
contribution.

### Bundled dataset findings

- 110 unique IDs, names, and hex values.
- Names, groups, nature references, characteristic markers, and component
  descriptions were independently reviewed against the public-domain scan.
- The previously abridged `Lemon Yellow` description is restored.
- Confirmed table and component-text transcription errors are corrected against
  the Getty scan and cross-checked with the Smithsonian copy.
- Printed source inconsistencies and display normalizations are recorded in
  `scripts/werner-sampling/transcription-audit.json`.
- Modern-only aliases and inferred related-color relationships are removed.
- Every Getty source plate and the complete JP2 archive are pinned by SHA-256.
- Every color ID has a reviewed sample coordinate.
- Hex values are the median RGB value of a 100 by 100 pixel square inside each
  painted swatch, with no resize, white balance, denoise, sharpening, or paper
  correction.
- The generator and complete method are documented in
  `scripts/werner-sampling/` and `docs/WERNER_DERIVATION.md`.
- The dataset change is recorded in `docs/DATA_CHANGELOG.md`.

### Required model

The application model stores independently reviewed source text separately
from normalized display text. Every difference must be produced by the
machine-readable transcription audit and covered by tests. Source prose
preserves the book's component relationships and printed inconsistencies
without creating an undocumented relationship graph.

### Required product wording

Use:

> Reproducible median sample from Getty's aged scan of Patrick Syme's 1821
> painted swatch.

Do not use:

- Exact Werner hex
- Device-independent Werner color

## 3. Radix Colors

### Authoritative source

- Package: `@radix-ui/colors`
- Reviewed current version: `3.0.0`
- License: MIT
- Documentation:
  - https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale

Radix assigns semantic use cases to steps 1-12. Its documented text-step
guarantees are APCA guarantees over same-scale step 2, not WCAG 2.2 conformance
guarantees.

### Local integrity findings

- Teul bundles 31 complete light/dark solid-color families, 62 scales, and 744
  values.
- `RADIX_COLORS_VERSION` pins Exact Radix Colors data to
  `@radix-ui/colors@3.0.0`.
- The sorted bundled solid-scale payload exactly matches the reviewed package
  payload and its pinned SHA-256 integrity fixture.
- Current focused Radix integrity tests pass.

Exact Radix Colors is current exact-library data for the pinned package version.
This does not transfer Radix's APCA guidance to generated Teul scales.

## 4. Color Science And Accessibility

### Standards and guidance

- WCAG 2.2:
  - https://www.w3.org/TR/WCAG22/
  - https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- APCA 0.1.9 canonical implementation and integration limits:
  - https://github.com/Myndex/apca-w3/tree/da50930ba8cf8a5ef85d1b269aeba3d83ad91a5a
  - https://git.apcacontrast.com/documentation/minimum_compliance.html
- Machado, Oliveira, and Fernandes CVD model and matrix supplement:
  - https://pubmed.ncbi.nlm.nih.gov/19834201/
  - https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- National Eye Institute color-vision-deficiency overview:
  - https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/color-blindness
- CSS Color 4 gamut mapping:
  - https://www.w3.org/TR/css-color-4/#gamut-mapping
- CSS Color 5 device CMYK:
  - https://www.w3.org/TR/css-color-5/#device-cmyk
- ICC profiles:
  - https://www.color.org/iccprofile.xalter

### Current conclusions

- WCAG 2.2 is the current conformance basis.
- Teul uses WCAG 2.2's corrected sRGB linearization breakpoint, `0.04045`.
- Teul's APCA calculation is an exact TypeScript port of `apca-w3` 0.1.9,
  base algorithm 0.0.98G-4g. Canonical polarity is preserved: dark text on a
  light background is positive and light text on a dark background is
  negative. Reference vectors include black on white at
  `Lc +106.04067321268862` and white on black at `Lc -107.88473318309848`.
- APCA is experimental and supplemental, not a WCAG conformance method. Its
  Teul use is restricted to self-illuminated sRGB web content under the Limited
  W3 License reproduced in `APCA_LICENSE.md`.
- Machado simulation uses the authors' complete protan, deutan, and tritan
  matrices for both full-severity dichromacy and anomalous trichromacy at
  severity increments of 0.1. Other values interpolate only between the
  nearest two matrices, following the supplement's documented method.
- Teul's tested-color APCA reference preview uses Arial/Helvetica 400, lists all
  required basic Lc levels and warnings, preserves signed polarity, and links
  the canonical guidance, integration limits, and discussion forum.
- CVD prevalence text is approximate and explicitly sex-specific where the
  source data are sex-specific; it is not generalized into a population-wide
  normal-vision percentage. Simulation labels describe algorithmic previews,
  not an individual's literal perception.
- OKLCH is useful for perceptual construction but does not guarantee contrast.
- RGB channel clipping is not an acceptable primary gamut-mapping strategy.
- CMYK conversion requires a named profile and print condition.

### Local generated-scale findings

The current automated matrix covers all 269 bundled Wada and Werner source
colors in light and dark modes, for 538 generated outputs:

- 536 outputs pass complete validation and return a successful build result.
- Two outputs return explicit failures: Wada `White` in light mode and Wada
  `White` in dark mode.
- All 538 candidates preserve the source anchor and report finite, in-gamut
  sRGB output.
- The two rejected White outputs contain duplicate adjacent steps and fail
  strict lightness and relative-luminance monotonicity.
- Each output reports the exact tested WCAG pairings. No general accessibility
  guarantee is inferred from these checks.

## 5. Swiss And Modern Grid Systems

### Sources

- Niggli, _Grid Systems in Graphic Design_:
  - https://www.niggli.ch/produkt/grid-systems-in-graphic-design/
- Museum fur Gestaltung:
  - https://museum-gestaltung.ch/en/article/teaching-activities-josef-muller-brockmann
- Figma layout-guide behavior:
  - https://help.figma.com/hc/en-us/articles/360040450513-Create-layout-grids-with-grids-columns-and-rows
- Figma Plugin API `LayoutGrid`:
  - https://developers.figma.com/docs/plugins/api/LayoutGrid/
- Material layout:
  - https://m2.material.io/design/layout/responsive-layout-grid.html
  - https://m2.material.io/page-data/Guidelines/6279712644268032.json
- Carbon 2x Grid:
  - https://carbondesignsystem.com/elements/2x-grid/overview/
  - https://carbondesignsystem.com/elements/2x-grid/usage/
- Karl Gerstner, _Designing Programmes_:
  - https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/Gerstner_DesigningProgrammes.pdf
- The Vignelli Canon:
  - https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf
- National Park Service Unigrid standards:
  - https://www.npshistory.com/brochures/unigrid.pdf
- Cooper Hewitt, "Gridnik":
  - https://www.cooperhewitt.org/2013/11/26/gridnik/
- Bootstrap grid:
  - https://getbootstrap.com/docs/5.3/layout/grid/
  - https://getbootstrap.com/docs/5.3/layout/containers/
- U.S. Web Design System layout grid:
  - https://designsystem.digital.gov/utilities/layout-grid/
  - https://designsystem.digital.gov/documentation/settings/
- Apple Human Interface Guidelines, layout:
  - https://developer.apple.com/design/human-interface-guidelines/layout
- Microsoft Fluent 2 layout:
  - https://fluent2.microsoft.design/layout

Muller-Brockmann's grid is a construction method derived from format,
typography, content, and production constraints. It is not a fixed universal
preset collection.

### Local preset findings

- Teul contains 65 presets across seven categories.
- The 34 original presets retain conservative `teul-modern-adaptation`
  provenance. The 31 researched additions carry direct source URLs, evidence
  strength, and explicit reconstruction or adaptation notes.
- User-visible historical-category claims use **Swiss-Inspired**, not Classic
  Swiss.
- Presets backed by native Figma square `GRID` use **Uniform Grid**, not
  Baseline.
- All 65 bundled presets declare preview dimensions and an explicit application
  mode. Artifact-level historical reconstructions and Apple tvOS canvases are
  canonical-only. Material 2, Carbon, Bootstrap, and USWDS presets enforce
  source-backed responsive width ranges while leaving height unconstrained;
  centered maximum-width bodies are recalculated as frames widen. Historically
  informed and Teul-adaptation presets retain fixed measurements unless
  explicitly classified as scalable. Saved copies preserve this contract.
- Figma does not retain Teul percentage units; percentages resolve to pixels at
  application time.
- Fit analysis runs the same production resolver used by backend application,
  after Figma-bound measurements are quantized to integer pixels.
- The current required matrix covers 65 presets across 12 frame sizes, or 780
  preset/frame cases: 555 fit, 22 warning, and 203 fail.
- All 203 failed cases return actionable recommendations rather than an
  applicable invalid grid.

### Required product wording

Use classification labels such as:

- Historical reconstruction
- Historically informed
- Material 2
- Carbon 2x
- Teul modern adaptation
- Swiss-inspired

Do not call an unsourced preset "foundational Muller-Brockmann."

## 6. Figma Platform Facts

- Figma renamed the UI feature to **layout guides** in May 2025; the Plugin API
  still uses `LayoutGrid` and `layoutGrids`.
- Layout guides are distinct from auto-layout grid flow.
- Uniform `GRID` is square.
- Row/column guides support fixed and stretch modes.
- `count: Infinity` represents Auto but cannot be safely serialized directly in
  JSON.
- API geometry is pixel-based; percentages are a Teul abstraction.
- Stretch guides respond to frame resizing; fixed and uniform guides retain
  pixel measurements.
- Layout guides do not lay out children.
- Figma Design files can use sRGB or Display P3:
  - https://help.figma.com/hc/en-us/articles/360039825114-Manage-color-profiles-in-design-files

## 7. Provenance Work Remaining

- Verify the Wada `Dull Violet Black` CMYK exception against the licensed
  publisher edition; it remains unresolved in the source audit.
- Expand stable Wada original-card identifiers and primary-scan page links
  beyond the currently reviewed omission and name entries.
- Add artifact-level evidence for any preset marketed as a historical
  reconstruction.
