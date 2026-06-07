# CLAUDE.md - Teul Development Guide

## Project Overview

Teul (틀) is a Figma plugin combining historic color palettes with modern design tools:

- **Sanzo Wada** - 159 normalized colors used across 348 combinations from 1930s Japan
- **Werner's Nomenclature** - Patrick Syme's 110-color 1821 second edition with nature references
- **Radix Scales** - Exact pinned Radix scales and validated Radix-inspired generation
- **Swiss Grids** - Swiss-inspired modern grid presets

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

**Message types:** Defined and runtime-validated in `src/types/messages.ts` and
`src/lib/messageValidation.ts`.

## Project Structure

```
src/
├── code.ts              # Figma backend entry and message router
├── ui.tsx               # React UI entry
├── components/          # React components
│   ├── ColorSystemModal.tsx  # Color system generator
│   ├── GridSystemTab.tsx     # Grid system UI
│   ├── WernerColorsTab.tsx   # Werner colors browser
│   └── ...
├── lib/
│   ├── utils.ts         # Color math (contrast, conversions, OKLCH)
│   ├── radixColors.ts   # 31 color families × 12 steps × 2 modes
│   ├── gridPresets.ts   # 20+ Swiss grid presets
│   ├── gridStorage.ts   # localStorage for custom grids
│   └── figmaGrids.ts    # Figma LayoutGrid API helpers
├── types/
│   └── grid.ts          # Grid TypeScript definitions
├── colors.json          # Sanzo Wada data (159 colors, 348 combinations)
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
- Inline styles for dynamic theming

### Message Handling

```typescript
// Backend (code.ts)
figma.ui.onmessage = async (msg: unknown) => {
  const validation = validateUIToPluginMessage(msg);
  if (!validation.valid) return;
  // Route the validated discriminated union.
};

// Frontend
parent.postMessage({ pluginMessage: { type: 'apply-fill', hex, name } }, '*');
```

### Color Functions (lib/utils.ts)

- `hexToRgb()`, `rgbToHex()` - Basic conversion
- `getContrastRatio()` - WCAG contrast
- `src/lib/colorScale.ts` - Validated, gamut-mapped 12-step scale generation

## Tech Stack

- React 18, TypeScript 5
- Webpack 5

## Testing

- **Framework:** Vitest (fast, native TypeScript support)
- **Test location:** `src/lib/__tests__/`
- **Coverage:** Color, grid, protocol, backend, and component regressions
- Run `npm run test:run` before committing

## Code Quality

- **ESLint:** Flat config in `eslint.config.mjs`
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
