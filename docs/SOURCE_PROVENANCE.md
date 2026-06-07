# Teul Source And Provenance Ledger

Status: Current automated evidence; manual Figma acceptance remains
Date: 2026-06-06

This ledger records what Teul can currently prove about its source material.
It is intentionally stricter than the product's previous wording.
Automated results below do not record manual Figma acceptance as passed.

## 1. Sanzo Wada

### Primary and publisher sources

- National Diet Library/Wikimedia Commons scans:
  - https://commons.wikimedia.org/wiki/Category:%E9%85%8D%E8%89%B2%E7%B7%8F%E9%91%91
  - https://ndlsearch.ndl.go.jp/books/R100000002-I000001085468
- Seigensha modern edition:
  - https://en.seigensha.com/books/978-4-86152-247-5/

The modern corpus contains 348 combinations constructed from 159 normalized
colors. Primary A-series numbering restarts by palette size:

| Original series | Palette size | Original numbers | Modern flattened IDs |
| --------------- | -----------: | ---------------: | -------------------: |
| A.I-A.IV        |            2 |            1-120 |                1-120 |
| A.V-A.VIII      |            3 |            1-120 |              121-240 |
| A.IX-A.XII      |            4 |            1-108 |              241-348 |

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

### Local integrity findings

- 159 colors.
- 348 unique combination IDs.
- Distribution: 120 duo, 120 trio, 108 quad combinations.
- Local JSON is semantically identical to the reviewed upstream JSON.
- Names, CMYK, and combinations differ from the currently cited Dain Blodorn Kim
  digital edition because the latter contains 157 colors and uses a simple CMYK
  conversion.
- `Dull Violet Black` contains source CMYK `[95, 106, 38, 50]`. Magenta is over
  100 and must remain a documented source exception until verified against the
  publisher edition.

### Required product wording

Use:

> Digital sRGB approximation based on Seigensha CMYK, converted with U.S. Web
> Coated (SWOP) v2 to sRGB using relative colorimetric intent and black-point
> compensation.

Do not use:

- Exact Wada hex
- Historically accurate RGB
- 348 Wada colors

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
- `RADIX_COLORS_VERSION` pins Exact Radix Match data to
  `@radix-ui/colors@3.0.0`.
- The sorted bundled solid-scale payload exactly matches the reviewed package
  payload and its pinned SHA-256 integrity fixture.
- Current focused Radix integrity tests pass.

Exact Radix Match is current exact-library data for the pinned package version.
This does not transfer Radix's APCA guidance to generated Teul scales.

## 4. Color Science And Accessibility

### Standards and guidance

- WCAG 2.2:
  - https://www.w3.org/TR/WCAG22/
- WCAG 3 status:
  - https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/
- CSS Color 4 gamut mapping:
  - https://www.w3.org/TR/css-color-4/#gamut-mapping
- CSS Color 5 device CMYK:
  - https://www.w3.org/TR/css-color-5/#device-cmyk
- ICC profiles:
  - https://www.color.org/iccprofile.xalter

### Current conclusions

- WCAG 2.2 is the current conformance basis.
- WCAG 3 is an incomplete draft; its final contrast algorithm is unresolved.
- APCA may be shown only as an experimental supplemental metric.
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
  - https://m2.material.io/design/layout/understanding-layout.html
- Carbon 2x Grid:
  - https://carbondesignsystem.com/elements/2x-grid/overview/

Muller-Brockmann's grid is a construction method derived from format,
typography, content, and production constraints. It is not a fixed universal
preset collection.

### Local preset findings

- Teul contains 34 presets across seven categories.
- Every bundled preset carries conservative `teul-modern-adaptation`
  provenance and adaptation notes. None currently has artifact-level evidence
  for classification as a historical reconstruction.
- User-visible historical-category claims use **Swiss-Inspired**, not Classic
  Swiss.
- Presets backed by native Figma square `GRID` use **Uniform Grid**, not
  Baseline.
- Figma does not retain Teul percentage units; percentages resolve to pixels at
  application time.
- The current required matrix covers 34 presets across 12 frame sizes, or 408
  preset/frame cases: 375 fit, 14 warning, and 19 fail.
- All 19 failed cases return actionable recommendations rather than an
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

- Verify the Wada `Dull Violet Black` CMYK exception against the publisher
  edition.
- Create stable Wada original-card identifiers and primary-scan page links.
- Add artifact-level evidence for any preset marketed as a historical
  reconstruction.
