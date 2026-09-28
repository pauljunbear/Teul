# Authored delivery and shared application geometry

TASK-007 carries a selected recipe through a fresh execution, measured application preview, token export and native delivery. It retains source values, named modes and contextual rules without assigning a global Primary or forcing the earlier five-section output shape. The candidate remains `qualified:false`.

Status: implemented and locally verified on the candidate branch. Independent exact-diff review and targeted fixes are complete. Browser observations use the actual built UI and backend modules over an in-memory Figma API; no real-host or owner acceptance is claimed. Final brand evaluations and full release gates remain in TASK-008.

The [implementation file manifest](2026-09-24-authored-delivery-files.json) records exact source, test, artwork and candidate artifact identities against baseline `0918735`.

## What reaches each output

The delivery compiler accepts a complete editable recipe and bounded application geometry. It replays the actual engine, requires the selected content to match, and compares the complete retained model and applications. A private compiled capture is required by native delivery; posted JSON or a saved recipe cannot become Create authority.

The shared geometry contract supports opaque, normal-blend rectangles and compound polygons with even-odd fill. It verifies containment, non-overlapping siblings, holes, visible use area and each contrast pair's actual painted substrate. Coordinates lie on a 1/64 CSS-pixel grid. There is no geometric epsilon. Unsupported geometry, missing mode values, mismatched supplied areas or a fully occluded use fail explicitly. Measured areas re-enter the complete application gate, including source prominence rules.

The browser preview and native host consume these same measured regions and exact mode-specific values. Equal geometry does not establish equal raster antialiasing. Documentation is outside application roots, so explanatory text cannot change the measured brand composition.

The ordinary designer form provides fixed control, link and selected-control boards with rest, hover, pressed, disabled and focus examples. The browser presents these boards at their actual size in named, keyboard-scrollable regions. Preview descriptions retain the authored context, mode and layout description; internal native names keep their collision-safe identities. Disabled text and boundaries use the explicitly selected focus paint on the exact surface. Disabled links join the active links in the existing rendered-inequality gate, while inactive contrast checks remain exempt. Filled active controls and outlined disabled controls retain their distinct geometry. These constraints establish visibility and exact difference, not aesthetic acceptance. Saved legacy directions replay their original paints and geometry; they use the advanced editor when they no longer match the current form exactly. Its labels use finite outlined artwork compiled from pinned Arial Regular bytes. The checked-in asset and `scripts/generate-authoring-outlines.py` retain the text, font digest, fonttools version, 0.125 CSS-pixel flattening bound, grid rounding and absence of kerning/hinting. Reproduction checks the tool version and font digest. Geometry exports, DTCG root metadata and the native documentation index retain the supplied attribution. It is identified as provided artwork metadata and confers no source-color authority.

Primitive collections are partitioned by their actual available mode domains. Semantic aliases preserve application/use identity. Sparse colors receive no fabricated fallback values. CSS uses explicit `data-teul-mode` selectors; DTCG aliases resolve within the matching mode namespace. Each raw export is checked independently against its byte limit after escaping. Recipe, source, design, execution, geometry and delivery identities remain traceable.

Native boards set both semantic and primitive collection modes. Bound paint styles depend on the consuming node's collection modes; the UI, style descriptions and documentation state this limitation. Readback calls `resolveForConsumer` on actual paint nodes, in addition to verifying literal values, aliases, modes, geometry and metadata. Figma resolves aliases in the consumer's collection context; a style's stored fallback paint alone is insufficient evidence. See [Figma variable resolution](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/).

## Create, recovery and compatibility

Delivery review is short-lived and binds the actual destination, current recipe and exact preview. Create requires explicit destination and candidate acknowledgements, plus an imported-snapshot acknowledgement where applicable. Acknowledgements are bound to the review hash: a changed review clears them while preserving the supplied layout and distinct copy name for retry. The review is consumed before asynchronous creation begins.

The final mutation fence rechecks the recipe, source, destination and actual host capabilities after awaiting source validation. Source intake and Create are mutually coordinated, including a source read that began before Create. Cancellation during a native transaction does not report an invented successful cancellation or erase its eventual outcome.

The authored adapter reuses the existing resource transaction, ownership and journal kernels. Its identity and arbitrary resource counts are explicit; it does not synthesize old strategy hashes or five-frame assertions. The shared journal lease protects both creation paths in the same document. Partial rollback and foreign-resource refusal remain visible. New output does not change the source document's existing colors, selection, page or viewport.

Compatibility characterization retains the previous V2 path's output and event sequence across 25 cases on Node 22 and Node 24. The retained comparison is byte-identical: 348,302 bytes, SHA-256 `c7dafaffeaa46bcf008fa4062e2fbbda4e562e43b7ee241e33f4d20b36717f8b`. This is local characterization of program behavior, not a real Figma receipt.

Imported recipe labels remain unchanged. A valid distinct copy name can rescue a label that exceeds the native naming contract. The renderer, controller, UI and authored journal share the 160-character output limit and derived 184-character page limit; the legacy journal retains its existing bounds.

## Verification boundaries

