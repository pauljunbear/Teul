# Source colors in product states and brand compositions

This is a locally verified slice of TASK-007, with portable replay work supporting TASK-002 and TASK-009. It follows the source review and extension preview at `52defe0`. It does not complete the full PRD or establish designer acceptance.

## What is implemented

Studio can use an unchanged reviewed palette or an explicitly reviewed extension in five separate product state samples and three adjustable brand compositions. The designer chooses every color role; the tool does not infer a primary brand color or manufacture light/dark modes.

- Product states are rest, hover, pressed, focus and disabled. Each is a separate application, so a required partner in rest cannot satisfy a missing partner in hover. Shared canvas, label and link controls allow explicit state overrides. Active label/action and link/canvas pairs require 4.5:1; action/canvas and focus/canvas require 3:1. Only the disabled action and its label receive the inactive-control exemption; its secondary link remains active.
- Brand layouts are side-by-side panels, stacked panels and an inset panel. The share control changes the measured visible areas. Prominence rules use all visible paint, including the canvas and accent. Decorative contrast is advisory.
- A shared geometry model supplies both the preview paths and the measured areas. Product text uses the existing finite licensed outline artwork, including glyph holes. This is generic demonstration artwork, not imported brand typography or an approved brand layout.
- Source-only application uses an unchanged apply proposal. Extensions replay their original source, construction brief, structure proposal and actual user rule decisions. An original source anchor and the intended use of generated colors remain explicit.
- Failed contrast or relationship checks retain the actual paints and reasons for correction. Export is available only for an eligible result, then replays the recipe and validates geometry again. SVG, CSS, DTCG tokens and a source-bound application JSON are downloadable.
- Opening application JSON requires the retained matching source review, re-executes its intent and compares the selected recipe. A wrong-source or malformed file preserves the current application. Restored shared controls remain editable; distinct state overrides survive.

The application file is separate from the guideline project file. Save both to reopen this stage of work. Multi-source projects, automatic recovery and integrated project storage remain TASK-009 work. Changing the source review or generating a different extension invalidates this temporary application workspace.

## Verification

Commands and exact file hashes are recorded in [applications-checks.json](applications-checks.json).

- Studio: 101 tests in 13 files pass on Node 22.13.1 and 24.19.0. Sixteen new tests cover measured geometry, source-only and construction execution, original anchors, explicit renewal, partner and contrast failures, actual prominence changes, malformed assignments, cancellation, caller mutation, forgery, export and replay.
- Guideline browser harness: 24 scenarios pass on both runtimes. New coverage includes the actual source-only product flow, reviewed generated shades in a brand layout, missing partner and bad hover contrast, source-bound save/reopen, editing shared colors after reopening, failed import recovery and 390px layout. No remote requests or page errors occur.
- Preview and exported SVG screenshots are byte-identical in Chromium at the same dimensions for the product rest state and the generated brand composition. This is a bounded browser render comparison, not a cross-renderer or Figma fidelity claim.
- The existing nine-scenario Studio browser suite passes on Node 22, including manual generation, saved recipes, historical libraries and contrast.
- Studio production builds, root typecheck/lint and Studio lint pass. The lazy guideline chunk remains above Vite's advisory 500 kB threshold, approximately 598 kB minified; the PDF worker remains approximately 1.317 MB. No plugin bundle code changed in this slice. Full final release verification remains TASK-010.
- Parent inspection covered the product preview, brand composition and mobile failed-rule view. These are synthetic Harbor engineering fixtures, not a brand-quality benchmark or human acceptance.

The browser harness generates screenshots and portable artifacts under ignored `release/guideline-proof/`. Run `npm --prefix web run test:guidelines` to recreate them; the harness owns and closes its test server.

## Review and scope

Three independent simplify reviews covered reuse, quality and efficiency. The parent fixed an imported-edit bug by restoring shared color choices and preserving only real state overrides. Closed override controls now mount only on expansion; a synthetic 256-color review measured 2,318 options and 163,642 rendered HTML bytes, down from 6,173 options and 432,576 bytes. These counts came from a local reviewer measurement, not a release performance threshold. Application import now reuses the existing UTF-8 byte counter.

No new color engine, automatic source-rule approval, new source data, provider call, Figma mutation, global configuration, push or deployment occurred. Source scale positions and values remain unchanged. The new adapter keeps the core's `qualified:false` boundary.

Remaining full-scope work includes assisted interpretation and its evaluation, Figma URL and website ingestion, bounded service/auth/privacy controls, useful automatic supporting directions, state-distinction and interaction evaluation, complete gradient authoring, integrated saving/refresh, held-out human visual acceptance and final release gates. The current samples assess paint and source constraints; they are not complete interactive components or a complete WCAG audit.
