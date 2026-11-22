# Restore compositions after a source refresh

This local slice advances TASK-009 / REQ-012 / AC-011. Studio remains the standalone product under DEC-006. An unchanged composition can now return after source refresh with its layout, exact colors and embedded extension intact. When the extension needs fresh rule decisions, the restored composition is blocked and saveable. Its previous approval stays in history.

## Behavior and engineering boundary

**Restore available designs** now includes compositions whose inputs and paint still match but whose generated shades require review. The composition panel shows the complete affected rules. **Apply rules and recheck composition** records explicit decisions against the current proposal and assesses every paint and rule again. Rejected or missing decisions leave it blocked. A previous contrast or source-rule failure cannot become an export merely because the extension was approved.

The composition's embedded extension remains independent of the standalone extension panel. Pending and reviewed work both use the existing strict workspace reader; no saved format or migration was added. Saved success labels cannot grant export permission. Cancellation keeps the selected work. A newer save or project open prevents late approval/results from publishing, and the checking status clears when a check is superseded.

Browser verification found that compiled scale evidence could change solely because a renewed profile decision sorted before a native color reference. Replay now checks the scale's declared evidence against the source comparison and current reviewed draft. Changed evidence still fails, as do changed anchors, source roles, scale structure, modes and governing rules. Historical source compilers and readers stay byte-compatible. Long rule identifiers wrap on narrow screens.

## Verification

The [source-bound receipt](composition-refresh-checks.json) records exact files, runtime versions, test output, build hashes and browser results. It covers:

- Ready and failing compositions; old, missing and rejected decisions; forged saved success; changed anchors and declared scale evidence; strict pending save/reopen; exact retained paint and geometry.
- Production Studio UI: source comparison → acceptance → new source review → restoration → rule decisions → exact original SVG. A different standalone extension stays unchanged.
- Held real engine yields: cancel, save current project, and open another project. Older work cannot replace the current result or leave a false checking status.
- Desktop and 390px views, plus existing PDF refresh, native Figma/website refresh and selected-output recovery regressions.

Node 22.13.1 and 24.19.0 each pass 549 Studio tests in 46 files, lint, the enabled production build and all four listed browser checks. Chromium is 153.0.8010.12. [Desktop](composition-refresh-desktop.png) and [mobile](composition-refresh-mobile.png) capture the restored pending composition. Reproduce with:

```sh
npm --prefix web test
npm --prefix web run lint
VITE_GUIDELINE_IMPORT=true npm --prefix web run build
npm --prefix web run test:guideline-composition-refresh
npm --prefix web run test:guideline-output-recovery
npm --prefix web run test:guideline-refresh
npm --prefix web run test:guideline-native-refresh
```

The new browser scenario uses a synthetic Figma capture and the production bundle. The existing three regressions use a local development server. No live connector, provider or external source is exercised. Independent reuse, quality and efficiency reviews are resolved, including the additional evidence/legacy-reader check. Shared core and plugin bundles did not change, so their prior full release gates were not rerun for this web-only slice.

## Remaining work

Manual PDF source-value continuity has subsequent evidence in [fresh-region recovery](manual-pdf-refresh.md). Full AC-011 remains open for multi-source reconciliation and broader source cases. Full PRD acceptance still requires broader source evaluation, live host/connector readiness, designer judgment and release work. Numerical checks and recovery correctness do not establish visual quality or approved brand use. This is local implementation evidence, not integration or deployment.
