# Figma and website source comparison

Status: implemented and locally verified on `codex/brand-guideline-import`; not integrated, pushed or deployed. This advances TASK-009 / REQ-012 with partial AC-011 evidence. It does not complete selective replay of applied reviews or designs.

## Behavior

A successful Figma or website read stages its new capture when another source is open. Offline capture files follow the same path; opening a complete saved project retains its existing explicit replacement behavior. The designer can download the incoming capture, compare it, or keep the current source. Reading or rejecting an update does not replace current source decisions or designs, or repeat the source request.

Figma correspondence uses the file, node/paint slot, variable, collection and native mode identities. Matching also checks exact channels, metadata, bindings, alias paths, selected-mode values, source text and captured ancestry. Inserting or reordering paints cannot silently transfer a paint-slot decision. Contradictory overlapping ancestry is ambiguous. A change to an unselected variable mode still registers as updated source evidence, while unchanged selected-mode choices may seed the next draft. Current-read variables remain separate from the file's pinned node revision.

Website correspondence uses the requested/final URL, captured element path, pseudo-element and case-sensitive property name. Temporary enumeration IDs are ignored. Exact declaration values, observed appearance, text and captured ancestor context must agree. Indistinguishable repeated elements are ambiguous. These positional matches are review candidates, not proof of persistent DOM identity. Changed viewport, scope, profile, gaps or source constraints require fresh interpretation.

The comparison lists added, removed, changed and ambiguous observations. The downloadable receipt includes both capture hashes, the previous draft hash, comparison keys and signatures, retained/reset counts and the proposed draft. These hashes support inspection; they do not establish corporate approval or source authority. Capture-time-only changes are no-ops. Actual source revision or evidence changes remain visible.

Acceptance first saves the complete current workspace with the existing atomic local-history writer. Quota failure, concurrent revision conflict, cancellation or another editor replacing the workspace prevents publication. The accepted source starts an unfinished review with only safe editable names, families, modes, scales and statement interpretations retained. Profile and partial-scope confirmation are renewed. Prior applied reviews and exact selected designs remain in the saved revision. Saving the new draft afterward appends to that same project's history.

## Verification

Both Node 22.13.1 and Node 24.19.0 pass:

- Full Studio suite: 459 tests in 39 files, including fifteen native correspondence cases.
- Fourteen native refresh browser scenarios (seven per source), fourteen Figma reader scenarios, nine native review scenarios, eleven website reader/review scenarios and ten PDF refresh scenarios.
- Existing local-storage browser suite: 25 guideline scenarios plus nine palette regressions.
- Production proof build with guideline import enabled, including TypeScript.

Studio lint, strict PRD-ready validation and whitespace checks pass. The dead-code report now lists 48 exports and one file, down from 50 exports because native draft parsers are now runtime consumers. This report is not deletion authority. Mobile comparison and save-failure screenshots were inspected at 390px; long values and locators wrap, with no page overflow. The existing bundle-size advisory remains. Exact file bindings and local artifacts are recorded in [native-refresh-checks.json](native-refresh-checks.json).

The checks use synthetic native captures and fictional website fixtures. Browser readers use the real local intake service with synthetic upstream responses; offline comparison tests inspect actual downloads and IndexedDB contents. They establish local behavior, not live Figma account access, public website quality or brand acceptance.

The native comparison suite covers capture-time ID churn, changed paint, labels, bindings and ancestry, changed source scope, selected versus unselected alias modes, website counter renumbering, context changes, conflicting and consistent overlapping Figma captures, reordered paint slots, and selective scale dependencies. The actual Studio flow covers each source's no-op recapture, rejection with exact-byte preservation, stale draft, delayed acceptance followed by editor replacement, quota failure, acceptance/history, and 390px controls.

Existing Figma capture/review, website, PDF refresh and local-storage browser suites remain part of regression verification. Their successful recapture cases now explicitly compare and accept before expecting replacement; independent capacity and multimode fixtures start fresh sessions. No guardrail assertion was removed.

## Review and remaining scope

Independent reuse review found no actionable duplication. Quality review identified missing ancestor dependencies and a no-op check that ignored unselected Figma variable modes; these were corrected and tested. Efficiency review identified repeated hashing of shared native/website context; snapshots now compute those digests once and reuse them.

Unchanged editable interpretations can seed a proposed draft. Persistent carryover lineage, selective replay of unaffected applied results, multi-source reconciliation and full AC-011 remain open. Existing outputs survive exactly in history; this slice does not make them current under changed evidence. Live connector/provider qualification, designer review, assistive-technology acceptance and integrated release gates remain open. No merge, push or deployment is claimed.
