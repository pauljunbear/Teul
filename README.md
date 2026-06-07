# Teul

**Timeless design foundations.**

<img width="2790" height="1704" alt="CleanShot 2025-12-22 at 18 38 29@2x" src="https://github.com/user-attachments/assets/c113f18a-76b2-4af8-bda9-1a195b91df7c" />

## What is Teul?

**틀 (Teul)** is the Korean word for _frame_, _mold_, or _pattern_—a foundational structure that shapes what comes next. In Taekwondo, the forms are called _Tul_. In design, it's the framework that gives your work structure.

Teul brings together three worlds:

- **Sanzo Wada's color combinations** — 159 normalized colors used across 348 combinations from 1930s Japan
- **Werner's Nomenclature of Colours** — Patrick Syme's 110-color 1821 second edition, adapted from Werner's nomenclature
- **Radix color scales** — Exact Match scales pinned to `@radix-ui/colors` 3.0.0, plus Radix-inspired generated scales

The result: historically sourced color relationships, clearly labeled digital approximations, and modern design tools. Generated systems should be validated for their intended color pairings and use cases.

<img width="3888" height="2382" alt="CleanShot 2025-12-22 at 18 35 31@2x" src="https://github.com/user-attachments/assets/e1b04881-c29b-4691-8c9e-7867724328ff" />

## Features

### 🎨 Historic Color Palettes

Browse two historically sourced color collections represented by digital approximations:

**Sanzo Wada** — 159 normalized colors used across 348 combinations. Bundled sRGB values are digital approximations based on modern Seigensha CMYK recipes.

**Werner's Nomenclature** — Patrick Syme's 1821 second edition adapts Werner's nomenclature into 110 colors with references from nature. Teul independently transcribes the public-domain edition and reproducibly samples the Getty scan's aged painted swatches.

### ⚡ Color System Generator

Turn any palette into a complete design system:

- **12-step scales** for each color role (primary, secondary, tertiary, accent, neutral)
- **Semantic tokens** — backgrounds, borders, interactive states, text colors
- **Light and dark modes** generated automatically
- **Usage proportions** — guidance on how to balance your palette
- **Export options** — CSS variables, Tailwind config, JSON

### 📐 Swiss-Style Grids

Swiss-inspired modern grid adaptations:

- 4, 6, 8, and 12-column presets
- Modular grids with rows and columns
- Uniform square Figma grids for spacing
- Save and reuse custom configurations

## Installation

1. Open Figma Desktop
2. Go to **Plugins → Browse plugins in Community**
3. Search "Teul"
4. Click Install

## Quick Start

**Generate a color system:**

1. Browse Wada or Werner colors
2. Find a combination you like
3. Click "System" to open the generator
4. Assign roles and generate
5. Export to your codebase or create Figma frames

**Apply a grid:**

1. Select a frame
2. Switch to Grids tab
3. Pick a preset
4. Apply

## Development

Requires Node.js 22 or 24 and npm 10.9.8.

```bash
git clone https://github.com/pauljunbear/Teul.git
cd Teul
npm ci
npm run dev
```

Import in Figma: **Plugins → Development → Import plugin from manifest**

## Credits

### Color Data

**Sanzo Wada** — Modern Seigensha CMYK recipes, converted to sRGB by [dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations), which credits [Dain M. Blodorn Kim's](https://sanzo-wada.dmbk.io/) original digital compilation.

**Werner's Nomenclature of Colours** — Patrick Syme's 1821 second edition, adapted from Werner's nomenclature; independently transcribed and sampled from the [Getty Research Institute public-domain scan](https://archive.org/details/gri_c00033125012743312).

### Color System Generation

**Radix UI Colors** — Exact Match data pinned to [`@radix-ui/colors` 3.0.0](https://www.radix-ui.com/colors).

## License And Data Rights

Teul's plugin code is MIT-licensed under [LICENSE](LICENSE). Bundled libraries,
source data, and third-party rights retain their own terms; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[the source and provenance ledger](docs/SOURCE_PROVENANCE.md). Werner's
independent derivation is documented in
[docs/WERNER_DERIVATION.md](docs/WERNER_DERIVATION.md), with source/display
text differences pinned in
[`scripts/werner-sampling/transcription-audit.json`](scripts/werner-sampling/transcription-audit.json).
