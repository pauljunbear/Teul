# CLAUDE.md - Teul Development Guide

## Project Overview

Teul (틀) is a Figma plugin combining historic color palettes with modern design tools:

- **Sanzo Wada** - 348 colors, 159 combinations from 1930s Japan
- **Werner's Nomenclature** - 110 colors from 1814 with nature references
- **Radix Scales** - Modern 12-step accessible color systems
- **Swiss Grids** - Müller-Brockmann inspired grid presets

## Quick Reference

| Command                 | Description                 |
| ----------------------- | --------------------------- |
| `npm run dev`           | Development mode with watch |
| `npm run build`         | Production build            |
| `npm run lint`          | Run ESLint                  |
| `npm run lint:fix`      | Run ESLint with auto-fix    |
| `npm run format`        | Format with Prettier        |
| `npm run typecheck`     | TypeScript type checking    |
| `npm run test`          | Run tests in watch mode     |
| `npm run test:run`      | Run tests once              |
| `npm run test:coverage` | Run tests with coverage     |

**Figma reload:** After build, in Figma: Plugins → Development → Teul → Run

## Architecture

**Two-process model:**

- `src/code.ts` - Figma plugin backend (runs in Figma's sandbox)
- `src/ui.tsx` - React UI (runs in iframe)
- Communication via `parent.postMessage()` and `figma.ui.onmessage`

**Message types:** `apply-fill`, `apply-stroke`, `create-style`, `apply-grid`, `generate-color-system`, `create-palette`

## Project Structure

```
src/
├── code.ts              # Figma backend entry (1992 lines)
├── ui.tsx               # React UI entry (912 lines)
├── components/          # React components
│   ├── ui/              # Radix UI wrappers (button, dialog, etc.)
│   ├── ColorSystemModal.tsx  # Color system generator
│   ├── GridSystemTab.tsx     # Grid system UI
│   ├── WernerColorsTab.tsx   # Werner colors browser
│   └── ...
├── lib/
│   ├── utils.ts         # Color math (contrast, conversions, OKLCH)
│   ├── radixColors.ts   # 28 color families × 12 steps × 2 modes
│   ├── gridPresets.ts   # 20+ Swiss grid presets
│   ├── gridStorage.ts   # localStorage for custom grids
│   └── figmaGrids.ts    # Figma LayoutGrid API helpers
├── types/
│   └── grid.ts          # Grid TypeScript definitions
├── colors.json          # Sanzo Wada data (348 colors)
└── wernerColors.json    # Werner data (110 colors)
```

## Key Files by Task

| Task                | Files                                              |
| ------------------- | -------------------------------------------------- |
| Add color operation | `src/code.ts` (backend), `src/ui.tsx` (UI handler) |
| Add UI component    | `src/components/`, import in `ui.tsx`              |
| Modify color math   | `src/lib/utils.ts`                                 |
| Add grid preset     | `src/lib/gridPresets.ts`                           |
| Change Radix colors | `src/lib/radixColors.ts`                           |
| Modify color data   | `src/colors.json`, `src/wernerColors.json`         |

## Coding Conventions

### React Components

- Functional components with hooks
- Props interface defined inline or in types/
- Theme passed as `isDark` prop
- Inline styles for dynamic theming, Tailwind for utilities

### Message Handling

```typescript
// Backend (code.ts)
figma.ui.onmessage = async msg => {
  if (msg.type === 'apply-fill') {
    /* ... */
  }
};

// Frontend
parent.postMessage({ pluginMessage: { type: 'apply-fill', hex, name } }, '*');
```

### Color Functions (lib/utils.ts)

- `hexToRgb()`, `rgbToHex()` - Basic conversion
- `getContrastRatio()` - WCAG contrast
- `generateColorScale()` - 12-step scale from base color
- `clampToGamut()` - Ensure sRGB validity

## Tech Stack

- React 18.3.1, TypeScript 5.2.2
- Tailwind CSS 4.0.8
- Radix UI (dialog, dropdown, switch, tooltip)
- Framer Motion, Lucide icons
- Webpack 5.89.0

## Testing

- **Framework:** Vitest (fast, native TypeScript support)
- **Test location:** `src/lib/__tests__/`
- **Coverage:** Color math functions in `utils.ts` (72 tests)
- Run `npm run test:run` before committing

## Code Quality

- **ESLint:** Flat config in `eslint.config.js`
- **Prettier:** Config in `.prettierrc`
- **Pre-commit hooks:** Husky + lint-staged runs ESLint and Prettier on staged files
- **CI:** GitHub Actions runs lint, typecheck, tests, and build on every PR

## Things to Know

1. **Figma types** in `@figma/plugin-typings`
2. **Async font loading** required before creating text nodes
3. **Color data is read-only** - Don't modify JSON structure without understanding downstream effects

## Common Gotchas

- Always await font loading: `await figma.loadFontAsync({ family: "Inter", style: "Regular" })`
- Message types must match exactly between code.ts and ui.tsx
- Figma RGB values are 0-1, not 0-255
- localStorage is per-plugin, cleared on uninstall