Focused checks cover exact values and modes, source and recipe substitution, artwork metadata, raw export bounds, geometry topology and substrate failures, journal concurrency, stale authorization, partial rollback, interrupted recovery, native readback tampering, source/Create routing and built-interface interactions. Public fixtures contain invented data.

The built-interface smoke passes on Node 22.13.1 and Node 24.19.0. It uses the actual candidate UI, compiler, delivery session, transaction, journal and native host against an in-memory Figma API. It verifies six boards in two modes, raw token/CSS exports, acknowledgement reset, retained custom-layout/copy-name drafts, consumed review, matching resources and one Undo commit. These are mocked API observations, separate from the browser checks below.

Independent reuse, quality and efficiency reviews examined the same 40-file initial diff (561,049 bytes; SHA-256 `7434105a95c0ea4d0889bd5b73d0726ae182e6a3f9e13fc21c807c5573dc3b14`). Findings repaired naming/recovery bounds, recipe-scoped UI draft retention, repeated export computation and document-name collision scanning. Subsequent independent review covered those fixes and the actual-size preview UI. Browser findings added disabled-state and pending-review-message regressions. The final implementation-file manifest binds the resulting files; review records and logs are retained privately under `implementation-baseline/task007`.

Focused verification on both supported runtimes includes: 349 tests across 17 suites before final review fixes; 112 naming/recovery tests; 31 export-cache/collision tests; 101 disabled-state/legacy-replay tests; 15 final SVG tests; and 57 pending-review/session/controller tests. Counts overlap and are not additive. Full type checking, targeted lint/format checks and the final full lint pass. Generic sanitization passes eight script tests and scans 520 text files out of 545 listed, plus both built artifact directories. Full dual-runtime release gates and frozen brand evaluations belong to TASK-008.

The final candidate UI is 425,147 bytes against its unchanged 430,080-byte budget. SHA-256: `70ceca67e0ead75fcceafb79ce0a08777a16a5c86da6aa47388fe5d4892762cc`. The final backend bundle SHA-256 is `e177a8b0018875f030a244f16254064d8a0fbb1a19e97119c64c502243e96b9e`. The final backend-only wording repair leaves UI bytes unchanged. Artifact assertions retain one inline UI script, no external scripts, and source-matching legal/provenance documents.

## Real-browser observations

A loopback-only harness served the unchanged candidate UI in the Codex in-app browser. Messages reached the actual CandidateRuntime and product controllers, storage, compiler, renderer and journal. Every Figma operation targeted the public in-memory API fixture. The browser tab stayed in the background. The private harness enforces Host, Origin, random-token and request/response limits; its conflict fixture creates two actual concurrent storage revisions, rather than fabricating a UI response.

Observed with keyboard activation and browser accessibility/DOM readback:

- Source import and two-mode construction return focus to the authoring heading. The selected source anchor, surface, on-control text, focus/disabled paint and exact-rest lock survive acknowledged save and reopen.
- All six preview images load at 824 by 180 CSS pixels. Their labelled regions scroll horizontally by keyboard; observed image width is 824 and container width 499. The repaired disabled column is visible. Captions describe context, mode, sample and state order.
- DTCG, CSS, geometry and recipe exports become available only after the backend response. The actual exported bytes are retained with hashes.
- Three review acknowledgements enable Create. The acknowledged distinct copy creates 76 variables and 56 paint styles, consumes its review and records one mock Undo transaction. Native readback verifies the resources. Current page, selection and viewport remain unchanged in the mock; no real Figma Undo is claimed.
- Opening a conflicted saved recipe exposes both current branches. Choosing a branch and saving the merge retains four revisions, with one current head and the earlier branches visible in history.
- Replacing a communications accent from Werner Orpiment Orange with Aurora Red requires an explicit changed-rule review. After acceptance, both product applications, the locked blue scale and sibling accepted/rejected decisions remain exact; both communications applications change. The saved refined recipe is retained. The initial misleading infeasibility wording was repaired; an actual incompatible accepted rule still reports infeasibility.

Evidence is retained at `/Users/paul.jun/Documents/private-jobs/teul-brand-system-2026-09-24/implementation-baseline/task007/browser/`. Attempt 02 records the visual failures; attempt 03 retains creation, all four exports, conflict recovery and exact refinement comparisons; attempt 04 verifies the repaired pending-review wording in the browser, retaining the previous selection with zero native mutations. Browser screenshots are retained in the task's computer-use record. Raw receipts distinguish browser observations from in-memory native results. The external checks below remain unobserved.

## Unobserved external behavior

The new candidate has not been exercised inside Figma. Required host checks are: install the exact candidate bundle in an authorized disposable file; import the retained synthetic recipe and geometry; prepare and inspect the destination; create and inspect values, modes, geometry and documentation; Undo; then exercise stale-source rejection, repeated Create and interrupted recovery. Preserve the source and record the tested bundle digests. A source API script cannot substitute for running this plugin bundle.

Real Figma keyboard navigation, assistive technology, owner aesthetic acceptance, qualification and publication remain separate. Local passing results do not authorize or establish those states.
