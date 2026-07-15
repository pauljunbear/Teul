# Teul Navigation Study — Design QA

- Source visual truth A: `targets/direction-a.png`
- Source visual truth B: `targets/direction-b.png`
- Implementation A: `http://localhost:4173/?direction=a`
- Implementation B: `http://localhost:4173/?direction=b`
- Final Direction A screenshot: `audit/direction-a-complete.png`
- Viewport: 1280 × 900 browser viewport; 560 × 720 plugin surface
- State: selected Wada color detail, Corinthian Pink pairings, pairing export, and preloaded system palette
- Primary interactions tested: complete 159-color Wada and 110-color Werner libraries; Corinthian Pink’s 12 documented combinations; duo and quad selection; pairing export; pairing-to-system handoff; Wada/Werner switching; color search/filter/select; fill/stroke/style/copy feedback; full three-stage system creation; grid library; My Grids; grid builder; grid apply preflight; contrast check; color-vision simulation; and settings
- Console errors checked: no warnings or errors

## Final Direction A comparison evidence

- Selected target plus final browser result: `audit/direction-a-comparison.png`

The comparison places the selected Direction A target and browser-rendered implementation together at the same 560 × 720 plugin size and selected-color state.

## Focused comparison evidence

- Direction A inspector: `direction-a-focused-comparison.png`
- Direction B source/search/filter/focus header: `direction-b-focused-comparison.png`

Focused crops verify the small typography, value rows, selected states, search/filter density, and navigation placement that are difficult to judge from the full view alone.

## Findings

No actionable P0, P1, or P2 findings remain in the prototype.

Intentional differences from the generated targets:

- Direction A removes secondary inspector values and duplicate accessibility rows to preserve the requested simpler action hierarchy.
- Direction A calculates the actual contrast against its recommended text color instead of reproducing the generated target’s inaccurate numeric label.
- Direction A now adds color-style and color-system creation to the inspector, then moves multi-step creation into a focused rail-preserving workspace.
- Wada inspectors now expose documented combinations directly. The full combination workspace shows every duo, trio, and quad, corpus IDs, source colors, pairwise contrast, gradient actions, palette export, and system creation.
- A system created from a Wada pairing arrives with all two to four source colors and default roles already assigned. Adding another source color is optional.
- Both historical libraries now import Teul’s production datasets directly. The prior prototype’s inaccurate Venice Green value and non-corpus “Pleroma Blue” and “Tyrian Purple” entries were removed.
- Werner details now expose the production animal, vegetable, and mineral references alongside the sampled color.
- Grid Library and My Grids share one collection switch; creation and geometry editing reuse the same task workspace instead of adding another navigation level.
- Contrast and color-vision simulation share the Check destination. APCA is explicitly supplemental and experimental, not a WCAG conformance result.
- Direction B combines profile and settings into one quiet utility control.
- Direction B uses calculated WCAG contrast language and removes ambiguous unlabeled actions.
- Both prototypes retain a small simulated Figma plugin title bar so the navigation is judged in its real host context.

## Required fidelity surfaces

- Fonts and typography: Inter with system fallbacks; hierarchy is consistent and small metadata remains legible in the focused crops.
- Spacing and layout rhythm: both directions use the current 560px width, a five-step spacing system, 8px controls, and 12px panels. No clipping, collision, or hidden persistent controls remain.
- Colors and visual tokens: Teul’s restrained monochrome surface hierarchy is preserved; selection uses white rather than a new accent color.
- Image quality and asset fidelity: the targets contain product UI and color samples rather than decorative image assets. Swatches use their actual color values and Phosphor supplies interface icons.
- Copy and content: historical approximation language is preserved. Generated systems and modern adaptations are not described as exact.
- Accessibility: keyboard focus is visible, primary controls meet the 36px target, text/background contrast is calculated, and semantic names are present.
- Behavior: all core Direction A destinations and creation journeys were exercised in the browser, including method selection, variable/style options, export formats, saved-grid tools, color-vision controls, and visible success states.

## Comparison history

1. The first browser pass exposed a 720px exploratory width, mocked contrast labels, a clipped filter, and several undersized labels.
2. The prototype was corrected to Teul’s 560px width, contrast became calculated, primary text sizes increased, and the filter row was tightened.
3. The first 560px Direction A capture exposed truncation and a partially hidden final filter.
4. Rail, inspector, card type, and filter density were adjusted. The current full and focused comparisons show the corrected state.
5. The first end-to-end pass omitted Wada combinations and used a small hand-authored color subset. This was a P1 completeness and accuracy failure.
6. The prototype now consumes `src/colors.json` and `src/wernerColors.json`, renders all 159 and 110 colors, exposes Corinthian Pink’s 12 exact combination IDs, and preloads complete pairing palettes into system creation. Browser checks confirmed two role cards for duo ID 27, four role cards for quad ID 342, no required add-color step, and no console warnings or errors.

## Production follow-up

- [P3] Test the 170px inspector with the longest real Wada and Werner names before moving this architecture into the Figma plugin.
- [P3] Replace prototype success messages with confirmed backend results when implemented in production.

final result: passed
