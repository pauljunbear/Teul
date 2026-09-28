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

| Command                    | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Build in watch mode                              |
| `npm run build`            | Create the production plugin bundle              |
| `npm run lint`             | Run ESLint with zero warnings allowed            |
| `npm run typecheck`        | Run TypeScript without emitting files            |
| `npm run test:run`         | Run the test suite once                          |
| `npm run test:coverage`    | Run tests with coverage thresholds               |
| `npm run assert:artifacts` | Verify production artifacts and licenses         |
| `npm run verify:wada`      | Compare Wada data with pinned upstream           |
| `npm run audit`            | Run the dependency security gate                 |
| `npm run test:scripts`     | Run the `node --test` suites in `scripts/`       |
| `npm run release-gate`     | Run the full local release gate, write a receipt |
| `npm run status`           | Regenerate `STATUS.md` from repository evidence  |

After building, reload Teul in Figma through **Plugins → Development → Teul**.
Re-import `manifest.json` after manifest changes.

### Toolchain

`.nvmrc` pins the Node 22 line: run `nvm use` (or `fnm use`) before `npm ci`,
or otherwise put a Node 22 binary first on `PATH` and confirm with
`node --version`. `.npmrc` sets `engine-strict=true`, so npm refuses an
unsupported Node or npm instead of installing anyway; `package.json#engines`
names the supported ranges. The release gate also runs on Node 24: switch
runtimes (for example `nvm use 24`), run `npm ci`, and run the gate again.

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

| Work                                        | Primary files                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Historical color data                       | `src/colors.json`, `src/wernerColors.json`                                                                                       |
| Source metadata and claims                  | `src/lib/sourceProvenance.ts`, `docs/SOURCE_PROVENANCE.md`                                                                       |
| Color generation and validation             | `src/lib/colorScale.ts`, `src/backend/colorSystemGeneration.ts`                                                                  |
| Radix library data                          | `src/lib/radixColors.ts`                                                                                                         |
| Accessibility and color-vision simulation   | `src/lib/accessibility.ts`, `src/lib/colorBlindness.ts`                                                                          |
| Grid presets and fit rules                  | `src/lib/gridPresets.ts`, `src/lib/researchGridPresets.ts`                                                                       |
| Figma grid conversion and application       | `src/lib/figmaGrids.ts`, `src/backend/gridOperations.ts`                                                                         |
| Saved grids                                 | `src/lib/gridStorage.ts`, `src/lib/gridStorageBridge.ts`                                                                         |
| Palette analysis, tentative roles           | `src/lib/colorSystemPaletteAnalysisV3.ts`, `src/lib/colorSystemGenericIntentPolicyV2.ts`                                         |
| Secondary strategy planning                 | `src/lib/colorSystemSecondaryStrategyV3.ts`, `src/lib/colorSystemSourceCompilerV2.ts`, `src/lib/colorSystemSecondaryEngineV2.ts` |
| Semantic composition and data visualization | `src/lib/colorSystemApplicationComposerV2.ts`, `src/lib/colorSystemApplicationBlueprintV2.ts`                                    |
| Brand surfaces and print advisories         | `src/lib/colorSystemSurfaceAdvisoriesV3.ts`, `docs/SURFACE_ADVISORIES_V3.md`                                                     |
| Local release gate and receipts             | `scripts/release-gate.mjs`, `docs/evidence/gates/`, `STATUS.md`                                                                  |

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
- Do not add GitHub Actions workflows or any other hosted CI. Verification is
  local: `npm run release-gate` with committed receipts.

## Release Gate

There is no hosted CI on this repository; verification is local. The gate is
`npm run release-gate`, run once on Node 22 and once on Node 24. It runs, in
order: dependency audit, lint, typecheck, coverage, production build, UI bundle
budget, production UI smoke test, dead-export report, Wada and color-foundation
verification, artifact assertions, generic sanitization, then the candidate
build with its budget, smoke, and artifact checks, and the generic source
benchmark. It stops at the first failure and writes a receipt (`receipt.json`
and `receipt.md`) under `docs/evidence/gates/<UTC timestamp>-<short sha>/` with
Node and npm versions, commit, per-step status and duration, and the sizes and
SHA-256 digests of `dist/code.js`, `dist/ui.html`,
`figma-candidate/dist/code.js`, and `figma-candidate/dist/ui.html`. Commit the
receipts; `npm run status` summarises the newest one in `STATUS.md`.
`npm run release-gate -- --dry-run` lists the steps without running them.
Paul Jun, as repository owner, owns the color-foundations re-review recorded in
`docs/color-foundations-manifest.json` (`reviewOwner`, `reviewBy`); when it is
due, re-verify the nine pinned sources against their URLs and bump `reviewedAt`
and `reviewBy` (at most six months later) in the same commit, or the gate fails
closed.

Record runtime-only Figma checks in `docs/RELEASE_ACCEPTANCE_2026-07-12.md` or
its successor.

The shipping line is `main` on the owner’s private repository (moved there on 2026-09-08). The
public `github.com/pauljunbear/Teul` is the Community-facing mirror; it is fast-forwarded from the
shipping line when the owner publishes a release.
