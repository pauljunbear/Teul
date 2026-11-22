# Teul release acceptance — 2026-07-14

This record covers the product-improvement program defined by the four July 13
PRDs. The release candidate is the commit containing this record. The source of
truth for public claims remains `docs/SOURCE_PROVENANCE.md`.

## Automated release gate

The following commands passed from the release worktree after the final runtime
fix:

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

- 53 test files and 676 tests pass.
- Coverage is 80.12% statements, 73.38% branches, 73.52% functions, and
  81.46% lines.
- `dist/ui.html` is 360,101 bytes against the 409,600-byte product budget and
  the 450,560-byte artifact ceiling; `dist/code.js` is 121,108 bytes.
- The production UI smoke finds 13 actionable buttons and two backend messages.
- Every exported source symbol has a production reference.
- The production artifacts contain one inline UI script, no external scripts,
  and exact copies of the required legal and provenance documents.
- The pinned Wada corpus verifies 159 colors across 348 combinations against
  upstream commit `c142bd0bc8049ea48db4da5eb397981f047e8ef4` and semantic
  digest `a24e7b0101c5f1e7eed104d84b27a7c9bba147017589302d78c2992c37c2d853`.
- The dependency audit reports zero vulnerabilities.

## Figma desktop acceptance

Acceptance used the existing isolated Display P3 draft at
<https://figma.com/design/IVTRYRAobQpqtf9GcK2kvX/Untitled>. Test frames and
color-system output were removed through the verified one-step undo behavior.
The two pre-existing saved-grid records were not changed.

Verified against the production bundle:

- Teul opens with its product name, reports Display P3, and states that bundled
  and generated numeric values remain labeled sRGB approximations.
- The Wada browser exposes 159 colors, computed rendered WCAG labels, and the
  348-of-360 approximation disclosure.
- Wada and Werner use one tested rendered-swatch primitive. The canonical
  `AA Large` label replaces Wada's former nonstandard `A` label for the 3:1
  large-text threshold.
- The accessibility tool exposes the exact-pair checker and rejects an empty
  selection with actionable text instead of guessing.
- The generator presents `Palette roles`, `System method`, and
  `Review and create` as three explicit stages.
- Review names the included roles, modes, frame detail, variable/style choices,
  and collision policy before mutation.
- `Create copy` produces a collision-free Teul Generated collection with Light
  and Dark modes, 48 primitive variables, one detailed frame, and a correlated
  terminal report.
- WCAG-Constrained Tokens reports a passing blocking policy and creates Light
  and Dark modes, 48 primitive variables, 10 semantic aliases, one detailed
  frame, and no skipped resources.
- After the final architecture split and rebuild, a fresh production-bundle run
  repeated the Wada `AA Large` check and the complete WCAG-constrained mutation
  above, including the correlated terminal report.
- The live constrained-variable run exposed Figma's rejection of periods in
  variable names. Teul now maps semantic keys such as `background.canvas` to
  Figma hierarchy names such as `semantic/background/canvas` while preserving
  the dotted logical key in policy and exports. A host-shaped regression test
  rejects the prohibited characters.
- Focusing the canvas and undoing once removes the complete generated color
  operation, including its selected frame. Transaction tests cover variable and
  style rollback failures.
- Reopening Teul restores the active top-level Grids section and Auto theme;
  the saved-grid count remains two through `figma.clientStorage`.
- Saved exposes New Grid, Capture Selected Frame, Clear Selected, Export, and
  Import. The two stored USWDS records retain responsive metadata.
- New Grid exposes native count, gutter, margin, unit, alignment, visibility,
  baseline, application mode, live fit, and preview controls.
- Advanced construction exposes independent outer margins, optional
  inside/outside binding margins, ordered unequal tracks and gutters, multiple
  groups, nested subdivisions, baseline controls, and a
  `generated-geometry` realization disclosure.
- Creating a saved USWDS frame produces a selected 12-column frame and a
  confirmed backend result.
- Applying to a target that already has a grid offers Add, Replace, and Cancel;
  Cancel is focused as the safe default.
- Clear requires confirmation, reports one cleared target, and one canvas undo
  restores the grid. A second undo removes the temporary test frame.

## Runtime boundaries

- The real Figma account did not expose a plan-limit failure during this run;
  mode-limit and creation-failure paths remain covered by rollback tests and
  user-facing backend error propagation.
- Figma does not keep a locked layer in a normal mixed selection. Atomic mixed
  locked/unlocked behavior remains covered by backend fault-injection tests.
- Browser smoke remains a supplemental artifact check and is not treated as a
  replacement for this desktop record.

## Architecture completion

- The color-system document model is independent of Figma rendering, and the
  minimal, detailed, and presentation layouts are separate modules.
- Grid persistence is separated into codec, migration, repository, and
  import/export modules behind the stable `gridStorage.ts` public facade.
- Grid Library and Saved Grid application share one controller; UI/backend
  message correlation shares one operation primitive.
- Saved Grid cards and dialogs are separated from orchestration. Historical
  browsers share rendered-swatch, contrast, and provenance primitives while
  retaining their different domain-specific detail workflows.

All implementation items in the four July 13 PRDs are complete. The numerical
gate results above are from the final source verification run.
