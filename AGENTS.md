# AGENTS.md — Teul Development Guide

## Product

Teul (틀) is a Figma plugin for historical color, tested color systems, and
documented layout grids.

- **Sanzo Wada:** 159 normalized colors used across 348 combinations from a
  modern selection of the original 360-combination series.
- **Werner's Nomenclature:** Patrick Syme's 110-color 1821 second edition,
  independently transcribed and sampled from a public-domain Getty scan.
- **Color systems:** Exact Radix Colors, source-preserving Teul Generated
  scales, and blocking WCAG-constrained semantic tokens.
- **Layout grids:** 65 presets with explicit provenance, fit rules, and
  application modes.

Do not describe historical digital approximations, generated scales, or modern
grid adaptations as exact. The source of truth for public claims is
`docs/SOURCE_PROVENANCE.md`.

## Commands

| Command                    | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `npm run dev`              | Build in watch mode                      |
| `npm run build`            | Create the production plugin bundle      |
| `npm run lint`             | Run ESLint with zero warnings allowed    |
| `npm run typecheck`        | Run TypeScript without emitting files    |
| `npm run test:run`         | Run the test suite once                  |
| `npm run test:coverage`    | Run tests with coverage thresholds       |
| `npm run assert:artifacts` | Verify production artifacts and licenses |
| `npm run verify:wada`      | Compare Wada data with pinned upstream   |
| `npm run audit`            | Run the dependency security gate         |

After building, reload Teul in Figma through **Plugins → Development → Teul**.
Re-import `manifest.json` after manifest changes.

## Architecture

Teul uses Figma's two-process plugin model:

- `src/code.ts` runs in the Figma plugin sandbox.
- `src/ui.tsx` runs the React interface in an iframe.
- `src/types/messages.ts` defines the shared message contract.
- `src/lib/messageValidation.ts` validates messages at runtime.
- `src/backend/` contains Figma document mutations.
- `src/lib/` contains color, grid, storage, export, and provenance logic.

The UI requests work through `parent.postMessage()`. The backend receives it
through `figma.ui.onmessage`. Keep message types and runtime validation aligned.

## Important Files

| Work                                      | Primary files                                                   |
| ----------------------------------------- | --------------------------------------------------------------- |
| Historical color data                     | `src/colors.json`, `src/wernerColors.json`                      |
| Source metadata and claims                | `src/lib/sourceProvenance.ts`, `docs/SOURCE_PROVENANCE.md`      |
| Color generation and validation           | `src/lib/colorScale.ts`, `src/backend/colorSystemGeneration.ts` |
| Radix library data                        | `src/lib/radixColors.ts`                                        |
| Accessibility and color-vision simulation | `src/lib/accessibility.ts`, `src/lib/colorBlindness.ts`         |
| Grid presets and fit rules                | `src/lib/gridPresets.ts`, `src/lib/researchGridPresets.ts`      |
| Figma grid conversion and application     | `src/lib/figmaGrids.ts`, `src/backend/gridOperations.ts`        |
| Saved grids                               | `src/lib/gridStorage.ts`, `src/lib/gridStorageBridge.ts`        |

## Working Rules

- Await `figma.loadFontAsync()` before creating text nodes.
- Remember that Figma RGB channels use values from 0 to 1.
- Validate every UI message before routing it.
- Resolve percentage grids against each target's current dimensions.
- Preflight every eligible target before mutating the document.
- Keep user-visible success states tied to confirmed backend results.
- Store saved grids through `figma.clientStorage`, not iframe `localStorage`.
- Do not change source datasets without provenance, a changelog entry, and an
  integrity test.
- Preserve unrelated work in a dirty worktree. Stage explicit files.

## Release Gate

Run lint, typecheck, tests, coverage, build, artifact assertions, and dependency
audit before release. Record runtime-only Figma checks in
`docs/RELEASE_ACCEPTANCE_2026-07-12.md` or its successor.
