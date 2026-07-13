# Teul release acceptance — 2026-07-12

This document records the evidence for the end-to-end accuracy and hardening audit. It separates automated proof from checks that require the Figma desktop runtime.

## Automated release gate

The release candidate must pass all of the following from a clean install:

- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:coverage`
- `npm run build`
- `npm run assert:artifacts`
- `npm run verify:wada`
- `npm audit --audit-level=moderate`
- `git diff --check`

The final run produced 37 passing test files and 624 passing tests. Coverage includes every production TypeScript and TSX file: 81.89% statements, 73.15% branches, 77.29% functions, and 82.81% lines. The production UI artifact is 427,652 bytes against a 450,560-byte ceiling, leaving 22,908 bytes of headroom. The pinned Wada corpus matches the audited upstream commit and semantic digest. The dependency audit reports zero vulnerabilities.

## Figma desktop acceptance

Acceptance was exercised in an isolated draft rather than an existing project: [Teul acceptance file](https://figma.com/design/raVgxMZWdXo27fwR7eE6WV/Untitled).

Verified manually:

- Plugin starts in an sRGB document and reports the document color profile.
- Wada loads 159 normalized colors and discloses that they are used across 348 of the original 360 combinations.
- Applying a Wada color to fill and stroke produces the exact selected hex.
- Linear-gradient creation works.
- Creating a paint style works and a duplicate style is detected rather than recreated.
- Werner loads all 110 colors and exposes its Getty provenance.
- The accessibility panel reports WCAG contrast and signed APCA Lc with experimental/web-only limits and qualified CVD prevalence language.
- The grid library exposes all 65 presets.
- A rectangle is rejected as an ineligible grid target.
- A 4-column frame is created at its 794 × 1123 reference size, receives four Figma layout columns, and can have the grid replaced.
- Live frame resizing refreshes fit status through the page-scoped node-change listener.
- A too-small frame fails with recommendations and disables application.
- Canonical-only historical presets reject noncanonical frame sizes and name the required dimensions.
- Changing pages clears the stale selection and keeps the plugin running.

Not yet verified manually:

- Display P3 badge and conversion behavior in a new P3 document.
- Responsive named-system width ranges and centered-container calculations in the live Figma runtime.
- Locked frames, components, instances, and multi-selection rollback in the live Figma runtime.
- Import/export round trips through the desktop file chooser.

Those paths have automated unit/integration coverage where practical, but the draft pull request must not be promoted to a release tag until this remaining desktop matrix is completed.

## Known source boundary

The pinned 159-color Wada corpus and all 348 combinations match the audited upstream dataset, including the twelve documented A.XII omissions. `Dull Violet Black` M=106 remains explicitly unresolved because the available scans do not provide enough evidence to override the modern corpus; resolving it requires checking the licensed Seigensha reference. No unsupported correction is made.
