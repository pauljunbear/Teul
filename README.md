# Teul

**Design foundations, timeless.**

A Figma plugin for historic color palettes and Swiss-style grid systems.

<img width="300" alt="Color palette view" src="https://github.com/user-attachments/assets/5e5d8bfb-141c-4cb9-8ba2-0a6c9d7c41cc" />
<img width="300" alt="Combination detail view" src="https://github.com/user-attachments/assets/b6f0d328-c52a-471f-b009-663407724e89" />

## Features

### 🎨 Color Palettes

Two historic color collections, digitized and ready to use:

**Sanzo Wada** — 348 colors and 159 harmonious combinations from *A Dictionary of Color Combinations* (1934). These palettes have been trusted by textile designers, artists, and graphic designers for nearly a century.

**Werner's Nomenclature of Colours** — 110 colors from Patrick Syme's 1814 guide, originally created for naturalists. Each color includes examples from the animal, vegetable, and mineral kingdoms.

- Browse by hue family
- See which colors pair well together
- Apply colors directly to shapes, text, and frames
- Generate complete 12-step color systems
- Export as CSS variables, Tailwind config, or JSON

### 📐 Grid Systems

Classic Swiss-style grids inspired by Josef Müller-Brockmann:

- 4-column, 6-column, 8-column, and 12-column presets
- Modular grids with rows and columns
- Baseline grids for typography
- Save and reuse custom configurations

## Installation

1. Open Figma Desktop
2. Go to **Plugins → Browse plugins in Community**
3. Search "Teul"
4. Click Install

## Quick Start

**Apply a color:**
1. Select any shape or text
2. Open Teul
3. Click a color to see its combinations
4. Click "Apply Fill" or "Apply Stroke"

**Generate a color system:**
1. Find a color combination you like
2. Click the "System" button
3. Assign roles (primary, secondary, accent, neutral)
4. Generate organized frames with all color values

**Apply a grid:**
1. Select a frame
2. Switch to the Grids tab
3. Pick a preset from the library
4. Click "Apply Grid"

## Development

```bash
git clone https://github.com/pauljunbear/teul.git
cd teul
npm install
npm run dev
```

Import in Figma: **Plugins → Development → Import plugin from manifest**

## Credits

### Color Data

**Sanzo Wada** — *A Dictionary of Color Combinations* (配色辞典, 1934), digitized by [Dain M. Blodorn Kim](https://sanzo-wada.dmbk.io/).

**Werner's Nomenclature of Colours** — Patrick Syme's 1814 guide, digitized by [Nicholas Rougeux](https://www.c82.net/werner/).

### Color System Generation

**Radix UI Colors** — The color system generator builds on [Radix Colors](https://www.radix-ui.com/colors) for accessible, harmonious 12-step scales.

## License

MIT
