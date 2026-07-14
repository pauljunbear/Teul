# PRD: Product Workflow, Architecture, And Release Quality

Status: Implemented and release-verified
Date: 2026-07-13

Implementation checkpoint — 2026-07-14: PQ-001 through PQ-006 are implemented
and covered by focused tests, production checks, and current Figma desktop
acceptance. PQ-004 now separates the pure color-system document model and three
Figma layouts; grid storage has codec, repository, migration, and import/export
boundaries behind a stable facade; request correlation and grid application are
centralized; Saved Grid views are separated from orchestration; and both
historical browsers share the same tested rendered-swatch and provenance
primitives.

## Problem

Teul's correctness engine is better tested than several user workflows. Large
feature modules mix state, calculations, messaging, Figma rendering, and UI.
Repeated inline styles consume bundle headroom, and top-level tab changes discard
useful browsing context. The accessibility tools are accurate but disconnected
from the canvas and palettes users are already working with.

## Product Goal

Make Teul easier to understand, faster to repeat, and less expensive to change
without weakening its source or release guarantees.

## Requirements

### PQ-001: Guided color-system flow

- Replace the long generator form with `Palette roles`, `System method`, and
  `Review and create` stages.
- Recommended defaults require no more than three common-path decisions.
- Advanced neutral, detail, export, and collision controls remain available.
- Review shows every included role and mode and states every planned mutation.
- Success remains visible with created output and a clear next action; failure
  preserves the draft and focuses the exact problem.

### PQ-002: Selection-aware accessibility

- `Use Selection` reads supported foreground/background pairs from text and
  shape selections.
- Mixed, transparent, gradient, image, and ambiguous paints return explicit
  unsupported guidance.
- Wada combinations, Werner colors, and generated systems can open the
  accessibility tool with their exact palette and profile metadata.
- Results remain pair-specific and never imply whole-product compliance.

### PQ-003: Persistent workspace context

- Follow Figma's active theme by default while retaining an explicit user
  override.
- Persist the active section, filters, unfinished generator draft, and recent
  colors through Figma client storage where appropriate.
- Search fields have programmatic labels, functional text uses readable sizes,
  and motion respects `prefers-reduced-motion`.
- The plugin header identifies Teul, not only Sanzo Wada.

### PQ-004: Feature boundaries

- Extract a pure color-system document model from Figma renderers.
- Split minimal, detailed, and presentation Figma layouts.
- Share one grid-apply controller between Library and Saved.
- Split grid storage into codec, repository, migration, and import/export layers.
- Centralize message correlation and historical-color browser primitives.
- Declarative datasets may remain large; orchestration and view modules should
  normally remain near 400-500 lines.

Boundary note: the remaining larger browser modules contain materially
different Wada-combination and Werner-natural-history detail workflows. Their
shared rendered swatch, WCAG naming, source disclosure, workspace state, and
generator entry points are centralized; merging the distinct detail workflows
would obscure domain behavior rather than simplify it.

### PQ-005: Bundle and dead-code hygiene

- Reduce `dist/ui.html` to at most 400 KiB before substantial new UI features.
- Move repeated visual declarations into a small active component and theme
  layer using Figma theme variables.
- Add a bundle composition report and a dead-export check to CI.
- Remove production-unreferenced helpers, empty compatibility models, and stale
  duplicate contrast implementations unless an explicit supported API depends
  on them.

### PQ-006: Risk-based verification

- Add an in-process UI-to-validator-to-router-to-mocked-Figma integration
  harness.
- Add targeted thresholds for mutation, historical browser, generator, grid
  library, storage, and error-boundary modules.
- Preserve generated Figma node structure through focused golden tests.
- Keep full release gates and manual Figma acceptance current after every
  behavior-changing phase.

## Non-Goals

- A visual redesign detached from Teul's existing interaction language.
- More features without recovered bundle and testing headroom.
- Replacing Figma runtime acceptance with a standalone browser smoke test.

## Acceptance Criteria

- Common color-system creation can be completed through the three-stage flow.
- Supported canvas selections populate accessibility tests without manual copy.
- Theme and working context persist across normal plugin use.
- No correctness-critical orchestration is hidden by aggregate coverage alone.
- Bundle, dead-export, dependency, and artifact gates pass in CI.
- The complete Figma acceptance matrix is recorded against the release commit.
