# Durable guideline request recovery

Status: implemented and locally verified. This closes the persistent-request portion of TASK-009 / REQ-013 and adds partial AC-012 evidence. It does not accept the full PRD or qualify a live provider, account, deployment or design direction.

## User behavior

Studio saves a recovery record before submitting PDF assistance, a Figma capture or a website capture. **Saved assistance/Figma/website requests** lists records for the authenticated account. Opening a PDF record restores the exact pre-assistance workspace, including its source, draft and selected designs; opening a capture reads its existing job. An uncertain submission uses the original request hash. Neither recovery path submits again or requires today's provider configuration.

Closing the page and changing the source stop local waiting. Remote cancellation remains explicit. Completed assistance stays recoverable after suggestions are applied. Restoring an earlier workspace does not attach it to an existing library save. The original request's consent is historical and cannot authorize new work. Starting an identical retained request explains how to open or remove its saved copy rather than overwriting it.

## Storage and publication boundaries

- Separate IndexedDB cache: eight entries, 32 MiB per entry, 64 MiB total. No eviction of unexpired evidence. A failed write prevents dispatch and leaves existing records intact.
- Known-format records expire after 24 hours; cleanup runs when Studio next checks the cache, including workspace mount. A closed browser cannot execute timed deletion. Unknown formats remain removable but never executable.
- This browser cache is not encrypted account storage. Pre-dispatch copy discloses retained input and workspace evidence, including selected page images. Removing a local copy does not cancel a remote job or delete a separately saved project.
- Immutable payloads retain exact input/profile/project bytes. Small metadata records hold job status, identity, expiry and revisions. Polling does not rewrite or load private payloads for revision checks.
- Opening validates original input hashes, strict source/project contracts, image-byte hashes, request scope and source binding. Account checks precede listing and opening. A final record check after authentication and result loading rejects another tab's update/deletion before editor publication.
- Source/draft/workspace identity is separate from the current UI operation. An older request can be checked or kept for later without applying its result to a new draft.

## Verification

The [file-bound companion receipt](durable-job-recovery-checks.json) records the exact tested sources, commands and artifacts. Browser tests use the actual local HTTP service, IndexedDB and Chromium; provider transport and sessions remain synthetic. No live private sources or model calls were used.

The storage journey checks exact legacy project bytes, account partitioning, metadata-only updates, cross-tab compare-and-swap, completed-job reload, atomic deletion, injected quota rollback, abort, entry/byte capacity, expiry, future formats and corrupt evidence. Assistance checks include unknown and completed requests after reload, reuse after applying suggestions, account switching, deletion during a delayed final account check, and storage failure before submission. Figma adds reload without provider reads and deletion during result arrival. Website adds reload and duplicate retained-request behavior. Existing cancellation, stale-source, portable export and narrow-screen checks remain in these journeys.

| Check                                     | Node 22.13.1                | Node 24.19.0                |
| ----------------------------------------- | --------------------------- | --------------------------- |
| Studio unit suite                         | 431 tests / 36 files passed | 431 tests / 36 files passed |
| Recovery storage browser journey          | 9 scenarios passed          | 9 scenarios passed          |
| PDF assistance browser journey            | 18 scenarios passed         | 18 scenarios passed         |
| Figma browser journey                     | 14 scenarios passed         | 14 scenarios passed         |
| Website browser journey                   | 11 scenarios passed         | 11 scenarios passed         |
| Guideline-enabled Studio production build | Passed                      | Passed                      |

Studio lint, root lint, root typecheck, Studio TypeScript build and strict ready-stage PRD validation pass. The dead-export report remains at the prior 50 exports / one file for consumer review; it is not deletion authority. Build chunk-size advisories remain. Browser harnesses run sequentially to avoid shared Vite-cache contention. A website assertion initially matched two status regions; it now targets the cancellation status. The new duplicate-request case exposed the misleading conflict message, which was corrected and retested. A 390px recovery view was visually inspected; no horizontal overflow was observed. This is local UI verification, not designer acceptance.

Three bounded simplify reviewers checked reuse, quality and efficiency. Findings were resolved: final publication checks now cover both capture results and post-authentication PDF restoration; stale capture locks release for reopening; status changes and revision checks use metadata only.

## Limits and next work

Local tests do not establish host identity security, OAuth qualification, renderer isolation, real model quality or human visual acceptance. The integrated Node 22/24 release gate has not been run for this slice. Source revision history, explicit refresh, broader generation/evaluation and the remaining PRD release gates stay open. The feature remains behind the existing guideline-import flag. Existing project/palette databases and old-format readers remain unchanged.
