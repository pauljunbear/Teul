# Teul

**Color gives work a voice. A grid gives it structure.**

<img width="2790" height="1704" alt="Teul color browser in Figma" src="https://github.com/user-attachments/assets/c113f18a-76b2-4af8-bda9-1a195b91df7c" />

Teul (틀) is the Korean word for _frame_, _mold_, or _pattern_—the structure
that shapes what comes next. Teul is a Figma plugin for building with color and
grids: explore historical palettes from Sanzo Wada and Patrick Syme, turn
colors into tested systems, and apply documented layout guides to real frames.

History is the source. Teul is the tool.

## What Teul Does

### Explore Historical Color Relationships

- **Sanzo Wada** — 159 normalized colors used across 348 combinations from a
  modern selection of the original 360-combination series.
- **Werner's Nomenclature of Colours** — Patrick Syme's 110-color 1821 second
  edition, adapted from Werner's nomenclature and independently sampled from
  the Getty Research Institute's public-domain scan.

The bundled RGB and hex values are documented digital approximations. Teul
does not present a screen color as an exact match for a printed recipe, painted
swatch, or historical pigment.

### Build Color Systems

- **Exact Radix Colors** selects an unmodified family from the pinned
  `@radix-ui/colors` 3.0.0 library.
- **Teul Generated** builds a 12-step light and dark system while preserving
  the selected source color and reporting what was tested.
- **WCAG-Constrained Tokens** creates semantic tokens only when every declared
  WCAG 2.2 color pairing passes.
- Export CSS variables, Tailwind configuration, JSON, optional Figma styles,
  native Figma color variables with light and dark modes, and visual reference
  frames.

Passing color-pair tests does not make an entire product accessible. Teul names
the guarantee it can prove and stops there.

The accessibility checker can read one opaque text/background pair from the
current Figma selection, including a bound color variable. It rejects mixed,
layered, transparent, gradient, image, video, or role-ambiguous selections
instead of estimating a rendered color.

### Apply Grids That Fit

Browse 65 documented presets spanning Swiss-inspired constructions,
historically informed editorial systems, modern product grids, and named
systems such as Material, Carbon, Bootstrap, and USWDS.

Teul resolves each grid against the selected frame. A preset fits, warns you,
or explains why it cannot be applied. Source-faithful reconstructions keep
their canonical dimensions instead of quietly stretching history to fit a
different canvas.

Build symmetric column, row, and uniform grids, or capture supported native
stretch grids from one selected frame. Teul refuses capture when Figma geometry
cannot round-trip through the saved model. Captured grid styles and bound
variables are retained: users can preserve available links or explicitly apply
the captured numeric values when moving between files. Saved grids move between
files through a versioned JSON format and live in Figma's plugin storage; v1
records migrate without changing their supported geometry.

<img width="3888" height="2382" alt="Teul color system generator in Figma" src="https://github.com/user-attachments/assets/e1b04881-c29b-4691-8c9e-7867724328ff" />

## Why Teul Exists

Most tools flatten the source. Historical palettes become loose hex codes.
Grid theory becomes a dropdown of magic numbers. Teul keeps source,
approximation, and generated output separate—then gives you practical ways to
use all three.

Know where the reference came from. Know what the tool changed. Make the work
your own.

## Install

1. Open Figma Desktop.
2. Go to **Plugins → Browse plugins in Community**.
3. Search for **Teul**.
4. Select **Install**.

## Quick Start

To build a color system:

1. Browse the Wada or Werner collection.
2. Choose a color or combination.
3. Select **System**.
4. Assign roles and generate.
5. Export the result or create it in Figma.

To apply a grid:

1. Select a supported frame, component, or instance.
2. Open the **Grids** tab.
3. Choose a preset.
4. Review the fit result and apply it.

## Development

Teul requires Node.js 22 or 24 and npm 10.9.8.

```bash
git clone https://github.com/pauljunbear/Teul.git
cd Teul
npm ci
npm run dev
```

Import `manifest.json` through **Plugins → Development → Import plugin from
manifest**.

Before committing:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run assert:artifacts
npm run check:ui-bundle
npm run test:production-ui
```

## Sources And Credits

**Sanzo Wada** — Modern Seigensha CMYK recipes converted to sRGB by
[dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations),
which credits [Dain M. Blodorn Kim's](https://sanzo-wada.dmbk.io/) original
digital compilation.

**Werner's Nomenclature of Colours** — Patrick Syme's 1821 second edition,
independently transcribed and sampled from the
[Getty Research Institute public-domain scan](https://archive.org/details/gri_c00033125012743312).

**Radix Colors** — Exact library data pinned to
[`@radix-ui/colors` 3.0.0](https://www.radix-ui.com/colors).

The complete source record, uncertainty notes, derivation methods, and grid
references live in the
[source and provenance ledger](docs/SOURCE_PROVENANCE.md).

## License And Data Rights

Teul's plugin code is MIT-licensed under [LICENSE](LICENSE). Bundled libraries,
source data, and third-party material retain their own terms. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[APCA_LICENSE.md](APCA_LICENSE.md), and
[the Werner derivation](docs/WERNER_DERIVATION.md).
