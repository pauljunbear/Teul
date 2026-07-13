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

The final run for follow-up commit `186e79a` produced 39 passing test files and 651 passing tests. Coverage includes every production TypeScript and TSX file: 82.07% statements, 73.51% branches, 77.37% functions, and 82.93% lines. The production UI artifact is 431,833 bytes against a 450,560-byte ceiling, leaving 18,727 bytes of headroom; the plugin-main artifact is 89,050 bytes. The pinned Wada corpus matches upstream commit `c142bd0bc8049ea48db4da5eb397981f047e8ef4` and semantic digest `a24e7b0101c5f1e7eed104d84b27a7c9bba147017589302d78c2992c37c2d853`. The dependency audit reports zero vulnerabilities.

## Figma desktop acceptance

Acceptance was exercised in isolated drafts rather than an existing project: the original [sRGB acceptance file](https://figma.com/design/raVgxMZWdXo27fwR7eE6WV/Untitled) and the final [Display P3 and persistence file](https://figma.com/design/IVTRYRAobQpqtf9GcK2kvX/Untitled). The release-critical follow-up paths were rerun with the production bundle built from commit `186e79a`.

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
- A new Display P3 document reports the correct profile and warns that bundled/generated values remain labeled sRGB approximations. Applying Hermosa Pink preserves the exact numeric `F9C1CE` value; Teul does not claim to convert the source palette to P3.
- Bootstrap XXL accepts a 1601 × 1234 frame with height unconstrained, resolves a centered 153px content-guide offset and 24px gutter, and rejects a 1398px-wide frame below its 1400px minimum.
- A contrasting four-column apply attempt leaves a locked 12-column frame unchanged.
- An unlocked main component accepts a four-column grid replacement, and a linked component instance accepts a responsive USWDS 12-column override.
- A USWDS copy persists through `figma.clientStorage`; JSON export produces the expected responsive-width record; re-import increases the collection from one to two grids; and a second export confirms regenerated unique IDs with identical behavior and grid configuration.

The all-or-nothing mixed locked/unlocked batch is verified by backend tests because Figma's editor will not keep a locked layer in a normal mixed selection. Runtime-write rollback is also fault-injection tested. Saved-grid mutations serialize within one UI and refresh shared client storage before every mutation; Figma exposes no compare-and-set operation, so truly simultaneous writes from separate plugin contexts remain a documented platform boundary rather than an atomic guarantee.

## Known source boundary

The pinned 159-color Wada corpus and all 348 combinations match the audited upstream dataset, including the twelve documented A.XII omissions. `Dull Violet Black` M=106 remains explicitly unresolved because the available scans do not provide enough evidence to override the modern corpus; resolving it requires checking the licensed Seigensha reference. No unsupported correction is made.
