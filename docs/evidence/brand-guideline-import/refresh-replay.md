# Selective design replay after source refresh

This TASK-009 / REQ-012 slice lets a designer apply an updated source review, check previous designs, and restore selected paint whose dependencies remain unchanged. Studio remains the product home; this flow does not run a Figma plugin. Full AC-011 remains open.

## What is retained

A new optional `teul.guideline-workspace.v2` envelope keeps one flat previous-source project, its selected outputs, the new capture hash and the source-comparison hash. Imported history is parsed and replayed with the existing strict readers. It cannot nest another workspace. Existing V1 workspaces and PDF/Figma/website project formats remain unchanged. Device revision history remains the place to retrieve every saved version; the portable lineage holds only the immediately preceding source.

After the designer applies the new review, correspondence is recomputed from source identity and context. Matching RGB values never establish identity. The replay checks the actual selected colors, names, families, modes, scale anchors and governing rules. Existing gradient, extension and application engines recreate the original requests against the new model. Only exact compiled gradient paint, generated scale values and assessed component paint can return as restorable. The source and review hashes are new; the old hashes are never rewritten.

The application’s embedded extension is checked independently of the standalone extension. A failed application assessment stays failed and cannot gain export permission by reopening. Changing an unused color can preserve a result; changing a used anchor, reviewed role or relevant restriction makes the dependent result stale.

## Review and recovery

The new review starts unfinished. **Check previous designs** reports each saved output; **Restore available designs** installs only the available results. Saving and reopening retains the lineage and restored outputs. Editing the review or selected outputs invalidates the check. Source-update preflight and preservation share one cancellable local-save operation, so newer local opens, edits and source requests cannot be overwritten by an older update. Capacity or save failure leaves the old editor intact.

Extension proposal approvals are not copied. A standalone extension with pending decisions restores as a preview requiring review. A composition whose embedded extension requires renewed approval remains in history with an explicit rebuild instruction; this slice does not yet provide automatic restoration of that composition after renewal. Manual PDF witnesses still need confirmation against the changed PDF. Unsupported gradient forms and failed extension proposals are retained in history rather than automatically replayed.

## Verification

[The file-bound receipt](refresh-replay-checks.json) records runtime versions, checks and source hashes. Verification covers strict portable replay and tamper rejection, unchanged versus changed dependencies, new scope restrictions, pending extension decisions, distinct embedded extensions, actual PDF/Figma/website restore controls, save/reopen, stale edits, quota failure and cancellation. Existing storage and selected-output browser regressions remain required. Mobile restoration controls were inspected at 390px.

The exact-diff reuse, quality and efficiency reviews found and resolved an optional-editor guard, changed assignments hidden by pending approval, duplicated previous-source validation, stale acceptance ownership and cancellation. Browser verification caught and fixed a React key collision between restoration and design controls. The private rule-selector walk remains because it consumes the broader validated model-rule union; the existing source-definition mapper accepts a narrower authoring contract.

## Subsequent implementation

[Composition renewal](composition-refresh.md) closes the pending embedded-extension limitation recorded above. Its separate receipt covers retained blocked work, explicit decisions, exact paint, cancelled renewal and newer project operations. This original receipt remains evidence for its original revision.

## Remaining boundary

This is local implementation evidence using synthetic sources. It does not establish live connector/provider readiness, designer acceptance, assistive-technology qualification, integration or deployment. Multi-source refresh, manual PDF source-value continuity and broader generation remain under the original PRD. No external source or provider requests are made by these replay scenarios.
