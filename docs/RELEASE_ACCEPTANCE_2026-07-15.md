# Teul release acceptance — 2026-07-15

This record covers the Studio Rail + Inspector production release. The source
of truth for public color and grid claims remains `docs/SOURCE_PROVENANCE.md`.

## What changed

- Replaced the top-level pill navigation with the approved persistent studio
  rail for Wada, Werner, Grids, Check, and Settings.
- Kept the color library visible while inspecting Wada or Werner colors.
- Added compact, exact value panels and direct fill, stroke, style, copy, and
  color-system actions.
- Exposed Wada's documented combinations in the inspector and retained the
  complete pairings workspace, palette export, gradients, and system creation.
- A Wada system now begins with the complete selected duo, trio, or quad. Adding
  another color is optional rather than a required setup step.
- Expanded the plugin window from 560 × 600 to 560 × 720 for the approved rail
  and inspector layout.
- Replaced a large runtime icon dependency with a small local SVG primitive.

## Automated release gate

The final release candidate passed:

- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:coverage`
- `npm run build`
- `npm run assert:artifacts`
- `npm run check:ui-bundle`
- `npm run test:production-ui`
- `npm run report:dead-code`
- `npm run verify:wada`
- `npm run audit`
- `git diff --check`

Results:

- 54 test files and 677 tests pass.
- Coverage is 80.80% statements, 73.94% branches, 74.35% functions, and 82.05%
  lines.
- The local-icon build produces a 363,609-byte UI artifact, leaving 45,991 bytes
  under the 409,600-byte product budget and 86,951 bytes under the 450,560-byte
  artifact ceiling.
- Every exported source symbol has a production reference.
- Production smoke confirms the bundled interface mounts and exchanges backend
  messages.
- The Wada corpus verifies 159 colors across 348 combinations against pinned
  upstream commit `c142bd0bc8049ea48db4da5eb397981f047e8ef4` and semantic
  digest `a24e7b0101c5f1e7eed104d84b27a7c9bba147017589302d78c2992c37c2d853`.
- The dependency audit reports zero vulnerabilities.
- Two untracked July 14 conflict copies (`ui 2.tsx` and
  `WernerColorsTab 2.tsx`) were confirmed byte-for-byte equal to their previous
  committed sources and removed. They were not part of the production graph.

## Browser acceptance

The production `dist/ui.html` was loaded at the plugin's exact 560 × 720 size.
The rail, four-column library, compact inspector, Corinthian Pink's 12-pairing
entry point, complete 12-set workspace, and selected-pairing system handoff were
verified. Console errors and warnings are checked again after the final build.

## Figma desktop boundary

The previous release's mutation, persistence, color-profile, generated-system,
grid, rollback, and saved-grid runtime checks remain recorded in
`docs/RELEASE_ACCEPTANCE_2026-07-14.md`. The new release changes UI orchestration
and window height, not backend mutation contracts or source datasets. Reload the
final bundle through **Plugins → Development → Teul** before manual use.
