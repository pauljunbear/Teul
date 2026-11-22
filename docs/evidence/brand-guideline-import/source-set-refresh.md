# Update one guideline in a combined project

This slice advances TASK-009, REQ-012 and AC-011 under DEC-021. Studio remains the standalone authoring tool. Figma plugin execution, a new capture or a provider call is not required to compare already reviewed sources, recover designs or export them.

## Behavior

Compare a replacement from its PDF/Figma/website review panel, or choose an updated reviewed project beside a source in Combine guidelines. The comparison shows changed evidence and authority, retained or suggested purpose matches, and reset value choices. Rejecting it leaves the complete current project unchanged. Acceptance first validates the new project and saves the current set in the existing device library. Save failure or cancellation prevents replacement.

Other source projects remain byte-exact. Choices carry forward only through unique source correspondence, unchanged selected modes and reviewed meaning. They remain editable intent; a fresh merged review is required. Authority changes affect the relevant source, including a losing member of a shared color purpose. Matching names, equal display hex and stable subject IDs do not establish continuity.

The V2 source-set envelope retains one flat V1 predecessor. Pending review and previous selected designs survive portable reopening without recursive history. Device history preserves earlier full revisions. Editing source modes, purposes or working use retains the comparison history but rechecks actual dependencies; adding/removing/replacing other source bytes removes that history. Existing single-source formats and source-set V1 remain strict.

After the fresh review, Check previous designs reuses the existing gradient, extension, composition and supporting-color replay engines. Restoration verifies source dependencies and exact selected paint; it never copies an old extension approval. Namespaced families avoid confusing unrelated sources with the same family label. Changed scale evidence prevents restoration even when the anchors are unchanged.

## Verification

The [source-bound receipt](source-set-refresh-checks.json) records commands, outputs, browser reports and source hashes. Node 22.13.1 and Node 24.19.0 each pass 604 Studio tests in 50 files, lint, typechecking and the enabled production build; the strengthened 10-case refresh suite was rerun after review. Each runtime also passes the production combined-guideline flow, real IndexedDB source-set storage, and existing native/composition refresh browser regressions. The new production suite reports no page errors or external requests. The Full + AI + Refactor PRD validator passes at the ready stage; the complete stage is intentionally not claimed.

The new unit cases cover all three source formats, unchanged evidence recapture, changed paint/family/authority, shared logical subjects, renewed scale evidence, edited purposes/use, corrupt lineage, forged review, cancellation and rejection of nested predecessors. Browser cases cover direct review-panel comparison, file comparison, rejection, save-before-accept, portable pending review, exact restored gradient export, failed/cancelled prerequisite saves and stale staged comparisons. A pinned V1-only source-set reader returns the new V2 project read-only. Desktop and 390 px comparison views are captured and inspected.

Reuse, quality and efficiency reviews found one material issue: hashing all embedded sources during each purpose keystroke. The fix compares the bounded existing source bindings during editing; save/reopen still perform full integrity validation. Review confirmed the fix. No broader cache or schema relaxation was introduced.

## Remaining boundary

Full AC-011 is open. Replay still compares every rule in the selected use context. A changed rule concerning only source A can conservatively prevent restoration of a source-B-only design. Before narrowing that behavior, prove actual before/after applicability while retaining global palette, required-role and zero-count constraints. Existing comparisons do not silently ignore such rules.

Synthetic palettes establish continuity and data recovery, not visual acceptance or brand authority. Live source/provider qualification, the real-brand evaluation corpus, broader integrated acceptance and release remain open. Changes are Studio-only; shared core/plugin behavior is unchanged, so plugin release gates are not part of this slice. Vite retains its existing large lazy Guidelines chunk warning. This is local implementation and verification, not integration, push, deployment or complete PRD acceptance.
