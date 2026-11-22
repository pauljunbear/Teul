# Standalone interface accessibility

The tested Studio journey passes twelve full-page automated WCAG scans on both Node 22.13.1 and Node 24.19.0, using Chromium 153.0.8010.12 and axe 4.13.0. Keyboard events reach source review, gradient generation, SVG download, save and the Figma/website capture review controls. This advances AC-018; actual screen-reader observation and complete interface acceptance remain open.

The [source-bound receipt](accessibility-checks.json) links the final harness, fixture and production source hashes. The detailed summaries retain every incomplete check: [Node 22](accessibility-node22.json), [Node 24](accessibility-node24.json). Full raw axe reports and desktop/mobile screenshots remain under ignored `release/guideline-accessibility/`; the summaries retain each report's SHA-256.

The later [advanced keyboard and contrast check](advanced-accessibility.md) extends this journey to scale editing, source relationships and gradient-use constraints. It resolves the four clipped table targets in separate fully visible states and fixes an unstable input name. The original twelve-state receipts and incomplete findings below remain historical evidence.

## What changed

- Inactive navigation labels used a translucent foreground that measured 3.95:1 against the Studio background. They now use the existing interface muted color; source and generated colors are unchanged.
- The local project controls, imported-file notice, gradient assessment and Figma paint previews now have a group role, making their existing accessible names valid.
- The generated gradient preview now has an image role and a description; its numerical checks remain separate text.
- A pinned development-only axe dependency and production-browser harness now run in the guideline verification profile. The harness blocks off-origin HTTP requests, owns and closes its processes, records failures and replaces old receipts with a running state before setup.

## Measured coverage

| State                                        | Result on each runtime                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Empty workspace; selected PDF before reading | No automated violations or incomplete checks                                                      |
| Extracted PDF review; applied review         | No automated violations or incomplete checks                                                      |
| Generated gradient; saved project            | No automated violations or incomplete checks                                                      |
| Rejected project import, desktop and 390px   | No automated violations or incomplete checks; completed gradient remains exportable               |
| Figma capture review, desktop                | No automated violations or incomplete checks                                                      |
| Figma capture review, 390px                  | No automated violations; one incomplete contrast rule covering four partially clipped table nodes |
| Website capture review, desktop and 390px    | No automated violations or incomplete checks                                                      |

The Figma table intentionally scrolls horizontally within the page. The harness reaches it with Tab and moves it with ArrowRight; the [resulting view](accessibility-mobile-table.png) exposes the source-text column. That verifies keyboard scrolling, not the unresolved contrast findings or assistive-technology behavior. No axe rule or page region is excluded. All tested pages stay within their viewport width.

Keyboard checks use actual Tab, End, Enter and ArrowRight events rather than setting focus programmatically. The SVG download contains SVG markup. File contents are supplied through the production input controls; the operating system's file chooser is outside this test. Synthetic source captures exercise the interface and do not establish live Figma or website service access.

## Regression evidence

The focused [Node 22 gate](../local-gates/2026-09-26T12-22-52Z-2cd494e/receipt.md) and [Node 24 gate](../local-gates/2026-09-26T12-23-58Z-2cd494e/receipt.md) each pass Studio lint, audit, 613 tests in 51 files, normal and enabled production builds, the normal browser smoke and accessibility journey, plus 61 repository script tests. The final Node 22 harness receipt adds setup-failure protection after that gate and was rerun against its unchanged candidate. Both final harness hashes match.

Three independent simplify reviews are resolved. No shared color engine, plugin, source adapter, storage contract or permission behavior changed. Their prior complete [integration gates](standalone-integration.md) remain evidence for that unchanged code; this focused run is not a new complete plugin release gate. Vite's existing large-chunk warning and Node 22's experimental SQLite warning remain.

## Remaining acceptance

Observe the complete editor with an actual screen reader, including status announcements, error recovery, focus visibility and information conveyed without color. The tested journey does not cover every expanded advanced editor or every assistive technology. Independent designer evaluation and live-host qualification remain separate gates. These results do not enable the feature by default or establish beta approval.

Reproduce after an enabled build, with a supported Node version first on PATH:

```sh
VITE_GUIDELINE_IMPORT=true npm --prefix web run build
npm --prefix web run test:guideline-accessibility
```
