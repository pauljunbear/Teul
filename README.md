# Teul

**Timeless design foundations.**

<img width="600" alt="Color system output showing light and dark mode palettes with semantic usage guides" src="https://github.com/user-attachments/assets/5e5d8bfb-141c-4cb9-8ba2-0a6c9d7c41cc" />

## What is Teul?

**틀 (Teul)** is the Korean word for *frame*, *mold*, or *pattern*—a foundational structure that shapes what comes next. In Taekwondo, the forms are called *Tul*. In design, it's the framework that gives your work structure.

Teul brings together three worlds:

- **Sanzo Wada's color theory** — 348 colors and 159 combinations from 1930s Japan, refined through decades of use by textile designers and artists
- **Werner's Nomenclature of Colours** — 110 colors from 1814, each grounded in observations from nature's animal, vegetable, and mineral kingdoms  
- **Radix color scales** — Modern, accessible 12-step color systems designed for digital interfaces

The result: historic color wisdom, made practical for modern design. Pick colors that have stood the test of time, then generate complete, accessible color systems ready for production.

<img width="800" alt="Complete color system with semantic usage guide, full scales, and color combinations" src="https://github.com/user-attachments/assets/your-new-screenshot-id" />

## Features

### 🎨 Historic Color Palettes

Browse two carefully digitized color collections:

**Sanzo Wada** — From *A Dictionary of Color Combinations* (配色辞典, 1934). These aren't algorithm-generated palettes—they're curated combinations from a designer who spent his career studying color relationships.

**Werner's Nomenclature** — Each of the 110 colors includes real-world examples: "the breast of the black-headed Gull," "the back of the Christmas Rose," "Carrara Marble." Colors grounded in observation, not abstraction.

### ⚡ Color System Generator

Turn any palette into a complete design system:

- **12-step scales** for each color role (primary, secondary, tertiary, accent, neutral)
- **Semantic tokens** — backgrounds, borders, interactive states, text colors
- **Light and dark modes** generated automatically
- **Usage proportions** — guidance on how to balance your palette
- **Export options** — CSS variables, Tailwind config, JSON

### 📐 Swiss-Style Grids

Classic grid systems inspired by Josef Müller-Brockmann:

- 4, 6, 8, and 12-column presets
- Modular grids with rows and columns
- Baseline grids for typography
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

```bash
git clone https://github.com/pauljunbear/Teul.git
cd Teul
npm install
npm run dev
```

Import in Figma: **Plugins → Development → Import plugin from manifest**

## Credits

### Color Data

**Sanzo Wada** — *A Dictionary of Color Combinations* (1934), digitized by [Dain M. Blodorn Kim](https://sanzo-wada.dmbk.io/).

**Werner's Nomenclature of Colours** — Patrick Syme's 1814 guide, digitized by [Nicholas Rougeux](https://www.c82.net/werner/).

### Color System Generation

**Radix UI Colors** — Accessible 12-step color scales from [Radix](https://www.radix-ui.com/colors).

## License

MIT
